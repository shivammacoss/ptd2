import uuid
import secrets
import string
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_admin, require_permission, write_audit_log
from models import (
    User, IBApplication, IBProfile, IBCommission, Referral,
    IBCommissionPlan, SystemSetting,
)
from schemas import (
    IBApplicationOut, IBProfileOut, PaginatedResponse,
    MLMConfigOut, MLMConfigIn,
)

router = APIRouter(prefix="/business", tags=["Business"])


@router.get("/ib/applications")
async def list_ib_applications(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status_filter: str = Query(None, alias="status"),
    admin: User = Depends(require_permission("ib.view")),
    db: AsyncSession = Depends(get_db),
):
    query = select(IBApplication)
    if status_filter:
        query = query.where(IBApplication.status == status_filter)

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    query = query.order_by(IBApplication.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    apps = result.scalars().all()

    items = []
    for app in apps:
        user_q = await db.execute(select(User).where(User.id == app.user_id))
        user = user_q.scalar_one_or_none()
        items.append(IBApplicationOut(
            id=str(app.id),
            user_id=str(app.user_id),
            status=app.status,
            application_data=app.application_data,
            approved_by=str(app.approved_by) if app.approved_by else None,
            approved_at=app.approved_at,
            created_at=app.created_at,
            user_email=user.email if user else None,
            user_name=f"{user.first_name or ''} {user.last_name or ''}".strip() if user else None,
        ))

    return PaginatedResponse(items=items, total=total, page=page, per_page=per_page)


@router.post("/ib/applications/{app_id}/approve")
async def approve_ib_application(
    app_id: uuid.UUID,
    request: Request,
    admin: User = Depends(require_permission("ib.manage")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(IBApplication).where(IBApplication.id == app_id))
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    if app.status != "pending":
        raise HTTPException(status_code=400, detail="Application is not pending")

    app.status = "approved"
    app.approved_by = admin.id
    app.approved_at = datetime.utcnow()

    user_q = await db.execute(select(User).where(User.id == app.user_id))
    user = user_q.scalar_one_or_none()
    if user:
        user.role = "ib"

    referral_code = "IB" + "".join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(8))

    default_plan_q = await db.execute(
        select(IBCommissionPlan).where(IBCommissionPlan.is_default == True)
    )
    default_plan = default_plan_q.scalar_one_or_none()

    profile = IBProfile(
        user_id=app.user_id,
        referral_code=referral_code,
        level=1,
        commission_plan_id=default_plan.id if default_plan else None,
    )
    db.add(profile)

    await write_audit_log(
        db, admin.id, "approve_ib_application", "ib_application", app_id,
        new_values={"status": "approved", "referral_code": referral_code},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return {"message": "IB application approved", "referral_code": referral_code}


@router.post("/ib/applications/{app_id}/reject")
async def reject_ib_application(
    app_id: uuid.UUID,
    request: Request,
    admin: User = Depends(require_permission("ib.manage")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(IBApplication).where(IBApplication.id == app_id))
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    if app.status != "pending":
        raise HTTPException(status_code=400, detail="Application is not pending")

    app.status = "rejected"
    app.approved_by = admin.id
    app.approved_at = datetime.utcnow()

    await write_audit_log(
        db, admin.id, "reject_ib_application", "ib_application", app_id,
        new_values={"status": "rejected"},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return {"message": "IB application rejected"}


@router.get("/ib/agents")
async def list_ib_agents(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    admin: User = Depends(require_permission("ib.view")),
    db: AsyncSession = Depends(get_db),
):
    query = select(IBProfile).where(IBProfile.is_active == True)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    query = query.order_by(IBProfile.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    profiles = result.scalars().all()

    items = []
    for p in profiles:
        user_q = await db.execute(select(User).where(User.id == p.user_id))
        user = user_q.scalar_one_or_none()

        ref_count_q = await db.execute(
            select(func.count(Referral.id)).where(Referral.ib_profile_id == p.id)
        )
        ref_count = ref_count_q.scalar() or 0

        items.append(IBProfileOut(
            id=str(p.id),
            user_id=str(p.user_id),
            referral_code=p.referral_code,
            parent_ib_id=str(p.parent_ib_id) if p.parent_ib_id else None,
            level=p.level or 1,
            total_earned=float(p.total_earned or 0),
            pending_payout=float(p.pending_payout or 0),
            is_active=p.is_active,
            created_at=p.created_at,
            user_email=user.email if user else None,
            user_name=f"{user.first_name or ''} {user.last_name or ''}".strip() if user else None,
            referral_count=ref_count,
        ))

    return PaginatedResponse(items=items, total=total, page=page, per_page=per_page)


@router.get("/mlm/config")
async def get_mlm_config(
    admin: User = Depends(require_permission("ib.view")),
    db: AsyncSession = Depends(get_db),
):
    levels_q = await db.execute(
        select(SystemSetting).where(SystemSetting.key == "mlm_levels")
    )
    levels_setting = levels_q.scalar_one_or_none()

    dist_q = await db.execute(
        select(SystemSetting).where(SystemSetting.key == "mlm_distribution")
    )
    dist_setting = dist_q.scalar_one_or_none()

    return MLMConfigOut(
        mlm_levels=int(levels_setting.value) if levels_setting else 5,
        mlm_distribution=dist_setting.value if dist_setting else [40, 25, 15, 10, 10],
    )


@router.put("/mlm/config")
async def update_mlm_config(
    body: MLMConfigIn,
    request: Request,
    admin: User = Depends(require_permission("ib.manage")),
    db: AsyncSession = Depends(get_db),
):
    levels_q = await db.execute(
        select(SystemSetting).where(SystemSetting.key == "mlm_levels")
    )
    levels_setting = levels_q.scalar_one_or_none()
    if levels_setting:
        levels_setting.value = body.mlm_levels
        levels_setting.updated_by = admin.id
        levels_setting.updated_at = datetime.utcnow()
    else:
        db.add(SystemSetting(
            key="mlm_levels", value=body.mlm_levels,
            description="Number of MLM levels for IB",
            updated_by=admin.id,
        ))

    dist_q = await db.execute(
        select(SystemSetting).where(SystemSetting.key == "mlm_distribution")
    )
    dist_setting = dist_q.scalar_one_or_none()
    if dist_setting:
        dist_setting.value = body.mlm_distribution
        dist_setting.updated_by = admin.id
        dist_setting.updated_at = datetime.utcnow()
    else:
        db.add(SystemSetting(
            key="mlm_distribution", value=body.mlm_distribution,
            description="MLM distribution per level (%)",
            updated_by=admin.id,
        ))

    await write_audit_log(
        db, admin.id, "update_mlm_config", "system_setting", None,
        new_values={"mlm_levels": body.mlm_levels, "mlm_distribution": body.mlm_distribution},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return {"message": "MLM config updated"}


@router.get("/sub-broker/applications")
async def list_sub_broker_applications(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status_filter: str = Query(None, alias="status"),
    admin: User = Depends(require_permission("ib.view")),
    db: AsyncSession = Depends(get_db),
):
    query = select(IBApplication).where(
        IBApplication.application_data["type"].as_string() == "sub_broker"
    )
    if status_filter:
        query = query.where(IBApplication.status == status_filter)

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    query = query.order_by(IBApplication.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    apps = result.scalars().all()

    items = []
    for app in apps:
        user_q = await db.execute(select(User).where(User.id == app.user_id))
        user = user_q.scalar_one_or_none()
        items.append({
            "id": str(app.id),
            "user_id": str(app.user_id),
            "user_name": f"{user.first_name or ''} {user.last_name or ''}".strip() if user else None,
            "user_email": user.email if user else None,
            "status": app.status,
            "company_name": (app.application_data or {}).get("company_name"),
            "created_at": app.created_at.isoformat() if app.created_at else None,
        })

    return PaginatedResponse(items=items, total=total, page=page, per_page=per_page)


@router.post("/sub-broker/applications/{app_id}/approve")
async def approve_sub_broker(
    app_id: uuid.UUID,
    request: Request,
    admin: User = Depends(require_permission("ib.manage")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(IBApplication).where(IBApplication.id == app_id))
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    if app.status != "pending":
        raise HTTPException(status_code=400, detail="Application is not pending")

    app.status = "approved"
    app.approved_by = admin.id
    app.approved_at = datetime.utcnow()

    user_q = await db.execute(select(User).where(User.id == app.user_id))
    user = user_q.scalar_one_or_none()
    if user:
        user.role = "sub_broker"

    referral_code = "SB" + "".join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(8))
    profile = IBProfile(
        user_id=app.user_id,
        referral_code=referral_code,
        level=1,
    )
    db.add(profile)

    await write_audit_log(
        db, admin.id, "approve_sub_broker", "ib_application", app_id,
        new_values={"status": "approved", "referral_code": referral_code},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return {"message": "Sub-broker approved", "referral_code": referral_code}


@router.post("/sub-broker/applications/{app_id}/reject")
async def reject_sub_broker(
    app_id: uuid.UUID,
    request: Request,
    admin: User = Depends(require_permission("ib.manage")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(IBApplication).where(IBApplication.id == app_id))
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    if app.status != "pending":
        raise HTTPException(status_code=400, detail="Not pending")

    app.status = "rejected"
    app.approved_by = admin.id
    app.approved_at = datetime.utcnow()

    await write_audit_log(
        db, admin.id, "reject_sub_broker", "ib_application", app_id,
        new_values={"status": "rejected"},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return {"message": "Sub-broker rejected"}


@router.get("/sub-broker/agents")
async def list_sub_brokers(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    admin: User = Depends(require_permission("ib.view")),
    db: AsyncSession = Depends(get_db),
):
    query = select(User).where(User.role == "sub_broker", User.status == "active")
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    query = query.order_by(User.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    users = result.scalars().all()

    items = []
    for u in users:
        profile_q = await db.execute(select(IBProfile).where(IBProfile.user_id == u.id))
        profile = profile_q.scalar_one_or_none()

        ref_count = 0
        total_earned = 0.0
        if profile:
            rc = await db.execute(select(func.count(Referral.id)).where(Referral.ib_profile_id == profile.id))
            ref_count = rc.scalar() or 0
            total_earned = float(profile.total_earned or 0)

        items.append({
            "id": str(u.id),
            "user_id": str(u.id),
            "user_name": f"{u.first_name or ''} {u.last_name or ''}".strip(),
            "user_email": u.email,
            "referral_code": profile.referral_code if profile else "—",
            "clients_count": ref_count,
            "total_earned": total_earned,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        })

    return PaginatedResponse(items=items, total=total, page=page, per_page=per_page)
