"""Profile API — User profile, password change, sessions, KYC."""
import uuid as _uuid
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from packages.common.src.database import get_db
from packages.common.src.models import User, UserSession, KYCDocument
from packages.common.src.auth import get_current_user, verify_password, hash_password

UPLOAD_ROOT = Path("uploads/kyc")
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".pdf", ".webp"}
MAX_FILE_BYTES = 10 * 1024 * 1024  # 10 MB

VALID_DOC_TYPES = {
    "passport", "national_id", "driving_license",
    "proof_of_address", "selfie", "bank_statement",
}

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


# ── KYC ─────────────────────────────────────────────────────────────────────

@router.post("/kyc/submit")
async def submit_kyc(
    document_type: str = Form(...),
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a KYC document. Allowed when kyc_status is 'pending' (first time)
    or 'rejected' (reapplication). Blocked when 'under_review' or 'verified'."""
    user_id = current_user["user_id"]

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.kyc_status in ("under_review",):
        raise HTTPException(
            status_code=400,
            detail="Your documents are currently under review. Please wait.",
        )
    if user.kyc_status in ("verified", "approved"):
        raise HTTPException(status_code=400, detail="Your KYC is already verified.")

    # Validate document type
    if document_type not in VALID_DOC_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid document type. Allowed: {', '.join(sorted(VALID_DOC_TYPES))}",
        )

    # Validate file
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    suffix = Path(file.filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed. Upload JPG, PNG, PDF, or WEBP.",
        )

    content = await file.read()
    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 10 MB.")

    # Save file to disk
    user_upload_dir = UPLOAD_ROOT / str(user_id)
    user_upload_dir.mkdir(parents=True, exist_ok=True)
    safe_name = f"{document_type}_{_uuid.uuid4().hex}{suffix}"
    file_path = user_upload_dir / safe_name

    with open(file_path, "wb") as f:
        f.write(content)

    # Create KYCDocument record
    doc = KYCDocument(
        user_id=user_id,
        document_type=document_type,
        file_url=str(file_path),
        status="pending",
    )
    db.add(doc)

    # Reset user kyc_status to pending (covers reapplication)
    user.kyc_status = "pending"

    await db.commit()
    await db.refresh(doc)

    return {
        "message": "KYC document submitted successfully. We will review it within 1–2 business days.",
        "document_id": str(doc.id),
        "document_type": doc.document_type,
        "status": doc.status,
    }


@router.get("/kyc/file/{doc_id}")
async def get_kyc_file(
    doc_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Stream a KYC document file. Users can only access their own documents."""
    user_id = current_user["user_id"]
    result = await db.execute(
        select(KYCDocument).where(
            KYCDocument.id == doc_id,
            KYCDocument.user_id == user_id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    file_path = Path(doc.file_url)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on server")

    return FileResponse(str(file_path))
