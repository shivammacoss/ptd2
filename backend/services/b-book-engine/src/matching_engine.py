"""B-Book Matching Engine — All orders execute against the house book.

This is the core execution engine. In a B-Book model:
- Market orders fill immediately at current bid/ask
- Pending orders (limit, stop, stop-limit) are monitored and triggered when price conditions are met
- No external liquidity — the admin/house is the counterparty to every trade
- Spread markup is applied on top of feed prices
"""
import asyncio
import json
import logging
from decimal import Decimal
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from packages.common.src.database import AsyncSessionLocal
from packages.common.src.models import (
    Order, OrderType, OrderSide, OrderStatus,
    Position, PositionStatus, TradingAccount, Instrument,
    SpreadConfig, ChargeConfig, Transaction
)
from packages.common.src.redis_client import redis_client, PriceChannel
from packages.common.src.kafka_client import produce_event, KafkaTopics

logger = logging.getLogger("b-book-engine")


class MatchingEngine:
    def __init__(self):
        self._running = False

    async def start(self):
        self._running = True
        logger.info("B-Book Matching Engine started")

        await asyncio.gather(
            self._monitor_pending_orders(),
            self._monitor_sl_tp(),
        )

    async def stop(self):
        self._running = False

    async def _get_price(self, symbol: str) -> Optional[tuple[Decimal, Decimal]]:
        tick_data = await redis_client.get(PriceChannel.tick_key(symbol))
        if not tick_data:
            return None
        tick = json.loads(tick_data)
        return Decimal(str(tick["bid"])), Decimal(str(tick["ask"]))

    async def _get_spread_markup(self, instrument_id, user_id, segment_id, db: AsyncSession) -> Decimal:
        """Resolve spread markup using the config hierarchy: user > instrument > segment > default."""
        for scope, sid, iid, uid in [
            ("user", None, None, user_id),
            ("instrument", None, instrument_id, None),
            ("segment", segment_id, None, None),
            ("default", None, None, None),
        ]:
            query = select(SpreadConfig).where(
                SpreadConfig.scope == scope,
                SpreadConfig.is_enabled == True,
            )
            if uid:
                query = query.where(SpreadConfig.user_id == uid)
            if iid:
                query = query.where(SpreadConfig.instrument_id == iid)
            if sid:
                query = query.where(SpreadConfig.segment_id == sid)

            result = await db.execute(query)
            config = result.scalar_one_or_none()
            if config:
                return config.value

        return Decimal("0")

    async def _get_commission(self, instrument_id, user_id, segment_id, lots: Decimal, db: AsyncSession) -> Decimal:
        """Resolve commission using config hierarchy."""
        for scope, sid, iid, uid in [
            ("user", None, None, user_id),
            ("instrument", None, instrument_id, None),
            ("segment", segment_id, None, None),
            ("default", None, None, None),
        ]:
            query = select(ChargeConfig).where(
                ChargeConfig.scope == scope,
                ChargeConfig.is_enabled == True,
            )
            if uid:
                query = query.where(ChargeConfig.user_id == uid)
            if iid:
                query = query.where(ChargeConfig.instrument_id == iid)
            if sid:
                query = query.where(ChargeConfig.segment_id == sid)

            result = await db.execute(query)
            config = result.scalar_one_or_none()
            if config:
                if config.charge_type == "commission_per_lot":
                    return config.value * lots
                elif config.charge_type == "commission_per_trade":
                    return config.value
                elif config.charge_type == "spread_percentage":
                    return Decimal("0")

        return Decimal("0")

    async def _monitor_pending_orders(self):
        """Monitor and trigger pending orders when price conditions are met."""
        logger.info("Pending order monitor started")
        while self._running:
            try:
                async with AsyncSessionLocal() as db:
                    result = await db.execute(
                        select(Order).where(Order.status == OrderStatus.PENDING)
                    )
                    pending_orders = result.scalars().all()

                    for order in pending_orders:
                        if order.expires_at and datetime.now(timezone.utc) > order.expires_at:
                            order.status = OrderStatus.EXPIRED
                            await db.commit()
                            continue

                        price_data = await self._get_price(order.instrument.symbol)
                        if not price_data:
                            continue

                        bid, ask = price_data
                        triggered = False

                        if order.order_type == OrderType.LIMIT:
                            if order.side == OrderSide.BUY and ask <= order.price:
                                triggered = True
                            elif order.side == OrderSide.SELL and bid >= order.price:
                                triggered = True

                        elif order.order_type == OrderType.STOP:
                            if order.side == OrderSide.BUY and ask >= order.price:
                                triggered = True
                            elif order.side == OrderSide.SELL and bid <= order.price:
                                triggered = True

                        elif order.order_type == OrderType.STOP_LIMIT:
                            if order.side == OrderSide.BUY and ask >= order.price:
                                if order.stop_limit_price and ask <= order.stop_limit_price:
                                    triggered = True
                            elif order.side == OrderSide.SELL and bid <= order.price:
                                if order.stop_limit_price and bid >= order.stop_limit_price:
                                    triggered = True

                        if triggered:
                            await self._execute_pending_order(order, bid, ask, db)

                    await db.commit()

            except Exception as e:
                logger.error(f"Pending order monitor error: {e}")

            await asyncio.sleep(0.1)

    async def _execute_pending_order(self, order: Order, bid: Decimal, ask: Decimal, db: AsyncSession):
        fill_price = ask if order.side == OrderSide.BUY else bid

        account = await db.get(TradingAccount, order.account_id)
        if not account or not account.is_active:
            order.status = OrderStatus.REJECTED
            return

        instrument = await db.get(Instrument, order.instrument_id)
        margin = (order.lots * instrument.contract_size * fill_price) / Decimal(str(account.leverage))

        if margin > account.free_margin:
            order.status = OrderStatus.REJECTED
            return

        order.status = OrderStatus.FILLED
        order.filled_price = fill_price
        order.filled_at = datetime.now(timezone.utc)

        position = Position(
            account_id=account.id,
            instrument_id=instrument.id,
            order_id=order.id,
            side=order.side,
            lots=order.lots,
            open_price=fill_price,
            stop_loss=order.stop_loss,
            take_profit=order.take_profit,
            status=PositionStatus.OPEN,
        )
        db.add(position)

        account.margin_used += margin
        account.free_margin = account.equity - account.margin_used

        logger.info(f"Pending order {order.id} executed: {instrument.symbol} {order.side.value} @ {fill_price}")

        await redis_client.publish(f"account:{account.id}", json.dumps({
            "type": "order_filled",
            "order_id": str(order.id),
            "symbol": instrument.symbol,
            "side": order.side.value,
            "price": str(fill_price),
            "lots": str(order.lots),
        }))

    async def _monitor_sl_tp(self):
        """Monitor open positions for SL/TP hits."""
        logger.info("SL/TP monitor started")
        while self._running:
            try:
                async with AsyncSessionLocal() as db:
                    result = await db.execute(
                        select(Position).where(
                            Position.status == PositionStatus.OPEN,
                            (Position.stop_loss.isnot(None)) | (Position.take_profit.isnot(None))
                        )
                    )
                    positions = result.scalars().all()

                    for pos in positions:
                        price_data = await self._get_price(pos.instrument.symbol)
                        if not price_data:
                            continue

                        bid, ask = price_data
                        close_price = bid if pos.side == OrderSide.BUY else ask

                        sl_hit = False
                        tp_hit = False

                        if pos.stop_loss:
                            if pos.side == OrderSide.BUY and close_price <= pos.stop_loss:
                                sl_hit = True
                            elif pos.side == OrderSide.SELL and close_price >= pos.stop_loss:
                                sl_hit = True

                        if pos.take_profit:
                            if pos.side == OrderSide.BUY and close_price >= pos.take_profit:
                                tp_hit = True
                            elif pos.side == OrderSide.SELL and close_price <= pos.take_profit:
                                tp_hit = True

                        if sl_hit or tp_hit:
                            await self._close_position(pos, close_price, "sl" if sl_hit else "tp", db)

                    await db.commit()

            except Exception as e:
                logger.error(f"SL/TP monitor error: {e}")

            await asyncio.sleep(0.1)

    async def _close_position(self, pos: Position, close_price: Decimal, reason: str, db: AsyncSession):
        instrument = pos.instrument
        if pos.side == OrderSide.BUY:
            profit = (close_price - pos.open_price) * pos.lots * instrument.contract_size
        else:
            profit = (pos.open_price - close_price) * pos.lots * instrument.contract_size

        pos.status = PositionStatus.CLOSED
        pos.close_price = close_price
        pos.profit = profit
        pos.closed_at = datetime.now(timezone.utc)

        account = await db.get(TradingAccount, pos.account_id)
        if account:
            account.balance += profit
            margin_release = (pos.lots * instrument.contract_size * pos.open_price) / Decimal(str(account.leverage))
            account.margin_used = max(Decimal("0"), account.margin_used - margin_release)
            account.equity = account.balance + account.credit
            account.free_margin = account.equity - account.margin_used

        logger.info(
            f"Position {pos.id} closed by {reason}: {instrument.symbol} "
            f"{pos.side.value} @ {close_price}, profit: {profit}"
        )

        await redis_client.publish(f"account:{pos.account_id}", json.dumps({
            "type": f"position_closed_{reason}",
            "position_id": str(pos.id),
            "symbol": instrument.symbol,
            "close_price": str(close_price),
            "profit": str(profit),
        }))

        await produce_event(KafkaTopics.TRADES, str(pos.id), {
            "event": f"position_closed_{reason}",
            "position_id": str(pos.id),
            "account_id": str(pos.account_id),
            "symbol": instrument.symbol,
            "profit": str(profit),
        })
