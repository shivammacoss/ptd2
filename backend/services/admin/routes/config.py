import uuid
from decimal import Decimal
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from packages.common.src.database import get_db
from dependencies import get_current_admin, require_permission, write_audit_log
from packages.common.src.models import User, ChargeConfig, SpreadConfig, SwapConfig, Instrument, InstrumentSegment
from packages.common.src.admin_schemas import (
    ChargeConfigOut, SpreadConfigOut, SwapConfigOut,
    BulkChargeUpdate, BulkSpreadUpdate, BulkSwapUpdate,
)

router = APIRouter(prefix="/config", tags=["Configuration"])


@router.get("/instruments")
async def list_config_instruments(
    admin: User = Depends(require_permission("config.view")),
    db: AsyncSession = Depends(get_db),
):
    inst_q = await db.execute(
        select(Instrument).where(Instrument.is_active == True).order_by(Instrument.symbol)
    )
    instruments = inst_q.scalars().all()

    seg_q = await db.execute(select(InstrumentSegment))
    segments = {str(s.id): s.name for s in seg_q.scalars().all()}

    charges_q = await db.execute(select(ChargeConfig).where(ChargeConfig.is_enabled == True))
    charges = charges_q.scalars().all()
    charge_map: dict = {}
    for c in charges:
        key = str(c.instrument_id) if c.instrument_id else f"seg:{c.segment_id}" if c.segment_id else "default"
        charge_map[key] = {"type": c.charge_type, "value": float(c.value or 0)}

    spreads_q = await db.execute(select(SpreadConfig).where(SpreadConfig.is_enabled == True))
    spreads = spreads_q.scalars().all()
    spread_map: dict = {}
    for s in spreads:
        key = str(s.instrument_id) if s.instrument_id else f"seg:{s.segment_id}" if s.segment_id else "default"
        spread_map[key] = {"type": s.spread_type, "value": float(s.value or 0)}

    swaps_q = await db.execute(select(SwapConfig).where(SwapConfig.is_enabled == True))
    swaps = swaps_q.scalars().all()
    swap_map: dict = {}
    for sw in swaps:
        key = str(sw.instrument_id) if sw.instrument_id else f"seg:{sw.segment_id}" if sw.segment_id else "default"
        swap_map[key] = {"long": float(sw.swap_long or 0), "short": float(sw.swap_short or 0), "free": sw.swap_free}

    default_charge = charge_map.get("default")
    default_spread = spread_map.get("default")
    default_swap = swap_map.get("default")

    items = []
    for inst in instruments:
        iid = str(inst.id)
        seg_name = segments.get(str(inst.segment_id), "")
        seg_key = f"seg:{inst.segment_id}" if inst.segment_id else None

        ch = charge_map.get(iid) or (charge_map.get(seg_key) if seg_key else None) or default_charge
        sp = spread_map.get(iid) or (spread_map.get(seg_key) if seg_key else None) or default_spread
        sw = swap_map.get(iid) or (swap_map.get(seg_key) if seg_key else None) or default_swap

        items.append({
            "id": iid,
            "symbol": inst.symbol,
            "display_name": inst.display_name,
            "segment": seg_name,
            "segment_id": str(inst.segment_id) if inst.segment_id else None,
            "pip_size": float(inst.pip_size or 0.0001),
            "digits": inst.digits or 5,
            "contract_size": float(inst.contract_size or 100000),
            "charge": ch,
            "spread": sp,
            "swap": sw,
        })

    return {"items": items, "segments": segments}


@router.put("/instrument/{instrument_id}")
async def update_instrument_config(
    instrument_id: uuid.UUID,
    body: dict,
    request: Request,
    admin: User = Depends(require_permission("config.update")),
    db: AsyncSession = Depends(get_db),
):
    """Save charge, spread, swap for a single instrument inline."""
    inst_q = await db.execute(select(Instrument).where(Instrument.id == instrument_id))
    inst = inst_q.scalar_one_or_none()
    if not inst:
        raise HTTPException(status_code=404, detail="Instrument not found")

    if "commission" in body and body["commission"] is not None:
        await db.execute(
            delete(ChargeConfig).where(
                ChargeConfig.instrument_id == instrument_id,
                ChargeConfig.scope == "instrument",
            )
        )
        db.add(ChargeConfig(
            scope="instrument",
            instrument_id=instrument_id,
            charge_type=body.get("commission_type", "commission_per_lot"),
            value=Decimal(str(body["commission"])),
            is_enabled=True,
        ))

    if "spread" in body and body["spread"] is not None:
        await db.execute(
            delete(SpreadConfig).where(
                SpreadConfig.instrument_id == instrument_id,
                SpreadConfig.scope == "instrument",
            )
        )
        db.add(SpreadConfig(
            scope="instrument",
            instrument_id=instrument_id,
            spread_type=body.get("spread_type", "fixed"),
            value=Decimal(str(body["spread"])),
            is_enabled=True,
        ))

    if "swap_long" in body or "swap_short" in body:
        await db.execute(
            delete(SwapConfig).where(
                SwapConfig.instrument_id == instrument_id,
                SwapConfig.scope == "instrument",
            )
        )
        db.add(SwapConfig(
            scope="instrument",
            instrument_id=instrument_id,
            swap_long=Decimal(str(body.get("swap_long", 0))),
            swap_short=Decimal(str(body.get("swap_short", 0))),
            triple_swap_day=body.get("triple_swap_day", 3),
            swap_free=body.get("swap_free", False),
            is_enabled=True,
        ))

    await write_audit_log(
        db, admin.id, "update_instrument_config", "instrument", instrument_id,
        new_values=body,
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return {"message": f"Config saved for {inst.symbol}"}


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
