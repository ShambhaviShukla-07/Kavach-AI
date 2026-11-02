
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Helmet, LocationEvent, Incident, IncidentEvent, SmsLog, DeviceStatus
from app.security import verify_device_secret
from app.dependencies import require_bootstrap_admin


router = APIRouter(prefix="/device", tags=["device telemetry"])


def authenticated_helmet(device_id, token, db):
    if not token:
        raise HTTPException(status_code=401, detail="Missing device credential.")

    helmet = db.query(Helmet).filter(
        Helmet.device_id == device_id
    ).first()

    if not helmet or not verify_device_secret(
        token, helmet.device_secret_hash
    ):
        raise HTTPException(status_code=401, detail="Invalid device credentials.")

    return helmet


# ---------------- REQUEST MODELS ----------------

class LocationPayload(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    gps_valid: bool = True
    speed_kmh: float | None = Field(default=None, ge=0, le=500)


class IncidentPayload(BaseModel):
    event_id: str = Field(min_length=8, max_length=64)
    event_type: str = Field(pattern=r"^(SOS|ACCIDENT)$")
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    details: str | None = Field(default=None, max_length=1000)


class SmsStatusPayload(BaseModel):
    
    event_id: str = Field(min_length=8, max_length=64)
    contact_index: int = Field(ge=1, le=3)
    contact_number: str = Field(min_length=7, max_length=20)
    status: str = Field(pattern=r"^(SENT|FAILED)$")
    modem_response: str | None = Field(default=None, max_length=500)

class IncidentStatusPayload(BaseModel):
    status: str = Field(
        pattern=r"^(OPEN|ACKNOWLEDGED|RESOLVED)$"
    )


# ---------------- ESP32 APIs ----------------

@router.post("/{device_id}/location")
def post_location(
    device_id: str,
    payload: LocationPayload,
    x_device_token: str | None = Header(default=None, alias="X-Device-Token"),
    db: Session = Depends(get_db)
):
    authenticated_helmet(device_id, x_device_token, db)

    if not payload.gps_valid:
        raise HTTPException(
            status_code=422,
            detail="Only valid GPS coordinates can be saved as a location."
        )

    event = LocationEvent(device_id=device_id, **payload.model_dump())
    db.add(event)
    db.commit()
    db.refresh(event)

    return {
        "accepted": True,
        "device_id": device_id,
        "location_event_id": event.id
    }


@router.post("/{device_id}/incidents")
def post_incident(
    device_id: str,
    payload: IncidentPayload,
    x_device_token: str | None = Header(default=None, alias="X-Device-Token"),
    db: Session = Depends(get_db)
):
    authenticated_helmet(device_id, x_device_token, db)

    if (payload.latitude is None) != (payload.longitude is None):
        raise HTTPException(
            status_code=422,
            detail="Latitude and longitude must both be provided or both be null."
        )

    old = db.query(Incident).filter(
        Incident.event_id == payload.event_id
    ).first()

    if old:
        return {
            "accepted": True,
            "duplicate": True,
            "incident_id": old.id
        }

    incident = Incident(device_id=device_id, **payload.model_dump())
    db.add(incident)
    db.flush()
    db.add(IncidentEvent(incident_id=incident.id, status="OPEN"))
    db.commit()
    db.refresh(incident)

    return {
        "accepted": True,
        "duplicate": False,
        "incident_id": incident.id,
        "status": incident.status
    }


@router.post("/{device_id}/sms-status")
def post_sms_status(
    device_id: str,
    payload: SmsStatusPayload,
    x_device_token: str | None = Header(default=None, alias="X-Device-Token"),
    db: Session = Depends(get_db)
):
    authenticated_helmet(device_id, x_device_token, db)

    incident = db.query(Incident).filter(
        Incident.event_id == payload.event_id,
        Incident.device_id == device_id
    ).first()

    if not incident:
        raise HTTPException(status_code=404, detail="SOS incident not found.")

    log = db.query(SmsLog).filter(
        SmsLog.event_id == payload.event_id,
        SmsLog.contact_index == payload.contact_index
    ).first()

    if log is None:
        log = SmsLog(
            event_id=payload.event_id,
            device_id=device_id,
            contact_index=payload.contact_index,
            contact_number=payload.contact_number,
            status=payload.status,
            modem_response=payload.modem_response
        )
        db.add(log)
    else:
        log.contact_number = payload.contact_number
        log.status = payload.status
        log.modem_response = payload.modem_response
        log.created_at = datetime.now(timezone.utc)

    db.commit()

    return {
        "accepted": True,
        "event_id": payload.event_id,
        "contact_index": payload.contact_index,
        "status": payload.status
    }

class BuzzerStatusPayload(BaseModel):
    buzzer_active: bool


@router.post("/{device_id}/buzzer-status")
def update_buzzer_status(
    device_id: str,
    payload: BuzzerStatusPayload,
    x_device_token: str | None = Header(
        default=None,
        alias="X-Device-Token"
    ),
    db: Session = Depends(get_db)
):
    authenticated_helmet(device_id, x_device_token, db)

    status = db.query(DeviceStatus).filter(
        DeviceStatus.device_id == device_id
    ).first()

    if status is None:
        status = DeviceStatus(
            device_id=device_id,
            buzzer_active=payload.buzzer_active
        )
        db.add(status)
    else:
        status.buzzer_active = payload.buzzer_active
        status.updated_at = datetime.now(timezone.utc)

    db.commit()

    return {
        "accepted": True,
        "device_id": device_id,
        "buzzer_active": status.buzzer_active
    }
# ---------------- ESP32 SERVER-FETCH API ----------------

@router.get("/{device_id}/location/latest-for-device")
def get_latest_location_for_device(
    device_id: str,
    x_device_token: str | None = Header(default=None, alias="X-Device-Token"),
    db: Session = Depends(get_db)
):
    """
    ESP32 uses this endpoint during SOS if its current GPS fix is unavailable.
    The endpoint returns the latest valid GPS point previously saved by this helmet.
    """
    authenticated_helmet(device_id, x_device_token, db)

    location = db.query(LocationEvent).filter(
        LocationEvent.device_id == device_id,
        LocationEvent.gps_valid.is_(True)
    ).order_by(
        LocationEvent.recorded_at.desc(),
        LocationEvent.id.desc()
    ).first()

    if location is None:
        return {
            "device_id": device_id,
            "gps_valid": False,
            "latitude": None,
            "longitude": None,
            "recorded_at": None
        }

    return {
        "device_id": device_id,
        "gps_valid": True,
        "latitude": location.latitude,
        "longitude": location.longitude,
        "recorded_at": (
            location.recorded_at.isoformat()
            if location.recorded_at else None
        )
    }


# ---------------- DASHBOARD APIs ----------------

NEXT_INCIDENT_STATUS = {"OPEN": "ACKNOWLEDGED", "ACKNOWLEDGED": "RESOLVED"}


def _iso(value):
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


def _incident_history(incident, events):
    history = [
        {"status": event.status, "changed_at": _iso(event.changed_at)}
        for event in sorted(events, key=lambda e: (e.changed_at, e.id))
    ]
    if not any(item["status"] == "OPEN" for item in history):
        history.insert(0, {"status": "OPEN", "changed_at": _iso(incident.created_at)})
    return history

@router.get("/dashboard/helmets")
def dashboard_helmets(
    admin=Depends(require_bootstrap_admin),
    db: Session = Depends(get_db)
):
    helmets = db.query(Helmet).order_by(Helmet.device_id).all()
    result = []

    for helmet in helmets:
        last_location = db.query(LocationEvent).filter(
            LocationEvent.device_id == helmet.device_id
        ).order_by(
            LocationEvent.recorded_at.desc(),
            LocationEvent.id.desc()
        ).first()

        online = False
        if last_location:
            recorded = last_location.recorded_at
            if recorded.tzinfo is None:
                recorded = recorded.replace(tzinfo=timezone.utc)
            online = (
                datetime.now(timezone.utc) - recorded
            ).total_seconds() <= 90

        result.append({
            "buzzer_active": (
    db.query(DeviceStatus).filter(
        DeviceStatus.device_id == helmet.device_id
    ).first().buzzer_active
    if db.query(DeviceStatus).filter(
        DeviceStatus.device_id == helmet.device_id
    ).first()
    else False
),
            "device_id": helmet.device_id,
            "display_name": helmet.display_name or helmet.device_id,
            "online": online,
            "last_location_time": (
                last_location.recorded_at if last_location else None
            )
        })

    return {"count": len(result), "helmets": result}


@router.get("/dashboard/{device_id}/locations")
def dashboard_locations(
    device_id: str,
    admin=Depends(require_bootstrap_admin),
    db: Session = Depends(get_db)
):
    helmet = db.query(Helmet).filter(
        Helmet.device_id == device_id
    ).first()

    if not helmet:
        raise HTTPException(status_code=404, detail="Helmet not found.")

    cutoff = datetime.now(timezone.utc) - timedelta(minutes=5)

    locations = db.query(LocationEvent).filter(
        LocationEvent.device_id == device_id,
        LocationEvent.recorded_at >= cutoff,
        LocationEvent.gps_valid.is_(True)
    ).order_by(LocationEvent.recorded_at.asc()).all()

    return {
        "device_id": device_id,
        "count": len(locations),
        "locations": [
            {
                "latitude": item.latitude,
                "longitude": item.longitude,
                "speed_kmh": item.speed_kmh,
                "recorded_at": item.recorded_at
            }
            for item in locations
        ]
    }


@router.get("/dashboard/{device_id}/incidents")
def dashboard_incidents(
    device_id: str,
    admin=Depends(require_bootstrap_admin),
    db: Session = Depends(get_db)
):
    incidents = db.query(Incident).filter(
        Incident.device_id == device_id
    ).order_by(
        Incident.created_at.desc(),
        Incident.id.desc()
    ).limit(50).all()

    events_by_incident = {}
    if incidents:
        rows = db.query(IncidentEvent).filter(
            IncidentEvent.incident_id.in_([item.id for item in incidents])
        ).all()
        for row in rows:
            events_by_incident.setdefault(row.incident_id, []).append(row)

    return {
        "device_id": device_id,
        "count": len(incidents),
        "incidents": [
            {
                "incident_id": item.id,
                "event_id": item.event_id,
                "event_type": item.event_type,
                "alert_label": (
                    "ACCIDENT DETECTED"
                    if item.event_type == "ACCIDENT"
                    else "SOS ALERT"
                ),
                "is_accident": item.event_type == "ACCIDENT",
                "latitude": item.latitude,
                "longitude": item.longitude,
                "status": item.status,
                "details": item.details,
                "created_at": item.created_at.isoformat() if item.created_at else None,
                "history": _incident_history(
                    item, events_by_incident.get(item.id, [])
                )
            }
            for item in incidents
        ]
    }


@router.get("/dashboard/{device_id}/sms-logs")
def dashboard_sms_logs(
    device_id: str,
    admin=Depends(require_bootstrap_admin),
    db: Session = Depends(get_db)
):
    logs = db.query(SmsLog).filter(
        SmsLog.device_id == device_id
    ).order_by(
        SmsLog.created_at.desc(),
        SmsLog.id.desc()
    ).limit(100).all()

    return {
        "device_id": device_id,
        "count": len(logs),
        "sms_logs": [
            {
                "event_id": item.event_id,
                "contact_index": item.contact_index,
                "contact_number": item.contact_number,
                "status": item.status,
                "modem_response": item.modem_response,
                "created_at": item.created_at
            }
            for item in logs
        ]
    }

# ---------------- ADMIN INCIDENT MANAGEMENT API ----------------

@router.patch("/dashboard/incidents/{incident_id}/status")
def update_incident_status(
    incident_id: int,
    payload: IncidentStatusPayload,
    admin=Depends(require_bootstrap_admin),
    db: Session = Depends(get_db)
):
    incident = db.query(Incident).filter(
        Incident.id == incident_id
    ).first()

    if incident is None:
        raise HTTPException(
            status_code=404,
            detail="Incident not found."
        )

    if payload.status != incident.status:
        if NEXT_INCIDENT_STATUS.get(incident.status) != payload.status:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Cannot change SOS from {incident.status} to {payload.status}. "
                    "Order is OPEN, ACKNOWLEDGED, RESOLVED."
                )
            )

        db.add(IncidentEvent(incident_id=incident.id, status=payload.status))
        incident.status = payload.status

    db.commit()
    db.refresh(incident)

    return {
        "updated": True,
        "incident_id": incident.id,
        "event_id": incident.event_id,
        "status": incident.status
    }
