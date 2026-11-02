from pathlib import Path

root = Path(".")
app = root / "app"
routers = app / "routers"

files = {
    "app/security.py": r'''
import hashlib, hmac, os, secrets

def hash_device_secret(secret: str) -> str:
    pepper = os.getenv("DEVICE_SECRET_PEPPER", "")
    if len(pepper) < 32:
        raise RuntimeError("Set DEVICE_SECRET_PEPPER to a random secret of at least 32 characters.")
    return hmac.new(pepper.encode(), secret.encode(), hashlib.sha256).hexdigest()

def verify_device_secret(secret: str, expected_hash: str) -> bool:
    try:
        return hmac.compare_digest(hash_device_secret(secret), expected_hash)
    except RuntimeError:
        return False

def generate_device_secret() -> str:
    return secrets.token_urlsafe(32)

def create_access_token(user_id: int) -> str:
    import base64, json, time
    key = os.getenv("AUTH_TOKEN_SECRET", "")
    if len(key) < 32:
        raise RuntimeError("AUTH_TOKEN_SECRET must be configured.")
    payload = json.dumps({"sub": user_id, "exp": int(time.time()) + 3600},
                         separators=(",", ":")).encode()
    body = base64.urlsafe_b64encode(payload).decode().rstrip("=")
    sig = hmac.new(key.encode(), body.encode(), hashlib.sha256).digest()
    signature = base64.urlsafe_b64encode(sig).decode().rstrip("=")
    return body + "." + signature

def verify_access_token(token: str) -> int | None:
    import base64, json, time
    key = os.getenv("AUTH_TOKEN_SECRET", "")
    if len(key) < 32 or "." not in token:
        return None
    body, signature = token.split(".", 1)
    expected = base64.urlsafe_b64encode(
        hmac.new(key.encode(), body.encode(), hashlib.sha256).digest()
    ).decode().rstrip("=")
    if not hmac.compare_digest(signature, expected):
        return None
    try:
        payload = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
        if int(payload["exp"]) <= int(time.time()):
            return None
        return int(payload["sub"])
    except (ValueError, KeyError, TypeError):
        return None
''',
    "app/dependencies.py": r'''
from fastapi import Header, HTTPException
import hmac
from app.settings import settings
from app.security import verify_access_token

def require_bootstrap_admin(x_admin_key: str | None = Header(default=None, alias="X-Admin-Key")):
    if not settings.bootstrap_admin_key:
        raise HTTPException(status_code=503, detail="Admin provisioning is not configured.")
    if not x_admin_key or not hmac.compare_digest(x_admin_key, settings.bootstrap_admin_key):
        raise HTTPException(status_code=401, detail="Invalid admin key.")

def require_user(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Login required.")
    user_id = verify_access_token(authorization[7:].strip())
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid or expired access token.")
    return user_id
''',
    "app/routers/auth.py": r'''
import os, secrets, time
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import User
from app.security import create_access_token

router = APIRouter(prefix="/auth", tags=["authentication"])
_pending = {}
_attempts = {}

class OTPRequest(BaseModel):
    mobile: str = Field(min_length=10, max_length=20, pattern=r"^\+?[0-9]{10,15}$")

class OTPVerify(BaseModel):
    mobile: str = Field(min_length=10, max_length=20, pattern=r"^\+?[0-9]{10,15}$")
    otp: str = Field(pattern=r"^[0-9]{6}$")

@router.post("/request-otp")
def request_otp(payload: OTPRequest):
    if os.getenv("ENVIRONMENT", "development").lower() != "development":
        raise HTTPException(status_code=403, detail="Development OTP is disabled.")
    now = time.time()
    mobile = payload.mobile
    recent = [t for t in _attempts.get(mobile, []) if now - t < 600]
    if len(recent) >= 3:
        raise HTTPException(status_code=429, detail="Too many OTP requests. Try again later.")
    recent.append(now)
    _attempts[mobile] = recent
    otp = f"{secrets.randbelow(1000000):06d}"
    _pending[mobile] = {"otp": otp, "expires": now + 300, "tries": 0}
    return {"message": "Development-only OTP generated; no SMS was sent.", "test_otp": otp,
            "expires_in_seconds": 300}

@router.post("/verify-otp")
def verify_otp(payload: OTPVerify, db: Session = Depends(get_db)):
    item = _pending.get(payload.mobile)
    if not item or time.time() > item["expires"]:
        _pending.pop(payload.mobile, None)
        raise HTTPException(status_code=400, detail="OTP missing or expired. Request a new one.")
    item["tries"] += 1
    if item["tries"] > 5:
        _pending.pop(payload.mobile, None)
        raise HTTPException(status_code=429, detail="Too many incorrect attempts.")
    if not secrets.compare_digest(payload.otp, item["otp"]):
        raise HTTPException(status_code=400, detail="Incorrect OTP.")
    _pending.pop(payload.mobile, None)
    user = db.query(User).filter(User.mobile == payload.mobile).first()
    if not user:
        user = User(mobile=payload.mobile, mobile_verified=True)
        db.add(user)
    else:
        user.mobile_verified = True
    db.commit()
    db.refresh(user)
    return {"access_token": create_access_token(user.id), "token_type": "bearer",
            "expires_in_seconds": 3600, "user_id": user.id}
''',
    "app/routers/devices.py": r'''
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
''',
    "app/main.py": r'''
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.db import Base, engine
from app.settings import settings
from app.routers import health, devices, telemetry, auth

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield

app = FastAPI(title="KavachAI API", version="0.2.0",
              description="KavachAI local development backend.", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Device-Token", "X-Admin-Key"]
)
app.include_router(health.router, prefix="/api/v1")
app.include_router(auth.router, prefix="/api/v1")
app.include_router(devices.router, prefix="/api/v1")
app.include_router(telemetry.router, prefix="/api/v1")
'''
}

for name, content in files.items():
    path = root / name
    path.write_text(content.lstrip(), encoding="utf-8")
    print("Updated:", name)

print("\nCode update complete. No database records were deleted.")
print("Development OTP is temporary/in-memory and is NOT real SMS.")
