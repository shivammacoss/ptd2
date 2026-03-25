"""Profile API — User profile, password change, sessions."""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from packages.common.src.database import get_db
from packages.common.src.models import User, UserSession, KYCDocument
from packages.common.src.auth import get_current_user, verify_password, hash_password

router = APIRouter()


class UpdateProfileRequest(BaseModel):
    first_name: str | None = Field(None, max_length=100)
    last_name: str | None = Field(None, max_length=100)
    phone: str | None = Field(None, max_length=20)
    country: str | None = Field(None, max_length=100)
    address: str | None = None
    language: str | None = Field(None, max_length=10)
    theme: str | None = Field(None, pattern="^(light|dark)$")
    date_of_birth: str | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8, max_length=128)


@router.get("")
async def get_profile(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).where(User.id == current_user["user_id"])
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    kyc_result = await db.execute(
        select(KYCDocument)
        .where(KYCDocument.user_id == user.id)
        .order_by(KYCDocument.created_at.desc())
    )
    kyc_docs = kyc_result.scalars().all()

    kyc_documents = [
        {
            "id": str(doc.id),
            "document_type": doc.document_type,
            "status": doc.status,
            "rejection_reason": doc.rejection_reason,
            "created_at": doc.created_at.isoformat() if doc.created_at else None,
        }
        for doc in kyc_docs
    ]

    return {
        "id": str(user.id),
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "phone": user.phone,
        "country": user.country,
        "address": user.address,
        "date_of_birth": user.date_of_birth.isoformat() if user.date_of_birth else None,
        "role": user.role,
        "status": user.status,
        "kyc_status": user.kyc_status,
        "two_factor_enabled": user.two_factor_enabled,
        "language": user.language,
        "theme": user.theme,
        "kyc_documents": kyc_documents,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


@router.put("")
async def update_profile(
    req: UpdateProfileRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).where(User.id == current_user["user_id"])
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = req.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if value is not None:
            setattr(user, field, value)

    await db.commit()
    await db.refresh(user)

    return {
        "id": str(user.id),
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "phone": user.phone,
        "country": user.country,
        "address": user.address,
        "language": user.language,
        "theme": user.theme,
        "message": "Profile updated",
    }


@router.put("/password")
async def change_password(
    req: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).where(User.id == current_user["user_id"])
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not verify_password(req.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    if req.current_password == req.new_password:
        raise HTTPException(status_code=400, detail="New password must be different")

    user.password_hash = hash_password(req.new_password)
    await db.commit()

    return {"message": "Password changed successfully"}


@router.get("/sessions")
async def list_sessions(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserSession)
        .where(
            UserSession.user_id == current_user["user_id"],
            UserSession.is_active == True,
        )
        .order_by(UserSession.created_at.desc())
    )
    sessions = result.scalars().all()

    return {
        "sessions": [
            {
                "id": str(s.id),
                "ip_address": str(s.ip_address) if s.ip_address else None,
                "user_agent": s.user_agent,
                "device_info": s.device_info,
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "expires_at": s.expires_at.isoformat() if s.expires_at else None,
            }
            for s in sessions
        ],
        "total": len(sessions),
    }


@router.delete("/sessions/{session_id}")
async def terminate_session(
    session_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserSession).where(
            UserSession.id == session_id,
            UserSession.user_id == current_user["user_id"],
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if not session.is_active:
        raise HTTPException(status_code=400, detail="Session already terminated")

    session.is_active = False
    await db.commit()

    return {"message": "Session terminated", "session_id": str(session_id)}
