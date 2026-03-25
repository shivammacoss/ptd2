"""Banners API — Active banners and click tracking."""
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from packages.common.src.database import get_db
from packages.common.src.models import Banner
from packages.common.src.auth import get_current_user

router = APIRouter()


@router.get("")
async def list_banners(
    page: str = Query("dashboard"),
    position: str = Query(None),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.utcnow()

    filters = [
        Banner.is_active == True,
        Banner.target_page == page,
        or_(Banner.starts_at == None, Banner.starts_at <= now),
        or_(Banner.ends_at == None, Banner.ends_at >= now),
        or_(
            Banner.target_audience == "all",
            Banner.target_audience == current_user["role"],
        ),
    ]
    if position:
        filters.append(Banner.position == position)

    result = await db.execute(
        select(Banner)
        .where(*filters)
        .order_by(Banner.priority.desc(), Banner.created_at.desc())
    )
    banners = result.scalars().all()

    return {
        "banners": [
            {
                "id": str(b.id),
                "title": b.title,
                "image_url": b.image_url,
                "link_url": b.link_url,
                "position": b.position,
                "priority": b.priority,
            }
            for b in banners
        ],
        "total": len(banners),
    }


@router.post("/{banner_id}/click")
async def track_click(
    banner_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Banner).where(Banner.id == banner_id, Banner.is_active == True)
    )
    banner = result.scalar_one_or_none()
    if not banner:
        raise HTTPException(status_code=404, detail="Banner not found")

    banner.click_count = (banner.click_count or 0) + 1
    await db.commit()

    return {"message": "Click tracked", "link_url": banner.link_url}
