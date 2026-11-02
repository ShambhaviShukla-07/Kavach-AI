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
