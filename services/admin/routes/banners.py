import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_admin, require_permission, write_audit_log
from models import User, Banner
from schemas import BannerIn, BannerOut

router = APIRouter(prefix="/banners", tags=["Banners"])


@router.get("")
async def list_banners(
    admin: User = Depends(require_permission("banners.view")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Banner).order_by(Banner.priority.desc(), Banner.created_at.desc())
    )
    banners = result.scalars().all()
    return [
        BannerOut(
            id=str(b.id),
            title=b.title,
            image_url=b.image_url,
            link_url=b.link_url,
            target_page=b.target_page or "dashboard",
            position=b.position or "top",
            target_audience=b.target_audience or "all",
            priority=b.priority or 0,
            starts_at=b.starts_at,
            ends_at=b.ends_at,
            is_active=b.is_active,
            click_count=b.click_count or 0,
            created_at=b.created_at,
        )
        for b in banners
    ]


@router.post("")
async def create_banner(
    body: BannerIn,
    request: Request,
    admin: User = Depends(require_permission("banners.create")),
    db: AsyncSession = Depends(get_db),
):
    banner = Banner(
        title=body.title,
        image_url=body.image_url,
        link_url=body.link_url,
        target_page=body.target_page,
        position=body.position,
        target_audience=body.target_audience,
        priority=body.priority,
        starts_at=body.starts_at,
        ends_at=body.ends_at,
        is_active=body.is_active,
    )
    db.add(banner)
    await db.flush()

    await write_audit_log(
        db, admin.id, "create_banner", "banner", banner.id,
        new_values={"title": body.title, "position": body.position},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return {"message": "Banner created", "id": str(banner.id)}


@router.put("/{banner_id}")
async def update_banner(
    banner_id: uuid.UUID,
    body: BannerIn,
    request: Request,
    admin: User = Depends(require_permission("banners.update")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Banner).where(Banner.id == banner_id))
    banner = result.scalar_one_or_none()
    if not banner:
        raise HTTPException(status_code=404, detail="Banner not found")

    old_values = {"title": banner.title, "is_active": banner.is_active}

    banner.title = body.title
    banner.image_url = body.image_url
    banner.link_url = body.link_url
    banner.target_page = body.target_page
    banner.position = body.position
    banner.target_audience = body.target_audience
    banner.priority = body.priority
    banner.starts_at = body.starts_at
    banner.ends_at = body.ends_at
    banner.is_active = body.is_active

    await write_audit_log(
        db, admin.id, "update_banner", "banner", banner_id,
        old_values=old_values,
        new_values={"title": body.title, "is_active": body.is_active},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return {"message": "Banner updated"}


@router.delete("/{banner_id}")
async def delete_banner(
    banner_id: uuid.UUID,
    request: Request,
    admin: User = Depends(require_permission("banners.delete")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Banner).where(Banner.id == banner_id))
    banner = result.scalar_one_or_none()
    if not banner:
        raise HTTPException(status_code=404, detail="Banner not found")

    banner.is_active = False

    await write_audit_log(
        db, admin.id, "delete_banner", "banner", banner_id,
        new_values={"is_active": False},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return {"message": "Banner deactivated"}
