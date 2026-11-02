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
