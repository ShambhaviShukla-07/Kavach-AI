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
