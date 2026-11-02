from fastapi import APIRouter
from datetime import datetime, timezone
router=APIRouter(tags=["health"])
@router.get("/health")
def health(): return {"service":"KavachAI API","status":"ok","utc":datetime.now(timezone.utc).isoformat()}
