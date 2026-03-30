import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from packages.common.src.database import get_db
from dependencies import require_permission, write_audit_log
from packages.common.src.models import User, KYCDocument

router = APIRouter(prefix="/kyc", tags=["KYC"])


class ApproveKYCRequest(BaseModel):
    reason: Optional[str] = None


class RejectKYCRequest(BaseModel):
    reason: str


@router.get("/pending")
async def list_pending_kyc(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    admin: User = Depends(require_permission("kyc.view")),
    db: AsyncSession = Depends(get_db),
):
    """List all users with pending KYC submissions"""
    query = select(User).where(User.kyc_status == "submitted")
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    query = query.order_by(User.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    users = result.scalars().all()

    items = []
    for u in users:
        # Get KYC documents for this user
        docs_q = await db.execute(
            select(KYCDocument).where(KYCDocument.user_id == u.id).order_by(KYCDocument.created_at.desc())
        )
        docs = docs_q.scalars().all()

        items.append({
            "id": str(u.id),
            "email": u.email,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "phone": u.phone,
            "date_of_birth": u.date_of_birth.isoformat() if u.date_of_birth else None,
            "country": u.country,
            "address": u.address,
            "kyc_status": u.kyc_status,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "documents": [
                {
                    "id": str(doc.id),
                    "document_type": doc.document_type,
                    "file_url": doc.file_url,
                    "status": doc.status,
                    "created_at": doc.created_at.isoformat() if doc.created_at else None,
                }
                for doc in docs
            ],
        })

    return {"items": items, "total": total, "page": page, "per_page": per_page}


@router.get("/approved")
async def list_approved_kyc(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    admin: User = Depends(require_permission("kyc.view")),
    db: AsyncSession = Depends(get_db),
):
    """List all users with approved KYC"""
    query = select(User).where(User.kyc_status == "approved")
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    query = query.order_by(User.updated_at.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    users = result.scalars().all()

    items = []
    for u in users:
        # Get approved KYC documents
        docs_q = await db.execute(
            select(KYCDocument).where(
                KYCDocument.user_id == u.id,
                KYCDocument.status == "approved"
            ).order_by(KYCDocument.reviewed_at.desc())
        )
        docs = docs_q.scalars().all()

        items.append({
            "id": str(u.id),
            "email": u.email,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "phone": u.phone,
            "country": u.country,
            "kyc_status": u.kyc_status,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "approved_at": u.updated_at.isoformat() if u.updated_at else None,
            "documents": [
                {
                    "id": str(doc.id),
                    "document_type": doc.document_type,
                    "file_url": doc.file_url,
                    "status": doc.status,
                    "reviewed_at": doc.reviewed_at.isoformat() if doc.reviewed_at else None,
                }
                for doc in docs
            ],
        })

    return {"items": items, "total": total, "page": page, "per_page": per_page}


@router.get("/rejected")
async def list_rejected_kyc(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    admin: User = Depends(require_permission("kyc.view")),
    db: AsyncSession = Depends(get_db),
):
    """List all users with rejected KYC"""
    query = select(User).where(User.kyc_status == "rejected")
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    query = query.order_by(User.updated_at.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    users = result.scalars().all()

    items = []
    for u in users:
        docs_q = await db.execute(
            select(KYCDocument).where(KYCDocument.user_id == u.id).order_by(KYCDocument.created_at.desc())
        )
        docs = docs_q.scalars().all()

        items.append({
            "id": str(u.id),
            "email": u.email,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "phone": u.phone,
            "country": u.country,
            "kyc_status": u.kyc_status,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "documents": [
                {
                    "id": str(doc.id),
                    "document_type": doc.document_type,
                    "file_url": doc.file_url,
                    "status": doc.status,
                    "rejection_reason": doc.rejection_reason,
                    "reviewed_at": doc.reviewed_at.isoformat() if doc.reviewed_at else None,
                }
                for doc in docs
            ],
        })

    return {"items": items, "total": total, "page": page, "per_page": per_page}


@router.post("/{user_id}/approve")
async def approve_kyc(
    user_id: uuid.UUID,
    body: ApproveKYCRequest,
    request: Request,
    admin: User = Depends(require_permission("kyc.manage")),
    db: AsyncSession = Depends(get_db),
):
    """Approve user KYC"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.kyc_status != "submitted":
        raise HTTPException(status_code=400, detail="KYC is not in submitted status")

    # Update user KYC status
    user.kyc_status = "approved"
    user.updated_at = datetime.utcnow()

    # Approve all pending documents
    docs_q = await db.execute(
        select(KYCDocument).where(
            KYCDocument.user_id == user_id,
            KYCDocument.status == "pending"
        )
    )
    docs = docs_q.scalars().all()
    for doc in docs:
        doc.status = "approved"
        doc.reviewed_by = admin.id
        doc.reviewed_at = datetime.utcnow()

    await write_audit_log(
        db, admin.id, "approve_kyc", "user", user_id,
        new_values={"kyc_status": "approved"},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return {"message": "KYC approved successfully"}


@router.post("/{user_id}/reject")
async def reject_kyc(
    user_id: uuid.UUID,
    body: RejectKYCRequest,
    request: Request,
    admin: User = Depends(require_permission("kyc.manage")),
    db: AsyncSession = Depends(get_db),
):
    """Reject user KYC"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.kyc_status != "submitted":
        raise HTTPException(status_code=400, detail="KYC is not in submitted status")

    # Update user KYC status
    user.kyc_status = "rejected"
    user.updated_at = datetime.utcnow()

    # Reject all pending documents
    docs_q = await db.execute(
        select(KYCDocument).where(
            KYCDocument.user_id == user_id,
            KYCDocument.status == "pending"
        )
    )
    docs = docs_q.scalars().all()
    for doc in docs:
        doc.status = "rejected"
        doc.reviewed_by = admin.id
        doc.reviewed_at = datetime.utcnow()
        doc.rejection_reason = body.reason

    await write_audit_log(
        db, admin.id, "reject_kyc", "user", user_id,
        new_values={"kyc_status": "rejected", "reason": body.reason},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return {"message": "KYC rejected"}
