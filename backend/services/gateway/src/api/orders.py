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
    TradingAccount, Instrument, InstrumentConfig,
)
from packages.common.src.instrument_pricing import (
    resolve_spread_config,
    apply_spread_and_impact_to_prices,
    resolve_commission,
)
from packages.common.src.schemas import PlaceOrderRequest, ModifyOrderRequest, OrderResponse
from packages.common.src.auth import get_current_user
from packages.common.src.redis_client import redis_client, PriceChannel
from packages.common.src.kafka_client import produce_event, KafkaTopics
from packages.common.src.notify import create_notification
from packages.common.src.market_hours import is_market_open
from ..engines.ib_engine import distribute_ib_commission

router = APIRouter()

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

    # ── Market hours enforcement ──────────────────────────────────────────
    # Market orders are rejected when the market is closed.
    # Pending (limit/stop) orders are always accepted so traders can pre-place
    # orders that will fill when the market reopens.
    if req.order_type == "market":
        segment_name = instrument.segment.name if instrument.segment else ""
        market_open, closed_reason = is_market_open(
            instrument.symbol, segment_name, instrument.trading_hours
        )
        if not market_open:
            raise HTTPException(
                status_code=400,
                detail=closed_reason or f"Market is closed for {instrument.symbol}. "
                       "You can still place pending (limit/stop) orders.",
            )
    # ─────────────────────────────────────────────────────────────────────

    ic_row = await db.execute(
        select(InstrumentConfig).where(InstrumentConfig.instrument_id == instrument.id)
    )
    ic = ic_row.scalar_one_or_none()
    min_lot = ic.min_lot_size if ic and ic.min_lot_size is not None else instrument.min_lot
    max_lot = ic.max_lot_size if ic and ic.max_lot_size is not None else instrument.max_lot
    if ic and ic.is_enabled is False:
        raise HTTPException(status_code=400, detail=f"Trading disabled for {instrument.symbol}")

    if req.lots < min_lot or req.lots > max_lot:
        raise HTTPException(status_code=400, detail=f"Lot size must be between {min_lot} and {max_lot}")

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
        pip = instrument.pip_size or Decimal("0.0001")
        sv, st, pimp = await resolve_spread_config(db, instrument)
        bid, ask = apply_spread_and_impact_to_prices(
            bid, ask, req.side, sv, st, pip, pimp,
        )

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

        commission = await resolve_commission(db, instrument, req.lots, fill_price)

        contract_size = instrument.contract_size or Decimal("100000")
        required_margin = _calc_margin(req.lots, fill_price, contract_size, account.leverage)

        # ── Dynamically recalculate free_margin with unrealized PnL ──
        # The stored free_margin can be stale; compute real-time equity
        unrealized_pnl = Decimal("0")
        open_pos_result = await db.execute(
            select(Position).where(
                Position.account_id == account.id,
                Position.status == "open",
            )
        )
        for pos in open_pos_result.scalars().all():
            try:
                p_bid, p_ask = await _get_current_price(pos.instrument.symbol)
                pos_side = pos.side.value if hasattr(pos.side, 'value') else str(pos.side)
                cp = p_bid if pos_side == "buy" else p_ask
                cs = pos.instrument.contract_size if pos.instrument else Decimal("100000")
                if pos_side == "buy":
                    unrealized_pnl += (cp - pos.open_price) * pos.lots * cs
                else:
                    unrealized_pnl += (pos.open_price - cp) * pos.lots * cs
            except Exception:
                pass
        real_equity = (account.balance or Decimal("0")) + (account.credit or Decimal("0")) + unrealized_pnl
        real_free_margin = real_equity - (account.margin_used or Decimal("0"))

        # Update stored values to stay in sync
        account.equity = real_equity
        account.free_margin = real_free_margin

        if required_margin > real_free_margin:
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
        account.equity = (account.balance or Decimal("0")) + (account.credit or Decimal("0")) + unrealized_pnl
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
