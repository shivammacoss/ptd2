"""Instruments API — List instruments, get current prices."""
import json
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from packages.common.src.database import get_db
from packages.common.src.models import Instrument, InstrumentSegment
from packages.common.src.schemas import InstrumentResponse, TickData
from packages.common.src.redis_client import redis_client, PriceChannel
from packages.common.src.auth import get_current_user

router = APIRouter()


@router.get("/", response_model=list[InstrumentResponse])
async def list_instruments(
    segment: str | None = None,
    active_only: bool = True,
    db: AsyncSession = Depends(get_db),
):
    query = select(Instrument)

    if active_only:
        query = query.where(Instrument.is_active == True)

    if segment:
        query = query.join(InstrumentSegment).where(InstrumentSegment.name == segment)

    result = await db.execute(query)
    instruments = result.scalars().all()

    return [
        InstrumentResponse(
            id=inst.id,
            symbol=inst.symbol,
            display_name=inst.display_name,
            segment=inst.segment.name if inst.segment else None,
            digits=inst.digits,
            pip_size=inst.pip_size,
            min_lot=inst.min_lot,
            max_lot=inst.max_lot,
            lot_step=inst.lot_step,
            contract_size=inst.contract_size,
            margin_rate=inst.margin_rate,
            is_active=inst.is_active,
        )
        for inst in instruments
    ]


@router.get("/{symbol}/price", response_model=TickData)
async def get_price(symbol: str):
    tick_data = await redis_client.get(PriceChannel.tick_key(symbol.upper()))
    if not tick_data:
        raise HTTPException(status_code=404, detail=f"No price data for {symbol}")

    data = json.loads(tick_data)
    return TickData(**data)


@router.get("/prices/all")
async def get_all_prices():
    keys = []
    async for key in redis_client.scan_iter(f"{PriceChannel.TICK_PREFIX}*"):
        keys.append(key)

    if not keys:
        return []

    values = await redis_client.mget(keys)
    prices = []
    for v in values:
        if v:
            prices.append(json.loads(v))

    return prices
