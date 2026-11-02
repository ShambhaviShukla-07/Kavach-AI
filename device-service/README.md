# KavachAI Device API

This FastAPI service provides device provisioning, OTP authentication, helmet
claiming, GPS/SOS telemetry, and dashboard telemetry endpoints. It runs
separately from the Express API and the helmet AI inference service.

## Local Development

From this directory in PowerShell:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Set unique random values for `BOOTSTRAP_ADMIN_KEY`, `DEVICE_SECRET_PEPPER`,
and `AUTH_TOKEN_SECRET` in `.env`, then start the server:

```powershell
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Interactive API docs: `http://127.0.0.1:8000/docs`  
Health check: `http://127.0.0.1:8000/api/v1/health`

The OTP flow is development-only and does not send SMS. The included
`setup_auth.py` helper has already been applied to this copy; it rewrites app
modules and should not be rerun as part of normal startup.

## Production

Use managed PostgreSQL by setting `DATABASE_URL`, set `ENVIRONMENT=production`,
and restrict `CORS_ORIGINS` to the dashboard's exact HTTPS origin. Configure
all secrets in the hosting provider, use HTTPS, and do not commit `.env` or
database files. OTP login is disabled outside development until a verified
SMS provider is integrated.