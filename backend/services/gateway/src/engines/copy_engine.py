"""Copy Trade Engine — Replicates master trades to investor accounts.

How it works:
1. Polls every 2 seconds for master accounts with active investors
2. Checks master's open positions against investor's copied positions
3. Opens new positions on investor accounts when master opens a trade
4. Closes investor positions when master closes a trade
5. Distributes profit: investor gets (profit - performance_fee), master gets performance_fee

Commission flow:
- performance_fee_pct: % of investor profit goes to master
- admin_commission_pct: % of performance fee goes to admin (platform revenue)
"""
import asyncio
import json
import logging
from decimal import Decimal
from datetime import datetime, timezone
from uuid import UUID
from collections import defaultdict

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from packages.common.src.database import AsyncSessionLocal
from packages.common.src.models import (
    MasterAccount, InvestorAllocation, CopyTrade, Position, PositionStatus,
    TradingAccount, Instrument, OrderSide, Order, OrderType, OrderStatus,
    TradeHistory, Transaction,
)
from packages.common.src.redis_client import redis_client, PriceChannel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("copy-engine")


class CopyTradeEngine:
    def __init__(self):
        self._running = False
        self._master_positions: dict[str, set[str]] = defaultdict(set)

    async def start(self):
        self._running = True
        logger.info("Copy Trade Engine started")
        asyncio.create_task(self._run())

    async def stop(self):
        self._running = False

    async def _run(self):
        while self._running:
            try:
                async with AsyncSessionLocal() as db:
                    masters = await db.execute(
                        select(MasterAccount).where(
                            MasterAccount.status.in_(["approved", "active"]),
                            MasterAccount.followers_count > 0,
                        )
                    )
                    for master in masters.scalars().all():
                        await self._sync_master(master, db)
                    await db.commit()
            except Exception as e:
                logger.error(f"Copy engine error: {e}")

            await asyncio.sleep(2)

    async def _sync_master(self, master: MasterAccount, db: AsyncSession):
        master_id_str = str(master.id)

        master_positions_q = await db.execute(
            select(Position).where(
                Position.account_id == master.account_id,
                Position.status == PositionStatus.OPEN,
            )
        )
        master_open = {}
        for p in master_positions_q.scalars().all():
            if p.comment and "Copy of master" in p.comment:
                continue
            master_open[str(p.id)] = p
        current_master_pos_ids = set(master_open.keys())
        prev_master_pos_ids = self._master_positions.get(master_id_str, set())

        investors = await db.execute(
            select(InvestorAllocation).where(
                InvestorAllocation.master_id == master.id,
                InvestorAllocation.status == "active",
            )
        )
        active_investors = investors.scalars().all()
        if not active_investors:
            self._master_positions[master_id_str] = current_master_pos_ids
            return

        master_account = await db.get(TradingAccount, master.account_id)
        if not master_account:
            return
        master_equity = float(master_account.equity or master_account.balance or Decimal("1"))

        new_positions = current_master_pos_ids - prev_master_pos_ids
        closed_positions = prev_master_pos_ids - current_master_pos_ids

        for pos_id in new_positions:
            master_pos = master_open[pos_id]
            for investor in active_investors:
                investor_account = await db.get(TradingAccount, investor.investor_account_id)
                if not investor_account or not investor_account.is_active:
                    continue
                await self._open_copy(master, master_pos, investor, investor_account, master_equity, db)

        for closed_id in closed_positions:
            copies = await db.execute(
                select(CopyTrade).where(
                    CopyTrade.master_position_id == UUID(closed_id),
                    CopyTrade.status == "open",
                )
            )
            for copy in copies.scalars().all():
                await self._close_copy(copy, master, db)

        self._master_positions[master_id_str] = current_master_pos_ids

    async def _open_copy(
        self,
        master: MasterAccount,
        master_pos: Position,
        investor: InvestorAllocation,
        investor_account: TradingAccount,
        master_equity: float,
        db: AsyncSession,
    ):
        instrument = master_pos.instrument
        if not instrument:
            return

        existing_q = await db.execute(
            select(CopyTrade).where(
                CopyTrade.master_position_id == master_pos.id,
                CopyTrade.investor_allocation_id == investor.id,
                CopyTrade.status == "open",
            )
        )
        if existing_q.scalar_one_or_none():
            return

        side_val = master_pos.side.value if hasattr(master_pos.side, 'value') else str(master_pos.side)
        master_lots = float(master_pos.lots or 0)

        investor_equity = float(investor_account.equity or investor_account.balance or Decimal("0"))
        if investor_equity <= 0:
            return

        equity_ratio = investor_equity / max(master_equity, 1)
        copy_lots = round(master_lots * equity_ratio, 2)

        lot_step = float(instrument.lot_step or Decimal("0.01"))
        copy_lots = max(lot_step, round(copy_lots / lot_step) * lot_step)

        min_lot = float(instrument.min_lot or Decimal("0.01"))
        max_lot = float(instrument.max_lot or Decimal("100"))
        copy_lots = max(min_lot, min(copy_lots, max_lot))

        if investor.max_lot_override and copy_lots > float(investor.max_lot_override):
            copy_lots = float(investor.max_lot_override)

        contract_size = float(instrument.contract_size or 100000)
        required_margin = Decimal(str(copy_lots * contract_size * float(master_pos.open_price) / investor_account.leverage))

        if required_margin > (investor_account.free_margin or Decimal("0")):
            logger.warning(f"Insufficient margin for copy: investor={investor.investor_account_id}")
            return

        position = Position(
            account_id=investor_account.id,
            instrument_id=master_pos.instrument_id,
            side=side_val,
            status=PositionStatus.OPEN.value,
            lots=Decimal(str(copy_lots)),
            open_price=master_pos.open_price,
            stop_loss=master_pos.stop_loss,
            take_profit=master_pos.take_profit,
            comment=f"Copy of master {master.id}",
        )
        db.add(position)
        await db.flush()

        copy_record = CopyTrade(
            master_position_id=master_pos.id,
            investor_allocation_id=investor.id,
            investor_position_id=position.id,
            ratio=Decimal(str(copy_lots / master_lots)) if master_lots > 0 else Decimal("1"),
            status="open",
        )
        db.add(copy_record)

        investor_account.margin_used = (investor_account.margin_used or Decimal("0")) + required_margin
        investor_account.free_margin = investor_account.equity - investor_account.margin_used

        logger.info(
            f"Copy opened: {instrument.symbol} {side_val} {copy_lots} lots "
            f"for investor {investor_account.account_number} "
            f"(master {master_lots} lots × ratio {equity_ratio:.4f})"
        )

    async def _close_copy(self, copy: CopyTrade, master: MasterAccount, db: AsyncSession):
        investor_pos = await db.get(Position, copy.investor_position_id)
        if not investor_pos:
            copy.status = "closed"
            return

        pos_status = investor_pos.status.value if hasattr(investor_pos.status, 'value') else str(investor_pos.status)
        if pos_status != "open":
            copy.status = "closed"
            return

        instrument = investor_pos.instrument
        if not instrument:
            copy.status = "closed"
            return

        tick_data = await redis_client.get(PriceChannel.tick_key(instrument.symbol))
        if not tick_data:
            return

        tick = json.loads(tick_data)
        side_val = investor_pos.side.value if hasattr(investor_pos.side, 'value') else str(investor_pos.side)
        close_price = Decimal(str(tick["bid"])) if side_val == "buy" else Decimal(str(tick["ask"]))
        contract_size = instrument.contract_size or Decimal("100000")

        if side_val == "buy":
            gross_profit = (close_price - investor_pos.open_price) * investor_pos.lots * contract_size
        else:
            gross_profit = (investor_pos.open_price - close_price) * investor_pos.lots * contract_size

        performance_fee = Decimal("0")
        admin_fee = Decimal("0")
        if gross_profit > 0:
            perf_pct = master.performance_fee_pct or Decimal("0")
            performance_fee = gross_profit * perf_pct / Decimal("100")
            admin_pct = master.admin_commission_pct or Decimal("0")
            admin_fee = performance_fee * admin_pct / Decimal("100")

        net_profit = gross_profit - performance_fee

        investor_pos.status = PositionStatus.CLOSED.value
        investor_pos.close_price = close_price
        investor_pos.profit = net_profit
        investor_pos.closed_at = datetime.now(timezone.utc)

        investor_account = await db.get(TradingAccount, investor_pos.account_id)
        if investor_account:
            investor_account.balance = (investor_account.balance or Decimal("0")) + net_profit
            margin_release = (investor_pos.lots * contract_size * investor_pos.open_price) / Decimal(str(investor_account.leverage))
            investor_account.margin_used = max(Decimal("0"), (investor_account.margin_used or Decimal("0")) - margin_release)
            investor_account.equity = investor_account.balance + (investor_account.credit or Decimal("0"))
            investor_account.free_margin = investor_account.equity - investor_account.margin_used

        alloc = await db.get(InvestorAllocation, copy.investor_allocation_id)
        if alloc:
            alloc.total_profit = (alloc.total_profit or Decimal("0")) + net_profit

        history = TradeHistory(
            position_id=investor_pos.id,
            account_id=investor_pos.account_id,
            instrument_id=investor_pos.instrument_id,
            side=investor_pos.side,
            lots=investor_pos.lots,
            open_price=investor_pos.open_price,
            close_price=close_price,
            swap=investor_pos.swap or Decimal("0"),
            commission=investor_pos.commission or Decimal("0"),
            profit=net_profit,
            close_reason="copy_close",
            opened_at=investor_pos.created_at,
            closed_at=datetime.now(timezone.utc),
        )
        db.add(history)

        if investor_account and investor_account.user_id:
            if performance_fee > 0:
                db.add(Transaction(
                    user_id=investor_account.user_id,
                    account_id=investor_account.id,
                    type="commission",
                    amount=-performance_fee,
                    balance_after=investor_account.balance,
                    reference_id=investor_pos.id,
                    description=f"Performance fee ({master.performance_fee_pct}%) on copy trade",
                ))

        if performance_fee > 0:
            master_account = await db.get(TradingAccount, master.account_id)
            if master_account:
                master_share = performance_fee - admin_fee
                master_account.balance = (master_account.balance or Decimal("0")) + master_share
                master_account.equity = master_account.balance + (master_account.credit or Decimal("0"))
                master_account.free_margin = master_account.equity - (master_account.margin_used or Decimal("0"))

                db.add(Transaction(
                    user_id=master.user_id,
                    account_id=master_account.id,
                    type="ib_commission",
                    amount=master_share,
                    balance_after=master_account.balance,
                    reference_id=investor_pos.id,
                    description=f"Performance fee earned from copy trade",
                ))

                if admin_fee > 0:
                    db.add(Transaction(
                        user_id=master.user_id,
                        account_id=master_account.id,
                        type="commission",
                        amount=admin_fee,
                        balance_after=master_account.balance,
                        reference_id=investor_pos.id,
                        description=f"Admin commission ({master.admin_commission_pct}%) from copy trade performance fee",
                    ))

        copy.status = "closed"

        logger.info(
            f"Copy closed: {instrument.symbol} {side_val} {investor_pos.lots} lots "
            f"| gross={gross_profit:.2f} perf_fee={performance_fee:.2f} net={net_profit:.2f}"
        )


copy_engine = CopyTradeEngine()
