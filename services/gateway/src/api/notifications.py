"""Notifications API — List, read, unread count."""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from packages.common.src.database import get_db
from packages.common.src.models import Notification
from packages.common.src.auth import get_current_user

router = APIRouter()


@router.get("")
async def list_notifications(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    type: str = Query(None),
    is_read: bool = Query(None),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    base_filter = [Notification.user_id == current_user["user_id"]]
    if type:
        base_filter.append(Notification.type == type)
    if is_read is not None:
        base_filter.append(Notification.is_read == is_read)

    count_result = await db.execute(
        select(func.count()).select_from(Notification).where(*base_filter)
    )
    total = count_result.scalar()

    result = await db.execute(
        select(Notification)
        .where(*base_filter)
        .order_by(Notification.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    notifications = result.scalars().all()

    items = [
        {
            "id": str(n.id),
            "title": n.title,
            "message": n.message,
            "type": n.type,
            "is_read": n.is_read,
            "action_url": n.action_url,
            "created_at": n.created_at.isoformat() if n.created_at else None,
        }
        for n in notifications
    ]

    return {
        "items": items,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page if total else 0,
    }


@router.put("/{notification_id}/read")
async def mark_as_read(
    notification_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == current_user["user_id"],
        )
    )
    notification = result.scalar_one_or_none()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    notification.is_read = True
    await db.commit()

    return {"message": "Marked as read", "id": str(notification_id)}


@router.put("/read-all")
async def mark_all_read(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        update(Notification)
        .where(
            Notification.user_id == current_user["user_id"],
            Notification.is_read == False,
        )
        .values(is_read=True)
    )
    await db.commit()

    return {"message": "All notifications marked as read"}


@router.get("/unread-count")
async def unread_count(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(func.count()).select_from(Notification).where(
            Notification.user_id == current_user["user_id"],
            Notification.is_read == False,
        )
    )
    count = result.scalar()

    return {"unread_count": count}
