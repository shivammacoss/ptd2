"""REST aliases: /api/v1/admin/instruments — master list + config CRUD."""

import uuid
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from packages.common.src.database import get_db
from packages.common.src.models import Instrument, InstrumentSegment
from packages.common.src.redis_client import publish_instrument_config_reload
from dependencies import require_permission, write_audit_log
from packages.common.src.models import User
from instrument_service import build_admin_instrument_items, upsert_instrument_config

router = APIRouter(prefix="/instruments", tags=["Instruments"])


@router.get("")
async def list_instruments(
    admin: User = Depends(require_permission("config.view")),
    db: AsyncSession = Depends(get_db),
    search: str | None = Query(None),
    segment: str | None = Query(None),
    include_inactive: bool = Query(True),
):
    return await build_admin_instrument_items(
        db, include_inactive=include_inactive, search=search, segment_filter=segment
    )


@router.get("/{instrument_id}")
async def get_instrument(
    instrument_id: uuid.UUID,
    admin: User = Depends(require_permission("config.view")),
    db: AsyncSession = Depends(get_db),
):
    inst = await db.get(Instrument, instrument_id)
    if not inst:
        raise HTTPException(status_code=404, detail="Instrument not found")
    data = await build_admin_instrument_items(db, include_inactive=True, search=inst.symbol)
    for item in data["items"]:
        if item["id"] == str(instrument_id):
            return item
    raise HTTPException(status_code=404, detail="Instrument not found")


@router.put("/{instrument_id}/config")
async def put_instrument_config(
    instrument_id: uuid.UUID,
    body: dict[str, Any],
    request: Request,
    admin: User = Depends(require_permission("config.update")),
    db: AsyncSession = Depends(get_db),
):
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
        db,
        admin.id,
        "update_instrument_config",
        "instrument",
        instrument_id,
        new_values=body,
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    await publish_instrument_config_reload()
    return {"message": f"{inst.symbol} config updated successfully"}


@router.post("")
async def create_instrument(
    body: dict[str, Any],
    request: Request,
    admin: User = Depends(require_permission("config.update")),
    db: AsyncSession = Depends(get_db),
):
    symbol = (body.get("symbol") or "").strip().upper()
    if not symbol:
        raise HTTPException(status_code=400, detail="symbol is required")
    seg_name = (body.get("segment") or "forex").lower()
    exists = await db.execute(select(Instrument).where(Instrument.symbol == symbol))
    if exists.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Symbol already exists")
    seg_r = await db.execute(
        select(InstrumentSegment).where(InstrumentSegment.name == seg_name)
    )
    seg = seg_r.scalar_one_or_none()
    if not seg:
        raise HTTPException(status_code=400, detail="Invalid segment")

    inst = Instrument(
        symbol=symbol,
        display_name=body.get("display_name") or symbol,
        segment_id=seg.id,
        base_currency=body.get("base_currency") or symbol[:3],
        quote_currency=body.get("quote_currency") or (symbol[3:] if len(symbol) > 3 else "USD"),
        digits=int(body.get("digits", 5)),
        pip_size=Decimal(str(body.get("pip_size", "0.0001"))),
        contract_size=Decimal(str(body.get("contract_size", "100000"))),
        min_lot=Decimal(str(body.get("min_lot", "0.01"))),
        max_lot=Decimal(str(body.get("max_lot", "100"))),
        is_active=True,
    )
    db.add(inst)
    await write_audit_log(
        db,
        admin.id,
        "create_instrument",
        "instrument",
        None,
        new_values={"symbol": symbol},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    await db.refresh(inst)
    await publish_instrument_config_reload()
    return {"id": str(inst.id), "symbol": inst.symbol}


@router.delete("/{instrument_id}")
async def deactivate_instrument(
    instrument_id: uuid.UUID,
    request: Request,
    admin: User = Depends(require_permission("config.update")),
    db: AsyncSession = Depends(get_db),
):
    inst = await db.get(Instrument, instrument_id)
    if not inst:
        raise HTTPException(status_code=404, detail="Instrument not found")
    inst.is_active = False
    await write_audit_log(
        db,
        admin.id,
        "deactivate_instrument",
        "instrument",
        instrument_id,
        new_values={"is_active": False},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    await publish_instrument_config_reload()
    return {"message": f"{inst.symbol} deactivated"}


@router.post("/bulk-update")
async def bulk_update_configs(
    body: dict[str, Any],
    request: Request,
    admin: User = Depends(require_permission("config.update")),
    db: AsyncSession = Depends(get_db),
):
    items = body.get("items") or []
    if not isinstance(items, list) or not items:
        raise HTTPException(status_code=400, detail="items array required")
    for raw in items:
        iid = raw.get("id")
        if not iid:
            continue
        try:
            uid = uuid.UUID(str(iid))
        except ValueError:
            continue
        payload = {k: v for k, v in raw.items() if k != "id"}
        try:
            await upsert_instrument_config(
                db,
                uid,
                payload,
                admin.id,
                request.client.host if request.client else None,
            )
        except ValueError:
            continue
    await write_audit_log(
        db,
        admin.id,
        "bulk_update_instrument_config",
        "instrument",
        None,
        new_values={"count": len(items)},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    await publish_instrument_config_reload()
    return {"message": f"Processed {len(items)} instrument config(s)"}
