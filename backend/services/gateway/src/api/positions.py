"""Positions API — View, modify SL/TP, close & partial close (MT5-like)."""
import asyncio
import json
from decimal import Decimal
from uuid import UUID
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from packages.common.src.database import get_db
from packages.common.src.models import (
    Position, PositionStatus, TradingAccount, TradeHistory, Transaction, OrderSide, CopyTrade
)
from packages.common.src.schemas import (
    PositionResponse, ClosePositionRequest, ModifyPositionRequest
)
from packages.common.src.auth import get_current_user
from packages.common.src.redis_client import redis_client, PriceChannel
from packages.common.src.kafka_client import produce_event, KafkaTopics
from packages.common.src.notify import create_notification

router = APIRouter()


def _side_val(side) -> str:
    return side.value if hasattr(side, 'value') else str(side)


def _calc_pnl(side, open_price: Decimal, close_price: Decimal, lots: Decimal, contract_size: Decimal) -> Decimal:
    sv = _side_val(side)
    if sv == "buy":
        return (close_price - open_price) * lots * contract_size
    else:
        return (open_price - close_price) * lots * contract_size


async def _fire_event(topic, key, data):
    try:
        await asyncio.wait_for(produce_event(topic, key, data), timeout=1.0)
    except Exception:
        pass


@router.get("/")
async def list_positions(
    account_id: UUID,
    status: str = "open",
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TradingAccount).where(
            TradingAccount.id == account_id,
            TradingAccount.user_id == current_user["user_id"],
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Account not found")

    query = select(Position).where(Position.account_id == account_id)
    if status == "open":
        query = query.where(Position.status == "open")
    elif status == "closed":
        query = query.where(Position.status == "closed")

    result = await db.execute(query.order_by(Position.created_at.desc()))
    positions = result.scalars().all()

    response = []
    for pos in positions:
        current_price = None
        profit = float(pos.profit or 0)
        sv = _side_val(pos.side)
        contract_size = pos.instrument.contract_size if pos.instrument else Decimal("100000")

        tick_data = await redis_client.get(PriceChannel.tick_key(pos.instrument.symbol))
        pos_status = pos.status.value if hasattr(pos.status, 'value') else str(pos.status)

        if tick_data and pos_status == "open":
            tick = json.loads(tick_data)
            current_price = float(tick["bid"]) if sv == "buy" else float(tick["ask"])
            profit = float(_calc_pnl(pos.side, pos.open_price, Decimal(str(current_price)), pos.lots, contract_size))

        # Check if this is a copy trade
        copy_trade_q = await db.execute(
            select(CopyTrade).where(CopyTrade.investor_position_id == pos.id)
        )
        copy_trade = copy_trade_q.scalar_one_or_none()
        trade_type = "copy_trade" if copy_trade else "self_trade"

        pos_status_val = pos.status.value if hasattr(pos.status, 'value') else str(pos.status)
        response.append({
            "id": str(pos.id),
            "account_id": str(pos.account_id),
            "symbol": pos.instrument.symbol if pos.instrument else "",
            "side": sv,
            "lots": float(pos.lots),
            "open_price": float(pos.open_price),
            "current_price": current_price,
            "stop_loss": float(pos.stop_loss) if pos.stop_loss else None,
            "take_profit": float(pos.take_profit) if pos.take_profit else None,
            "swap": float(pos.swap or 0),
            "commission": float(pos.commission or 0),
            "profit": profit,
            "status": pos_status_val,
            "contract_size": float(contract_size),
            "trade_type": trade_type,
            "created_at": pos.created_at.isoformat() if pos.created_at else None,
            "closed_at": pos.closed_at.isoformat() if getattr(pos, 'closed_at', None) else None,
        })

    return response


@router.put("/{position_id}")
async def modify_position(
    position_id: UUID,
    req: ModifyPositionRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Position).where(Position.id == position_id))
    pos = result.scalar_one_or_none()
    if not pos:
        raise HTTPException(status_code=404, detail="Position not found")

    acct_result = await db.execute(
        select(TradingAccount).where(
            TradingAccount.id == pos.account_id,
            TradingAccount.user_id == current_user["user_id"],
        )
    )
    if not acct_result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not your position")

    pos_status = pos.status.value if hasattr(pos.status, 'value') else str(pos.status)
    if pos_status != "open":
        raise HTTPException(status_code=400, detail="Position is not open")

    sv = _side_val(pos.side)
    updated = False

    if req.stop_loss is not None:
        if sv == "buy" and req.stop_loss >= pos.open_price:
            raise HTTPException(status_code=400, detail="BUY SL must be below open price")
        if sv == "sell" and req.stop_loss <= pos.open_price:
            raise HTTPException(status_code=400, detail="SELL SL must be above open price")
        pos.stop_loss = req.stop_loss
        updated = True

    if req.take_profit is not None:
        if sv == "buy" and req.take_profit <= pos.open_price:
            raise HTTPException(status_code=400, detail="BUY TP must be above open price")
        if sv == "sell" and req.take_profit >= pos.open_price:
            raise HTTPException(status_code=400, detail="SELL TP must be below open price")
        pos.take_profit = req.take_profit
        updated = True

    if updated:
        await db.commit()

    return {
        "message": "Position modified",
        "stop_loss": float(pos.stop_loss) if pos.stop_loss else None,
        "take_profit": float(pos.take_profit) if pos.take_profit else None,
    }


@router.post("/{position_id}/close")
async def close_position(
    position_id: UUID,
    req: ClosePositionRequest = ClosePositionRequest(),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Position).where(Position.id == position_id))
    pos = result.scalar_one_or_none()
    if not pos:
        raise HTTPException(status_code=404, detail="Position not found")

    acct_result = await db.execute(
        select(TradingAccount).where(
            TradingAccount.id == pos.account_id,
            TradingAccount.user_id == current_user["user_id"],
        )
    )
    account = acct_result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=403, detail="Not your position")

    pos_status = pos.status.value if hasattr(pos.status, 'value') else str(pos.status)
    if pos_status != "open":
        raise HTTPException(status_code=400, detail="Position is not open")

    tick_data = await redis_client.get(PriceChannel.tick_key(pos.instrument.symbol))
    if not tick_data:
        raise HTTPException(status_code=400, detail="No price available")

    tick = json.loads(tick_data)
    sv = _side_val(pos.side)
    close_price = Decimal(str(tick["bid"])) if sv == "buy" else Decimal(str(tick["ask"]))
    contract_size = pos.instrument.contract_size if pos.instrument else Decimal("100000")

    close_lots = Decimal(str(req.lots)) if req.lots and Decimal(str(req.lots)) < pos.lots else pos.lots
    is_partial = close_lots < pos.lots

    full_profit = _calc_pnl(pos.side, pos.open_price, close_price, pos.lots, contract_size)

    if is_partial:
        ratio = close_lots / pos.lots
        partial_profit = full_profit * ratio
        partial_commission = (pos.commission or Decimal("0")) * ratio
        partial_swap = (pos.swap or Decimal("0")) * ratio

        pos.lots -= close_lots

        history = TradeHistory(
            position_id=pos.id,
            account_id=pos.account_id,
            instrument_id=pos.instrument_id,
            side=pos.side,
            lots=close_lots,
            open_price=pos.open_price,
            close_price=close_price,
            swap=partial_swap,
            commission=partial_commission,
            profit=partial_profit,
            close_reason="manual",
            opened_at=pos.created_at,
            closed_at=datetime.utcnow(),
        )
        db.add(history)

        account.balance += partial_profit
        partial_margin = (close_lots * contract_size * pos.open_price) / Decimal(str(account.leverage))
        account.margin_used = max(Decimal("0"), (account.margin_used or Decimal("0")) - partial_margin)

        result_msg = f"Partial close: {close_lots} lots"
        result_profit = partial_profit
    else:
        pos.status = "closed"
        pos.close_price = close_price
        pos.profit = full_profit
        pos.closed_at = datetime.utcnow()

        history = TradeHistory(
            position_id=pos.id,
            account_id=pos.account_id,
            instrument_id=pos.instrument_id,
            side=pos.side,
            lots=pos.lots,
            open_price=pos.open_price,
            close_price=close_price,
            swap=pos.swap or Decimal("0"),
            commission=pos.commission or Decimal("0"),
            profit=full_profit,
            close_reason="manual",
            opened_at=pos.created_at,
            closed_at=datetime.utcnow(),
        )
        db.add(history)

        account.balance += full_profit
        margin_release = (pos.lots * contract_size * pos.open_price) / Decimal(str(account.leverage))
        account.margin_used = max(Decimal("0"), (account.margin_used or Decimal("0")) - margin_release)

        result_msg = "Position closed"
        result_profit = full_profit

    account.equity = account.balance + (account.credit or Decimal("0"))
    account.free_margin = account.equity - (account.margin_used or Decimal("0"))

    tx = Transaction(
        user_id=current_user["user_id"],
        account_id=account.id,
        type="profit" if result_profit >= 0 else "loss",
        amount=result_profit,
        balance_after=account.balance,
        reference_id=pos.id,
        description=f"{'Partial ' if is_partial else ''}Close {pos.instrument.symbol} {sv} {close_lots} lots @ {close_price}",
    )
    db.add(tx)

    pnl_str = f"+${float(result_profit):.2f}" if result_profit >= 0 else f"-${abs(float(result_profit)):.2f}"
    await create_notification(
        db, current_user["user_id"],
        title=f"{'Partial Close' if is_partial else 'Position Closed'} — {pos.instrument.symbol if pos.instrument else ''}",
        message=f"{sv.upper()} {close_lots} lots @ {close_price} | P&L: {pnl_str}",
        notif_type="trade", action_url="/trading", commit=False,
    )

    await db.commit()

    asyncio.create_task(_fire_event(KafkaTopics.TRADES, str(pos.id), {
        "event": "position_closed",
        "position_id": str(pos.id),
        "symbol": pos.instrument.symbol,
        "profit": str(result_profit),
        "partial": is_partial,
    }))

    try:
        await redis_client.publish(f"account:{account.id}", json.dumps({
            "type": "position_closed",
            "position_id": str(pos.id),
            "profit": str(result_profit),
        }))
    except Exception:
        pass

    return {
        "message": result_msg,
        "close_price": float(close_price),
        "profit": float(result_profit),
        "lots_closed": float(close_lots),
        "remaining_lots": float(pos.lots) if is_partial else 0,
        "balance": float(account.balance),
    }
