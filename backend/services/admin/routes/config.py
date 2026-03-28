import uuid
from decimal import Decimal
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from packages.common.src.database import get_db
from dependencies import get_current_admin, require_permission, write_audit_log
from packages.common.src.models import User, ChargeConfig, SpreadConfig, SwapConfig, Instrument, InstrumentSegment
from packages.common.src.redis_client import publish_instrument_config_reload
from instrument_service import build_admin_instrument_items, upsert_instrument_config
from packages.common.src.admin_schemas import (
    ChargeConfigOut, SpreadConfigOut, SwapConfigOut,
    BulkChargeUpdate, BulkSpreadUpdate, BulkSwapUpdate,
)

router = APIRouter(prefix="/config", tags=["Configuration"])


@router.get("/instruments")
async def list_config_instruments(
    admin: User = Depends(require_permission("config.view")),
    db: AsyncSession = Depends(get_db),
    search: str | None = Query(None),
    segment: str | None = Query(None),
    include_inactive: bool = Query(True),
):
    data = await build_admin_instrument_items(
        db,
        include_inactive=include_inactive,
        search=search,
        segment_filter=segment,
    )
    return data


@router.put("/instrument/{instrument_id}")
async def update_instrument_config(
    instrument_id: uuid.UUID,
    body: dict,
    request: Request,
    admin: User = Depends(require_permission("config.update")),
    db: AsyncSession = Depends(get_db),
):
    """Save charge, spread, swap, price impact (instrument_configs + engine sync)."""
    try:
        inst = await upsert_instrument_config(
            db,
            instrument_id,
            body,
            admin.id,
            request.client.host if request.client else None,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    await write_audit_log(
        db, admin.id, "update_instrument_config", "instrument", instrument_id,
        new_values=body,
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    await publish_instrument_config_reload()
    return {"message": f"{inst.symbol} config updated successfully"}


@router.get("/charges")
async def list_charges(
    admin: User = Depends(require_permission("config.view")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ChargeConfig).order_by(ChargeConfig.scope))
    configs = result.scalars().all()
    return [
        ChargeConfigOut(
            id=str(c.id),
            scope=c.scope,
            segment_id=str(c.segment_id) if c.segment_id else None,
            instrument_id=str(c.instrument_id) if c.instrument_id else None,
            user_id=str(c.user_id) if c.user_id else None,
            charge_type=c.charge_type,
            value=float(c.value or 0),
            is_enabled=c.is_enabled,
            created_at=c.created_at,
        )
        for c in configs
    ]


@router.put("/charges")
async def update_charges(
    body: BulkChargeUpdate,
    request: Request,
    admin: User = Depends(require_permission("config.update")),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(delete(ChargeConfig))

    for cfg in body.configs:
        new_cfg = ChargeConfig(
            scope=cfg.scope,
            segment_id=uuid.UUID(cfg.segment_id) if cfg.segment_id else None,
            instrument_id=uuid.UUID(cfg.instrument_id) if cfg.instrument_id else None,
            user_id=uuid.UUID(cfg.user_id) if cfg.user_id else None,
            charge_type=cfg.charge_type,
            value=Decimal(str(cfg.value)),
            is_enabled=cfg.is_enabled,
        )
        db.add(new_cfg)

    await write_audit_log(
        db, admin.id, "update_charges", "charge_config", None,
        new_values={"count": len(body.configs)},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return {"message": f"{len(body.configs)} charge configs saved"}


@router.get("/spreads")
async def list_spreads(
    admin: User = Depends(require_permission("config.view")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(SpreadConfig).order_by(SpreadConfig.scope))
    configs = result.scalars().all()
    return [
        SpreadConfigOut(
            id=str(c.id),
            scope=c.scope,
            segment_id=str(c.segment_id) if c.segment_id else None,
            instrument_id=str(c.instrument_id) if c.instrument_id else None,
            user_id=str(c.user_id) if c.user_id else None,
            spread_type=c.spread_type,
            value=float(c.value or 0),
            is_enabled=c.is_enabled,
            created_at=c.created_at,
        )
        for c in configs
    ]


@router.put("/spreads")
async def update_spreads(
    body: BulkSpreadUpdate,
    request: Request,
    admin: User = Depends(require_permission("config.update")),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(delete(SpreadConfig))

    for cfg in body.configs:
        new_cfg = SpreadConfig(
            scope=cfg.scope,
            segment_id=uuid.UUID(cfg.segment_id) if cfg.segment_id else None,
            instrument_id=uuid.UUID(cfg.instrument_id) if cfg.instrument_id else None,
            user_id=uuid.UUID(cfg.user_id) if cfg.user_id else None,
            spread_type=cfg.spread_type,
            value=Decimal(str(cfg.value)),
            is_enabled=cfg.is_enabled,
        )
        db.add(new_cfg)

    await write_audit_log(
        db, admin.id, "update_spreads", "spread_config", None,
        new_values={"count": len(body.configs)},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return {"message": f"{len(body.configs)} spread configs saved"}


@router.get("/swaps")
async def list_swaps(
    admin: User = Depends(require_permission("config.view")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(SwapConfig).order_by(SwapConfig.scope))
    configs = result.scalars().all()
    return [
        SwapConfigOut(
            id=str(c.id),
            scope=c.scope,
            segment_id=str(c.segment_id) if c.segment_id else None,
            instrument_id=str(c.instrument_id) if c.instrument_id else None,
            user_id=str(c.user_id) if c.user_id else None,
            swap_long=float(c.swap_long or 0),
            swap_short=float(c.swap_short or 0),
            triple_swap_day=c.triple_swap_day or 3,
            swap_free=c.swap_free or False,
            is_enabled=c.is_enabled,
            created_at=c.created_at,
        )
        for c in configs
    ]


@router.put("/swaps")
async def update_swaps(
    body: BulkSwapUpdate,
    request: Request,
    admin: User = Depends(require_permission("config.update")),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(delete(SwapConfig))

    for cfg in body.configs:
        new_cfg = SwapConfig(
            scope=cfg.scope,
            segment_id=uuid.UUID(cfg.segment_id) if cfg.segment_id else None,
            instrument_id=uuid.UUID(cfg.instrument_id) if cfg.instrument_id else None,
            user_id=uuid.UUID(cfg.user_id) if cfg.user_id else None,
            swap_long=Decimal(str(cfg.swap_long)),
            swap_short=Decimal(str(cfg.swap_short)),
            triple_swap_day=cfg.triple_swap_day,
            swap_free=cfg.swap_free,
            is_enabled=cfg.is_enabled,
        )
        db.add(new_cfg)

    await write_audit_log(
        db, admin.id, "update_swaps", "swap_config", None,
        new_values={"count": len(body.configs)},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return {"message": f"{len(body.configs)} swap configs saved"}
