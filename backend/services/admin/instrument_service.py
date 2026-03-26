"""Admin instrument list + config upsert (instrument_configs + charge/spread/swap sync)."""

import uuid
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy import select, delete, or_
from sqlalchemy.ext.asyncio import AsyncSession

from packages.common.src.models import (
    Instrument,
    InstrumentSegment,
    InstrumentConfig,
    InstrumentConfigAudit,
    ChargeConfig,
    SpreadConfig,
    SwapConfig,
)


def _segment_label(name: str) -> str:
    m = {
        "forex": "FOREX",
        "indices": "INDICES",
        "commodities": "COMMODITIES",
        "crypto": "CRYPTOCURRENCY",
        "stocks": "STOCKS",
        "energies": "ENERGIES",
    }
    return m.get((name or "").lower(), (name or "OTHER").upper())


def _charge_type_to_db(ct: str) -> str:
    t = (ct or "per_lot").lower()
    if t in ("per_lot", "commission_per_lot"):
        return "commission_per_lot"
    if t in ("per_trade", "commission_per_trade"):
        return "commission_per_trade"
    if t in ("percentage", "commission_percentage", "spread_percentage"):
        return "commission_percentage"
    return "commission_per_lot"


def _spread_type_to_db(st: str) -> str:
    t = (st or "pips").lower()
    if t in ("fix", "fixed"):
        return "fixed"
    if t == "percentage":
        return "percentage"
    if t in ("var", "variable"):
        return "variable"
    return "pips"


async def build_admin_instrument_items(
    db: AsyncSession,
    *,
    include_inactive: bool = True,
    search: Optional[str] = None,
    segment_filter: Optional[str] = None,
) -> dict:
    q = select(Instrument).order_by(Instrument.symbol)
    if not include_inactive:
        q = q.where(Instrument.is_active == True)
    if search:
        s = f"%{search.strip()}%"
        q = q.where(
            or_(Instrument.symbol.ilike(s), Instrument.display_name.ilike(s))
        )
    if segment_filter:
        q = q.join(InstrumentSegment, Instrument.segment_id == InstrumentSegment.id).where(
            InstrumentSegment.name == segment_filter.lower()
        )

    inst_q = await db.execute(q)
    instruments = inst_q.scalars().unique().all()

    seg_q = await db.execute(select(InstrumentSegment))
    segments = {str(s.id): s for s in seg_q.scalars().all()}

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

    ic_q = await db.execute(select(InstrumentConfig))
    ic_by_inst = {str(x.instrument_id): x for x in ic_q.scalars().all()}

    default_charge = charge_map.get("default")
    default_spread = spread_map.get("default")
    default_swap = swap_map.get("default")

    items = []
    for inst in instruments:
        iid = str(inst.id)
        seg = segments.get(str(inst.segment_id))
        seg_name = seg.name if seg else ""
        seg_key = f"seg:{inst.segment_id}" if inst.segment_id else None

        ch = charge_map.get(iid) or (charge_map.get(seg_key) if seg_key else None) or default_charge
        sp = spread_map.get(iid) or (spread_map.get(seg_key) if seg_key else None) or default_spread
        sw = swap_map.get(iid) or (swap_map.get(seg_key) if seg_key else None) or default_swap
        ic = ic_by_inst.get(iid)

        price_impact = float(ic.price_impact) if ic else None
        explicit = ic is not None

        ch_out = ch
        sp_out = sp
        if ic and ic.commission_value is not None:
            adb = "commission_per_lot"
            ct = (ic.commission_type or "per_lot").lower()
            if ct == "per_trade":
                adb = "commission_per_trade"
            elif ct == "percentage":
                adb = "commission_percentage"
            ch_out = {"type": adb, "value": float(ic.commission_value)}
        if ic and ic.spread_value is not None:
            sp_out = {"type": ic.spread_type or "pips", "value": float(ic.spread_value)}

        items.append(
            {
                "id": iid,
                "symbol": inst.symbol,
                "display_name": inst.display_name,
                "segment": seg_name,
                "segment_label": _segment_label(seg_name),
                "segment_id": str(inst.segment_id) if inst.segment_id else None,
                "pip_size": float(inst.pip_size or 0.0001),
                "digits": inst.digits or 5,
                "contract_size": float(inst.contract_size or 100000),
                "is_active": inst.is_active,
                "charge": ch_out,
                "spread": sp_out,
                "swap": sw,
                "price_impact": price_impact,
                "config_row": explicit,
                "min_lot": float(ic.min_lot_size) if ic and ic.min_lot_size is not None else float(inst.min_lot or 0.01),
                "max_lot": float(ic.max_lot_size) if ic and ic.max_lot_size is not None else float(inst.max_lot or 100),
                "leverage_max": ic.leverage_max if ic else 2000,
                "is_enabled": ic.is_enabled if ic else True,
            }
        )

    return {"items": items, "segments": {k: v.name for k, v in segments.items()}}


async def _audit(
    db: AsyncSession,
    instrument_id: uuid.UUID,
    field: str,
    old: Any,
    new: Any,
    admin_id: Optional[uuid.UUID],
    ip: Optional[str],
):
    db.add(
        InstrumentConfigAudit(
            instrument_id=instrument_id,
            field_changed=field,
            old_value=None if old is None else str(old),
            new_value=None if new is None else str(new),
            changed_by=admin_id,
            ip_address=ip,
        )
    )


async def upsert_instrument_config(
    db: AsyncSession,
    instrument_id: uuid.UUID,
    body: dict,
    admin_id: Optional[uuid.UUID],
    ip: Optional[str],
) -> Instrument:
    inst_q = await db.execute(select(Instrument).where(Instrument.id == instrument_id))
    inst = inst_q.scalar_one_or_none()
    if not inst:
        raise ValueError("Instrument not found")

    ic_q = await db.execute(
        select(InstrumentConfig).where(InstrumentConfig.instrument_id == instrument_id)
    )
    ic = ic_q.scalar_one_or_none()

    commission = body.get("commission")
    commission_type = body.get("commission_type", "commission_per_lot")
    spread = body.get("spread")
    spread_type = body.get("spread_type", "fixed")
    swap_long = body.get("swap_long")
    swap_short = body.get("swap_short")
    swap_free = body.get("swap_free", False)
    price_impact = body.get("price_impact")

    if commission is not None and float(commission) < 0:
        raise ValueError("Commission cannot be negative")
    if spread is not None and float(spread) < 0:
        raise ValueError("Spread cannot be negative")
    if price_impact is not None and float(price_impact) < 0:
        raise ValueError("Price impact cannot be negative")

    old_snap = {}
    if ic:
        old_snap = {
            "commission_value": float(ic.commission_value) if ic.commission_value is not None else None,
            "spread_value": float(ic.spread_value) if ic.spread_value is not None else None,
            "price_impact": float(ic.price_impact) if ic.price_impact is not None else None,
        }

    if not ic:
        ic = InstrumentConfig(instrument_id=instrument_id)
        db.add(ic)

    if commission is not None:
        ic.commission_value = Decimal(str(commission))
        raw_ct = (commission_type or "commission_per_lot").lower()
        if "trade" in raw_ct:
            ic.commission_type = "per_trade"
        elif "percent" in raw_ct:
            ic.commission_type = "percentage"
        else:
            ic.commission_type = "per_lot"
    if spread is not None:
        ic.spread_value = Decimal(str(spread))
        ic.spread_type = _spread_type_to_db(spread_type)
    if price_impact is not None:
        ic.price_impact = Decimal(str(price_impact))
    elif ic.price_impact is None:
        ic.price_impact = Decimal("0")
    if swap_long is not None:
        ic.swap_long = Decimal(str(swap_long))
    if swap_short is not None:
        ic.swap_short = Decimal(str(swap_short))
    ic.swap_free = bool(swap_free)
    if body.get("min_lot") is not None:
        ic.min_lot_size = Decimal(str(body["min_lot"]))
    if body.get("max_lot") is not None:
        ic.max_lot_size = Decimal(str(body["max_lot"]))
    if body.get("leverage_max") is not None:
        lm = int(body["leverage_max"])
        if lm > 2000:
            raise ValueError("leverage_max cannot exceed 2000")
        ic.leverage_max = lm
    if "is_enabled" in body:
        ic.is_enabled = bool(body["is_enabled"])
    ic.updated_by = admin_id

    await db.flush()

    for field, new_v in [
        ("commission_value", float(ic.commission_value) if ic.commission_value is not None else None),
        ("spread_value", float(ic.spread_value) if ic.spread_value is not None else None),
        ("price_impact", float(ic.price_impact) if ic.price_impact is not None else None),
    ]:
        ov = old_snap.get(field)
        if ov != new_v and (ov is not None or new_v is not None):
            await _audit(db, instrument_id, field, ov, new_v, admin_id, ip)

    # Sync engine tables (instrument scope) when fields provided
    if "commission" in body and commission is not None:
        await db.execute(
            delete(ChargeConfig).where(
                ChargeConfig.instrument_id == instrument_id,
                ChargeConfig.scope == "instrument",
            )
        )
        db.add(
            ChargeConfig(
                scope="instrument",
                instrument_id=instrument_id,
                charge_type=_charge_type_to_db(commission_type),
                value=Decimal(str(commission)),
                is_enabled=True,
            )
        )

    if "spread" in body and spread is not None:
        await db.execute(
            delete(SpreadConfig).where(
                SpreadConfig.instrument_id == instrument_id,
                SpreadConfig.scope == "instrument",
            )
        )
        db.add(
            SpreadConfig(
                scope="instrument",
                instrument_id=instrument_id,
                spread_type=_spread_type_to_db(spread_type),
                value=Decimal(str(spread)),
                is_enabled=True,
            )
        )

    if "swap_long" in body or "swap_short" in body or "swap_free" in body:
        await db.execute(
            delete(SwapConfig).where(
                SwapConfig.instrument_id == instrument_id,
                SwapConfig.scope == "instrument",
            )
        )
        db.add(
            SwapConfig(
                scope="instrument",
                instrument_id=instrument_id,
                swap_long=Decimal(str(body.get("swap_long", ic.swap_long or 0))),
                swap_short=Decimal(str(body.get("swap_short", ic.swap_short or 0))),
                triple_swap_day=body.get("triple_swap_day", 3),
                swap_free=bool(swap_free),
                is_enabled=True,
            )
        )

    from datetime import datetime, timezone

    inst.updated_at = datetime.now(timezone.utc)
    return inst
