
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import EmergencyContact
from app.dependencies import require_user

router = APIRouter(prefix="/contacts", tags=["emergency contacts"])


class ContactPayload(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    mobile: str = Field(pattern=r"^\+?[0-9]{10,15}$")
    relationship: str | None = Field(default=None, max_length=40)


@router.post("")
def add_contact(
    payload: ContactPayload,
    user_id: int = Depends(require_user),
    db: Session = Depends(get_db)
):
    existing = db.query(EmergencyContact).filter(
        EmergencyContact.user_id == user_id,
        EmergencyContact.mobile == payload.mobile
    ).first()

    if existing:
        raise HTTPException(
            status_code=409,
            detail="This contact already exists."
        )

    contact = EmergencyContact(
        user_id=user_id,
        **payload.model_dump()
    )

    db.add(contact)
    db.commit()
    db.refresh(contact)

    return {
        "message": "Emergency contact added.",
        "contact_id": contact.id,
        "name": contact.name,
        "mobile": contact.mobile,
        "relationship": contact.relationship
    }


@router.get("")
def list_contacts(
    user_id: int = Depends(require_user),
    db: Session = Depends(get_db)
):
    contacts = db.query(EmergencyContact).filter(
        EmergencyContact.user_id == user_id
    ).order_by(EmergencyContact.id).all()

    return {
        "count": len(contacts),
        "contacts": [
            {
                "contact_id": c.id,
                "name": c.name,
                "mobile": c.mobile,
                "relationship": c.relationship
            }
            for c in contacts
        ]
    }


@router.delete("/{contact_id}")
def delete_contact(
    contact_id: int,
    user_id: int = Depends(require_user),
    db: Session = Depends(get_db)
):
    contact = db.query(EmergencyContact).filter(
        EmergencyContact.id == contact_id,
        EmergencyContact.user_id == user_id
    ).first()

    if not contact:
        raise HTTPException(
            status_code=404,
            detail="Emergency contact not found."
        )

    db.delete(contact)
    db.commit()

    return {"message": "Emergency contact deleted."}
