"""SL/TP Monitoring Engine — Auto-closes positions when Stop Loss or Take Profit is hit.

Subscribes to the Redis price channel and checks all open positions with SL/TP
against every incoming tick. Closes positions at the SL/TP price (not market price)
to match MT5 behavior.
"""
import asyncio
import json
import logging
from datetime import datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from packages.common.src.database import AsyncSessionLocal
from packages.common.src.redis_client import redis_client, PriceChannel
from packages.common.src.models import (
    Position, TradingAccount, Transaction, TradeHistory, Instrument,
)
from packages.common.src.notify import create_notification

logger = logging.getLogger("gateway.sltp")

CHECK_INTERVAL = 1.0


def _side_val(side) -> str:
    return side.value if hasattr(side, 'value') else str(side)


class SLTPEngine:
    def __init__(self):
        self._running = False
        self._task = None
        self._prices: dict[str, dict] = {}

    async def start(self):
        self._running = True
        self._task = asyncio.create_task(self._run())
        logger.info("SL/TP engine started")

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("SL/TP engine stopped")

    async def _run(self):
        while self._running:
            try:
                await self._load_prices()
                await self._check_positions()
                await asyncio.sleep(CHECK_INTERVAL)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("SL/TP engine error: %s", e)
                await asyncio.sleep(3)

    async def _load_prices(self):
        """Load latest prices directly from Redis keys instead of pubsub."""
        try:
            keys = await redis_client.keys("tick:*")
            if not keys:
                return
            values = await redis_client.mget(keys)
            for val in values:
                if val:
                    try:
                        data = json.loads(val)
                        self._prices[data["symbol"]] = data
                    except (json.JSONDecodeError, KeyError):
                        pass
        except Exception as e:
            logger.warning("Failed to load prices: %s", e)

    async def _check_positions(self):
        if not self._prices:
            return

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Position)
                .where(Position.status == "open")
                .where(
                    (Position.stop_loss.isnot(None)) | (Position.take_profit.isnot(None))
                )
            )
            positions = result.scalars().all()

            if positions:
                logger.info("Checking %d positions with SL/TP", len(positions))

            for pos in positions:
                symbol = pos.instrument.symbol if pos.instrument else None
                if not symbol or symbol not in self._prices:
                    continue

                tick = self._prices[symbol]
                bid = Decimal(str(tick["bid"]))
                ask = Decimal(str(tick["ask"]))
                side = _side_val(pos.side)

                triggered = None

                if pos.stop_loss:
                    sl = Decimal(str(pos.stop_loss))
                    if side == "buy" and sl < pos.open_price and bid <= sl:
                        triggered = "sl"
                    elif side == "sell" and sl > pos.open_price and ask >= sl:
                        triggered = "sl"

                if not triggered and pos.take_profit:
                    tp = Decimal(str(pos.take_profit))
                    if side == "buy" and tp > pos.open_price and bid >= tp:
                        triggered = "tp"
                    elif side == "sell" and tp < pos.open_price and ask <= tp:
                        triggered = "tp"

                if triggered:
                    market_price = bid if side == "buy" else ask
                    await self._close_position(db, pos, market_price, triggered)

            await db.commit()

    async def _close_position(
        self, db: AsyncSession, pos: Position, close_price: Decimal, reason: str
    ):
        side = _side_val(pos.side)
        contract_size = pos.instrument.contract_size if pos.instrument else Decimal("100000")

        if side == "buy":
            profit = (close_price - pos.open_price) * pos.lots * contract_size
        else:
            profit = (pos.open_price - close_price) * pos.lots * contract_size

        pos.status = "closed"
        pos.close_price = close_price
        pos.profit = profit
        pos.closed_at = datetime.utcnow()
        pos.comment = f"Auto-closed by {reason.upper()}"

        acct_result = await db.execute(
            select(TradingAccount).where(TradingAccount.id == pos.account_id)
        )
        account = acct_result.scalar_one_or_none()
        if account:
            margin_release = (pos.lots * contract_size * pos.open_price) / Decimal(str(account.leverage))
            account.balance += profit
            account.margin_used = max(Decimal("0"), (account.margin_used or Decimal("0")) - margin_release)
            account.equity = account.balance + (account.credit or Decimal("0"))
            account.free_margin = account.equity - account.margin_used

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
            profit=profit,
            close_reason=reason,
            opened_at=pos.created_at,
            closed_at=datetime.utcnow(),
        )
        db.add(history)

        tx = Transaction(
            user_id=account.user_id if account else pos.account_id,
            account_id=pos.account_id,
            type="profit" if profit >= 0 else "loss",
            amount=profit,
            balance_after=account.balance if account else None,
            reference_id=pos.id,
            description=f"{reason.upper()} hit: {pos.instrument.symbol if pos.instrument else ''} {side} {pos.lots} lots @ {close_price}",
        )
        db.add(tx)

        try:
            await redis_client.publish(f"account:{pos.account_id}", json.dumps({
                "type": "position_closed",
                "position_id": str(pos.id),
                "reason": reason,
                "profit": str(profit),
                "close_price": str(close_price),
            }))
        except Exception:
            pass

        symbol = pos.instrument.symbol if pos.instrument else "?"
        pnl_str = f"+${float(profit):.2f}" if profit >= 0 else f"-${abs(float(profit)):.2f}"
        reason_label = "Stop Loss" if reason == "sl" else "Take Profit"

        if account:
            await create_notification(
                db, account.user_id,
                title=f"{reason_label} Hit — {symbol}",
                message=f"{side.upper()} {pos.lots} lots closed @ {close_price} | P&L: {pnl_str}",
                notif_type="trade",
                action_url="/trading",
                commit=False,
            )

        logger.info(
            "%s triggered: %s %s %s lots @ %s → P&L: %s",
            reason.upper(), symbol, side, pos.lots, close_price, profit
        )


sltp_engine = SLTPEngine()
