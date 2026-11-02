# KavachAI — Full Stack Emergency Response Platform

## Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)

---

## 1. Start MongoDB
Make sure MongoDB is running locally on port 27017.
Or update `backend/.env` MONGO_URI with your Atlas connection string.

---

## 2. Setup & Run Backend

```bash
cd backend
npm install
npm run seed       # Creates demo users, ambulances, hospitals
npm run dev        # Starts backend on http://localhost:5000
```

---

## 3. Setup & Run Frontend

```bash
cd frontend
npm install
npm run dev        # Starts frontend on http://localhost:5173
```

---

## Demo Login Accounts

| Role           | Email                  | Password |
|----------------|------------------------|----------|
| Citizen        | citizen@demo.com       | demo123  |
| Dispatcher     | dispatcher@demo.com    | demo123  |
| Driver         | driver@demo.com        | demo123  |
| Hospital Admin | hospital@demo.com      | demo123  |

---

## How It Works

### Architecture
```
Browser (React) → Vite Dev Server (5173) → Proxy → Express API (5000) → MongoDB
                                                  ↕
                                            Socket.io (Real-time)
```

### Flow
1. **Citizen** registers/logs in → requests ambulance with GPS location
2. **Dispatcher** sees real-time alert via Socket.io → assigns ambulance + hospital
3. **Driver** sees active mission → updates status (dispatched → en route → arrived → resolved)
4. **Hospital Admin** sees incoming patient → manages bed availability

### ESP32 Helmet Integration
The ESP32 sketch performs crash detection locally and posts its SOS, GPS, buzzer,
and SMS-delivery status to the backend. The backend records SOS incidents as
regular accident emergencies, so they appear in the existing dispatcher UI;
the frontend and its visual design do not need changes.

Configure the backend `backend/.env` with:

```env
HELMET_DEVICE_KEY=<same private token configured in the sketch>
HELMET_DEVICE_USER_ID=<MongoDB _id of the citizen who wears this helmet>
```

Use the backend computer's LAN IP and port in the sketch's `SERVER_BASE`, for
example `http://192.168.1.20:5000` (not `localhost`, and not port `8000`). The
ESP32 and backend computer must be reachable on the same network. Keep the
device token, Wi-Fi password, and emergency phone numbers out of source control;
rotate any values that have already been shared.

The firmware routes are available under `/api/v1/device`; requests accept
`X-Device-Token` (or `X-Device-Key`). An SOS requires a usable current or
last-known GPS location and the configured citizen account.

### API Endpoints
- `POST /api/auth/register` — Register
- `POST /api/auth/login` — Login
- `GET  /api/auth/me` — Get current user
- `GET  /api/emergency` — List emergencies
- `POST /api/emergency` — Create emergency
- `PUT  /api/emergency/:id/dispatch` — Dispatch (dispatcher only)
- `PUT  /api/emergency/:id/status` — Update status
- `GET  /api/ambulance` — List ambulances
- `POST /api/ambulance` — Add ambulance
- `GET  /api/hospital` — List hospitals
- `POST /api/women-safety/sos` — Trigger SOS
- `GET  /api/women-safety/sos/my` — My SOS alerts

## Device API Service (FastAPI)

The independent device service lives in `device-service/`; it runs alongside,
and does not replace, the Express API or helmet AI service.

```powershell
cd device-service
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Set unique values for `BOOTSTRAP_ADMIN_KEY`, `DEVICE_SECRET_PEPPER`, and
`AUTH_TOKEN_SECRET` in `.env`. The local API docs are at
`http://127.0.0.1:8000/docs`; the health endpoint is
`http://127.0.0.1:8000/api/v1/health`. Development OTP is returned by the API
for testing only; no SMS is sent. The Render blueprint adds this as a separate
Docker service. Configure its `DATABASE_URL` to managed PostgreSQL and
`CORS_ORIGINS` to the exact dashboard origin before production use.

## Admin-only Helmet Access

The Helmet Monitor is available only at `/admin/helmet` to the two configured
admin accounts. Public registration always creates citizen accounts. Set
`ADMIN_EMAIL_1`, `ADMIN_PASSWORD_1`, `ADMIN_EMAIL_2`, and `ADMIN_PASSWORD_2`
in `backend/.env`; use two dedicated email addresses and different passwords
of at least 12 characters. Then run:

```powershell
cd backend
npm run setup:admins
```

This creates or updates the two configured accounts in MongoDB. Configure the
same four values in the production backend environment and run the setup
against that production database once. Never put admin passwords in frontend
environment variables or source control. Citizens and dispatchers receive
403 responses from helmet data endpoints.
