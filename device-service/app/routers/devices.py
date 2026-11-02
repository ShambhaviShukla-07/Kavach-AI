from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import update
from app.db import get_db
from app.models import Helmet, User
from app.dependencies import require_bootstrap_admin, require_user
from app.security import hash_device_secret, generate_device_secret, verify_device_secret

router = APIRouter(prefix="/devices", tags=["devices"])

class ProvisionRequest(BaseModel):
    device_id: str = Field(pattern=r"^H[0-9]{1,6}$")
    display_name: str | None = Field(default=None, max_length=80)

class ClaimRequest(BaseModel):
    device_secret: str = Field(min_length=20, max_length=200)
    display_name: str | None = Field(default=None, max_length=80)

@router.post("/provision", dependencies=[Depends(require_bootstrap_admin)])
def provision_device(payload: ProvisionRequest, db: Session = Depends(get_db)):
    if db.query(Helmet).filter(Helmet.device_id == payload.device_id).first():
        raise HTTPException(status_code=409, detail="Helmet ID already provisioned.")
    secret = generate_device_secret()
    helmet = Helmet(device_id=payload.device_id, display_name=payload.display_name,
                    device_secret_hash=hash_device_secret(secret), status="AVAILABLE")
    db.add(helmet)
    db.commit()
    return {"device_id": helmet.device_id, "status": helmet.status,
            "device_secret": secret, "warning": "Save this secret securely; shown only once."}

@router.get("", dependencies=[Depends(require_bootstrap_admin)])
def list_devices(db: Session = Depends(get_db)):
    helmets = db.query(Helmet).order_by(Helmet.device_id).all()
    return [{"device_id": h.device_id, "display_name": h.display_name,
             "status": h.status, "owner_user_id": h.owner_user_id} for h in helmets]

@router.post("/{device_id}/claim")
def claim_device(device_id: str, payload: ClaimRequest,
                 user_id: int = Depends(require_user), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id, User.mobile_verified.is_(True)).first()
    if not user:
        raise HTTPException(status_code=401, detail="Verified user session required.")
    helmet = db.query(Helmet).filter(Helmet.device_id == device_id).first()
    if not helmet:
        raise HTTPException(status_code=404, detail="Helmet not found.")
    if not verify_device_secret(payload.device_secret, helmet.device_secret_hash):
        raise HTTPException(status_code=403, detail="Invalid helmet secret.")
    changes = {"owner_user_id": user_id, "status": "ASSIGNED"}
    if payload.display_name is not None:
        changes["display_name"] = payload.display_name
    result = db.execute(
        update(Helmet).where(
            Helmet.id == helmet.id,
            Helmet.owner_user_id.is_(None),
            Helmet.status == "AVAILABLE"
        ).values(**changes)
    )
    if result.rowcount != 1:
        db.rollback()
        raise HTTPException(status_code=409, detail="Helmet is already assigned or unavailable.")
    db.commit()
    return {"device_id": device_id, "status": "ASSIGNED", "owner_user_id": user_id,
            "display_name": payload.display_name or helmet.display_name}
