"""Resolve spread / commission / price impact for order execution (gateway, engines)."""

from decimal import Decimal
from typing import Optional, Tuple
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from packages.common.src.models import ChargeConfig, SpreadConfig, Instrument, InstrumentConfig

DEFAULT_COMMISSIONS = {
    "forex": Decimal("7"),
    "indices": Decimal("3"),
    "commodities": Decimal("5"),
    "crypto": Decimal("0"),
    "stocks": Decimal("0"),
    "energies": Decimal("5"),
}


def _segment_key(instrument: Instrument) -> str:
    name = (instrument.segment.name if instrument.segment else "forex").lower()
    if name in DEFAULT_COMMISSIONS:
        return name
    return "forex"


async def _get_instrument_config_row(
    db: AsyncSession, instrument_id: UUID
) -> Optional[InstrumentConfig]:
    r = await db.execute(
        select(InstrumentConfig).where(InstrumentConfig.instrument_id == instrument_id)
    )
    return r.scalar_one_or_none()


async def resolve_spread_config(
    db: AsyncSession, instrument: Instrument
) -> Tuple[Decimal, str, Decimal]:
    """Returns (spread_value, spread_type, price_impact)."""
    ic = await _get_instrument_config_row(db, instrument.id)
    if ic and ic.is_enabled:
        pi = Decimal(str(ic.price_impact or 0))
        sv = Decimal(str(ic.spread_value)) if ic.spread_value is not None else Decimal("0")
        if sv != 0 or pi != 0:
            return sv, (ic.spread_type or "pips").lower(), pi

    for scope, seg_id, inst_id in [
        ("instrument", None, instrument.id),
        ("segment", instrument.segment_id, None),
        ("default", None, None),
    ]:
        q = select(SpreadConfig).where(
            SpreadConfig.scope == scope,
            SpreadConfig.is_enabled == True,
        )
        if scope == "instrument":
            q = q.where(SpreadConfig.instrument_id == inst_id)
        elif scope == "segment":
            q = q.where(SpreadConfig.segment_id == seg_id)
        else:
            q = q.where(
                SpreadConfig.scope == "default",
                SpreadConfig.instrument_id.is_(None),
                SpreadConfig.segment_id.is_(None),
            )
        r = await db.execute(q.limit(1))
        cfg = r.scalar_one_or_none()
        if cfg:
            return Decimal(str(cfg.value or 0)), (cfg.spread_type or "pips").lower(), Decimal("0")

    return Decimal("0"), "pips", Decimal("0")


def apply_spread_and_impact_to_prices(
    bid: Decimal,
    ask: Decimal,
    side: str,
    spread_value: Decimal,
    spread_type: str,
    pip_size: Decimal,
    price_impact: Decimal,
) -> Tuple[Decimal, Decimal]:
    """Widen the active side by spread markup + adverse price impact."""
    bid_o, ask_o = bid, ask
    st = (spread_type or "pips").lower()
    mid = (bid + ask) / Decimal("2")

    if st == "percentage":
        adj = mid * (spread_value / Decimal("100"))
    else:
        # pips, fixed, variable → extra distance in price units
        adj = spread_value * pip_size

    imp = price_impact or Decimal("0")
    if side == "buy":
        ask_o = ask + adj + imp
    else:
        bid_o = bid - adj - imp
    return bid_o, ask_o


async def resolve_commission(
    db: AsyncSession,
    instrument: Instrument,
    lots: Decimal,
    fill_price: Decimal,
) -> Decimal:
    """Total commission for opening a position."""
    notional = lots * (instrument.contract_size or Decimal("100000")) * fill_price

    for scope, seg_id, inst_id in [
        ("instrument", None, instrument.id),
        ("segment", instrument.segment_id, None),
        ("default", None, None),
    ]:
        q = select(ChargeConfig).where(
            ChargeConfig.scope == scope,
            ChargeConfig.is_enabled == True,
        )
        if scope == "instrument":
            q = q.where(ChargeConfig.instrument_id == inst_id)
        elif scope == "segment":
            q = q.where(ChargeConfig.segment_id == seg_id)
        else:
            q = q.where(
                ChargeConfig.scope == "default",
                ChargeConfig.instrument_id.is_(None),
                ChargeConfig.segment_id.is_(None),
            )
        r = await db.execute(q.limit(1))
        cfg = r.scalar_one_or_none()
        if cfg:
            return _commission_from_config(cfg, lots, notional)

    return DEFAULT_COMMISSIONS.get(_segment_key(instrument), Decimal("7")) * lots


def _commission_from_config(cfg: ChargeConfig, lots: Decimal, notional: Decimal) -> Decimal:
    v = Decimal(str(cfg.value or 0))
    ct = (cfg.charge_type or "").lower()
    if ct in ("commission_per_lot", "per_lot"):
        return v * lots
    if ct in ("commission_per_trade", "per_trade"):
        return v
    if ct in ("commission_percentage", "percentage", "spread_percentage"):
        return notional * (v / Decimal("100"))
    return v * lots
