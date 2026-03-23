"""Orders API — Place, modify, cancel orders. MT5-like execution."""
import asyncio
import json
from decimal import Decimal
from uuid import UUID
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from packages.common.src.database import get_db
from packages.common.src.models import (
    Order, OrderType, OrderSide, OrderStatus, Position, PositionStatus,
    TradingAccount, Instrument, SpreadConfig, ChargeConfig,
)
from packages.common.src.schemas import PlaceOrderRequest, ModifyOrderRequest, OrderResponse
from packages.common.src.auth import get_current_user
from packages.common.src.redis_client import redis_client, PriceChannel
from packages.common.src.kafka_client import produce_event, KafkaTopics
from packages.common.src.notify import create_notification
from ..ib_engine import distribute_ib_commission

router = APIRouter()

DEFAULT_COMMISSIONS = {
    "forex_major": Decimal("7"),
    "forex_minor": Decimal("7"),
    "commodity": Decimal("5"),
    "index": Decimal("3"),
    "crypto": Decimal("0"),
}


async def _get_spread_markup(instrument: Instrument, db: AsyncSession) -> Decimal:
    result = await db.execute(
        select(SpreadConfig)
        .where(SpreadConfig.instrument_id == instrument.id, SpreadConfig.is_enabled == True)
        .order_by(SpreadConfig.scope.desc())
        .limit(1)
    )
    cfg = result.scalar_one_or_none()
    if cfg:
        return cfg.value
    return Decimal("0")


async def _get_commission(instrument: Instrument, db: AsyncSession) -> Decimal:
    result = await db.execute(
        select(ChargeConfig)
        .where(ChargeConfig.instrument_id == instrument.id, ChargeConfig.is_enabled == True)
        .order_by(ChargeConfig.scope.desc())
        .limit(1)
    )
    cfg = result.scalar_one_or_none()
    if cfg:
        return cfg.value
    segment = (instrument.segment.name if instrument.segment else "forex_major").lower()
    return DEFAULT_COMMISSIONS.get(segment, Decimal("7"))


async def _get_current_price(symbol: str) -> tuple[Decimal, Decimal]:
    tick_data = await redis_client.get(PriceChannel.tick_key(symbol))
    if not tick_data:
        raise HTTPException(status_code=400, detail=f"No price available for {symbol}")
    tick = json.loads(tick_data)
    return Decimal(str(tick["bid"])), Decimal(str(tick["ask"]))


async def _validate_account(account_id: UUID, user_id: UUID, db: AsyncSession) -> TradingAccount:
    result = await db.execute(
        select(TradingAccount).where(
            TradingAccount.id == account_id,
            TradingAccount.user_id == user_id,
        )
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    if not account.is_active:
        raise HTTPException(status_code=403, detail="Account is not active")
    return account


async def _get_instrument(symbol: str, db: AsyncSession) -> Instrument:
    result = await db.execute(
        select(Instrument).where(Instrument.symbol == symbol.upper(), Instrument.is_active == True)
    )
    instrument = result.scalar_one_or_none()
    if not instrument:
        raise HTTPException(status_code=404, detail=f"Instrument {symbol} not found")
    return instrument


def _calc_margin(lots: Decimal, price: Decimal, contract_size: Decimal, leverage: int) -> Decimal:
    return (lots * contract_size * price) / Decimal(str(leverage))


async def _fire_event(topic, key, data):
    try:
        await asyncio.wait_for(produce_event(topic, key, data), timeout=1.0)
    except Exception:
        pass


@router.post("/", status_code=201)
async def place_order(
    req: PlaceOrderRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from packages.common.src.settings_store import get_bool_setting, get_int_setting
    if await get_bool_setting("maintenance_mode", False):
        raise HTTPException(status_code=503, detail="Platform is under maintenance. Trading is temporarily disabled.")

    account = await _validate_account(req.account_id, current_user["user_id"], db)

    max_trades = await get_int_setting("max_open_trades", 200)
    open_count_q = await db.execute(
        select(func.count(Position.id)).where(
            Position.account_id == account.id,
            Position.status == "open",
        )
    )
    if (open_count_q.scalar() or 0) >= max_trades:
        raise HTTPException(status_code=400, detail=f"Maximum open trades ({max_trades}) reached")

    instrument = await _get_instrument(req.symbol, db)

    if req.lots < instrument.min_lot or req.lots > instrument.max_lot:
        raise HTTPException(status_code=400, detail=f"Lot size must be between {instrument.min_lot} and {instrument.max_lot}")

    bid, ask = await _get_current_price(instrument.symbol)

    order = Order(
        account_id=account.id,
        instrument_id=instrument.id,
        order_type=req.order_type,
        side=req.side,
        lots=req.lots,
        price=req.price,
        stop_loss=req.stop_loss,
        take_profit=req.take_profit,
        stop_limit_price=getattr(req, 'stop_limit_price', None),
        comment=req.comment,
        magic_number=getattr(req, 'magic_number', None),
    )

    if req.order_type == "market":
        spread_markup = await _get_spread_markup(instrument, db)
        if spread_markup > 0:
            pip = instrument.pip_size or Decimal("0.0001")
            if req.side == "buy":
                ask += spread_markup * pip
            else:
                bid -= spread_markup * pip

        fill_price = ask if req.side == "buy" else bid

        if req.stop_loss:
            if req.side == "buy" and req.stop_loss >= fill_price:
                raise HTTPException(status_code=400, detail="BUY SL must be below entry price")
            if req.side == "sell" and req.stop_loss <= fill_price:
                raise HTTPException(status_code=400, detail="SELL SL must be above entry price")
        if req.take_profit:
            if req.side == "buy" and req.take_profit <= fill_price:
                raise HTTPException(status_code=400, detail="BUY TP must be above entry price")
            if req.side == "sell" and req.take_profit >= fill_price:
                raise HTTPException(status_code=400, detail="SELL TP must be below entry price")

        commission_per_lot = await _get_commission(instrument, db)
        commission = commission_per_lot * req.lots

        contract_size = instrument.contract_size or Decimal("100000")
        required_margin = _calc_margin(req.lots, fill_price, contract_size, account.leverage)

        if required_margin > (account.free_margin or Decimal("0")):
            raise HTTPException(status_code=400, detail="Insufficient margin")

        order.status = "filled"
        order.filled_price = fill_price
        order.filled_at = datetime.utcnow()
        order.commission = commission

        position = Position(
            account_id=account.id,
            instrument_id=instrument.id,
            order_id=order.id,
            side=req.side,
            lots=req.lots,
            open_price=fill_price,
            stop_loss=req.stop_loss,
            take_profit=req.take_profit,
            status="open",
            commission=commission,
        )
        db.add(position)

        account.margin_used = (account.margin_used or Decimal("0")) + required_margin
        account.balance -= commission
        account.equity = account.balance + (account.credit or Decimal("0"))
        account.free_margin = account.equity - account.margin_used

    else:
        if not req.price:
            raise HTTPException(status_code=400, detail="Price required for pending orders")
        order.status = "pending"

    db.add(order)
    await db.commit()
    await db.refresh(order)

    if req.order_type == "market":
        await create_notification(
            db, current_user["user_id"],
            title=f"Order Filled — {instrument.symbol}",
            message=f"{req.side.upper()} {req.lots} lots @ {order.filled_price}",
            notif_type="trade", action_url="/trading",
        )

        try:
            await distribute_ib_commission(
                db, current_user["user_id"], order.id, req.lots, instrument.symbol
            )
        except Exception as e:
            import logging
            logging.getLogger("ib-engine").error(f"IB commission error: {e}")

        await db.commit()

    asyncio.create_task(_fire_event(KafkaTopics.ORDERS, str(order.id), {
        "event": "order_placed",
        "order_id": str(order.id),
        "symbol": instrument.symbol,
        "side": req.side,
        "lots": str(req.lots),
        "status": str(order.status),
    }))

    try:
        await redis_client.publish(f"account:{account.id}", json.dumps({
            "type": "order_update",
            "order_id": str(order.id),
            "status": str(order.status),
        }))
    except Exception:
        pass

    side_val = order.side.value if hasattr(order.side, 'value') else str(order.side)
    otype_val = order.order_type.value if hasattr(order.order_type, 'value') else str(order.order_type)
    status_val = order.status.value if hasattr(order.status, 'value') else str(order.status)

    return {
        "id": str(order.id),
        "account_id": str(order.account_id),
        "symbol": instrument.symbol,
        "order_type": otype_val,
        "side": side_val,
        "status": status_val,
        "lots": float(order.lots),
        "price": float(order.price) if order.price else None,
        "stop_loss": float(order.stop_loss) if order.stop_loss else None,
        "take_profit": float(order.take_profit) if order.take_profit else None,
        "filled_price": float(order.filled_price) if order.filled_price else None,
        "commission": float(order.commission or 0),
        "swap": float(order.swap or 0),
        "comment": order.comment,
        "created_at": order.created_at.isoformat() if order.created_at else None,
    }


@router.get("/")
async def list_orders(
    account_id: UUID,
    status: str | None = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _validate_account(account_id, current_user["user_id"], db)

    query = select(Order).where(Order.account_id == account_id)
    if status:
        query = query.where(Order.status == status)
    query = query.order_by(Order.created_at.desc()).limit(100)

    result = await db.execute(query)
    orders = result.scalars().all()

    items = []
    for o in orders:
        side_val = o.side.value if hasattr(o.side, 'value') else str(o.side)
        otype_val = o.order_type.value if hasattr(o.order_type, 'value') else str(o.order_type)
        status_val = o.status.value if hasattr(o.status, 'value') else str(o.status)
        items.append({
            "id": str(o.id),
            "account_id": str(o.account_id),
            "symbol": o.instrument.symbol if o.instrument else "",
            "order_type": otype_val,
            "side": side_val,
            "status": status_val,
            "lots": float(o.lots),
            "price": float(o.price) if o.price else None,
            "stop_loss": float(o.stop_loss) if o.stop_loss else None,
            "take_profit": float(o.take_profit) if o.take_profit else None,
            "filled_price": float(o.filled_price) if o.filled_price else None,
            "commission": float(o.commission or 0),
            "swap": float(o.swap or 0),
            "comment": o.comment,
            "created_at": o.created_at.isoformat() if o.created_at else None,
        })
    return items


@router.put("/{order_id}")
async def modify_order(
    order_id: UUID,
    req: ModifyOrderRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    await _validate_account(order.account_id, current_user["user_id"], db)

    status_val = order.status.value if hasattr(order.status, 'value') else str(order.status)
    if status_val != "pending":
        raise HTTPException(status_code=400, detail="Can only modify pending orders")

    if req.stop_loss is not None:
        order.stop_loss = req.stop_loss
    if req.take_profit is not None:
        order.take_profit = req.take_profit
    if req.price is not None:
        order.price = req.price
    if req.lots is not None:
        order.lots = req.lots

    await db.commit()
    return {"message": "Order modified"}


@router.delete("/{order_id}")
async def cancel_order(
    order_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    await _validate_account(order.account_id, current_user["user_id"], db)

    status_val = order.status.value if hasattr(order.status, 'value') else str(order.status)
    if status_val != "pending":
        raise HTTPException(status_code=400, detail="Can only cancel pending orders")

    order.status = "cancelled"
    await db.commit()

    return {"message": "Order cancelled"}
