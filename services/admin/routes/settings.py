from datetime import datetime

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_admin, write_audit_log
from models import User, SystemSetting
from schemas import SystemSettingOut, SystemSettingUpdate

router = APIRouter(prefix="/settings", tags=["Settings"])


@router.get("")
async def list_settings(
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(SystemSetting).order_by(SystemSetting.key))
    settings = result.scalars().all()
    return [
        SystemSettingOut(
            key=s.key,
            value=s.value,
            description=s.description,
            updated_at=s.updated_at,
        )
        for s in settings
    ]


@router.put("")
async def update_settings(
    body: SystemSettingUpdate,
    request: Request,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    old_values = {}
    for key, value in body.settings.items():
        result = await db.execute(
            select(SystemSetting).where(SystemSetting.key == key)
        )
        setting = result.scalar_one_or_none()
        if setting:
            old_values[key] = setting.value
            setting.value = value
            setting.updated_by = admin.id
            setting.updated_at = datetime.utcnow()
        else:
            new_setting = SystemSetting(
                key=key,
                value=value,
                updated_by=admin.id,
            )
            db.add(new_setting)

    await write_audit_log(
        db, admin.id, "update_settings", "system_setting", None,
        old_values=old_values,
        new_values=body.settings,
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()

    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url("redis://localhost:6379/0")
        await r.delete("system_settings_cache")
        await r.close()
    except Exception:
        pass

    return {"message": f"{len(body.settings)} settings updated"}
