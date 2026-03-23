"""Admin API — User Management, Trade Management, Deposits/Withdrawals, Config."""
import json
from decimal import Decimal
from uuid import UUID
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from packages.common.src.database import get_db
from packages.common.src.models import (
    User, TradingAccount, Order, Position, Deposit, Withdrawal,
    Transaction, AuditLog, BankAccount, ChargeConfig, SpreadConfig,
    SwapConfig, Instrument, InstrumentSegment, OrderType, OrderSide,
    OrderStatus, PositionStatus, Notification
)
from packages.common.src.schemas import (
    AdminFundAdjustment, AdminTradeCreate, AdminModifyTrade, BankAccountCreate
)
from packages.common.src.auth import require_admin, get_current_user, create_access_token
from packages.common.src.redis_client import redis_client, PriceChannel
from packages.common.src.kafka_client import produce_event, KafkaTopics

router = APIRouter()


async def _audit(db: AsyncSession, admin_id: UUID, action: str, entity_type: str,
                 entity_id: UUID, old_values: dict = None, new_values: dict = None, ip: str = None):
    log = AuditLog(
        admin_id=admin_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        old_values=old_values,
        new_values=new_values,
        ip_address=ip,
    )
    db.add(log)


# ============================================
# USER MANAGEMENT
# ============================================

@router.get("/users")
async def list_users(
    page: int = 1,
    per_page: int = 50,
    status: str | None = None,
    kyc_status: str | None = None,
    search: str | None = None,
    admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    query = select(User)
    if status:
        query = query.where(User.status == status)
    if kyc_status:
        query = query.where(User.kyc_status == kyc_status)
    if search:
        query = query.where(
            (User.email.ilike(f"%{search}%")) |
            (User.first_name.ilike(f"%{search}%")) |
            (User.last_name.ilike(f"%{search}%"))
        )

    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar()

    result = await db.execute(
        query.order_by(User.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    users = result.scalars().all()

    return {
        "items": [
            {
                "id": str(u.id), "email": u.email, "first_name": u.first_name,
                "last_name": u.last_name, "role": u.role, "status": u.status,
                "kyc_status": u.kyc_status, "created_at": str(u.created_at),
            }
            for u in users
        ],
        "total": total, "page": page, "per_page": per_page,
    }


@router.get("/users/{user_id}")
async def get_user_detail(
    user_id: UUID,
    admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    accounts = await db.execute(select(TradingAccount).where(TradingAccount.user_id == user_id))

    return {
        "user": {
            "id": str(user.id), "email": user.email, "first_name": user.first_name,
            "last_name": user.last_name, "phone": user.phone, "country": user.country,
            "role": user.role, "status": user.status, "kyc_status": user.kyc_status,
            "two_factor_enabled": user.two_factor_enabled,
            "created_at": str(user.created_at),
        },
        "accounts": [
            {
                "id": str(a.id), "account_number": a.account_number,
                "balance": str(a.balance), "credit": str(a.credit),
                "equity": str(a.equity), "leverage": a.leverage,
                "is_demo": a.is_demo, "is_active": a.is_active,
            }
            for a in accounts.scalars().all()
        ],
    }


@router.post("/users/{user_id}/impersonate")
async def impersonate_user(
    user_id: UUID,
    admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Login as user — admin sees exactly what user sees."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    token, expires = create_access_token(str(user.id), user.role, timedelta(hours=1))

    await _audit(db, admin["user_id"], "impersonate", "user", user_id)
    await db.commit()

    return {"access_token": token, "expires_at": str(expires), "user_email": user.email}


@router.post("/users/{user_id}/fund")
async def adjust_funds(
    user_id: UUID,
    req: AdminFundAdjustment,
    admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TradingAccount).where(TradingAccount.id == req.account_id)
    )
    account = result.scalar_one_or_none()
    if not account or account.user_id != user_id:
        raise HTTPException(status_code=404, detail="Account not found")

    old_balance = account.balance
    old_credit = account.credit

    if req.type in ("deposit", "adjustment"):
        account.balance += req.amount
    elif req.type == "withdrawal":
        if account.balance < req.amount:
            raise HTTPException(status_code=400, detail="Insufficient balance")
        account.balance -= req.amount
    elif req.type == "credit":
        if req.amount > 0:
            account.credit += req.amount
        else:
            account.credit = max(Decimal("0"), account.credit + req.amount)

    account.equity = account.balance + account.credit
    account.free_margin = account.equity - account.margin_used

    tx = Transaction(
        user_id=user_id,
        account_id=account.id,
        type=req.type,
        amount=req.amount,
        balance_after=account.balance,
        description=req.description or f"Admin {req.type}",
        created_by=admin["user_id"],
    )
    db.add(tx)

    await _audit(db, admin["user_id"], f"fund_{req.type}", "account", account.id,
                 {"balance": str(old_balance), "credit": str(old_credit)},
                 {"balance": str(account.balance), "credit": str(account.credit)})

    await db.commit()
    return {"message": f"Fund {req.type} successful", "new_balance": str(account.balance)}


@router.post("/users/{user_id}/ban")
async def ban_user(user_id: UUID, admin: dict = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.status = "banned"
    await _audit(db, admin["user_id"], "ban", "user", user_id)
    await db.commit()
    return {"message": "User banned"}


@router.post("/users/{user_id}/block")
async def block_user(user_id: UUID, admin: dict = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.status = "blocked"
    await _audit(db, admin["user_id"], "block", "user", user_id)
    await db.commit()
    return {"message": "User blocked (can view, cannot trade)"}


@router.post("/users/{user_id}/kill-switch")
async def kill_switch(user_id: UUID, admin: dict = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """Close all positions + block user immediately."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    accounts = await db.execute(select(TradingAccount).where(TradingAccount.user_id == user_id))
    closed_count = 0

    for account in accounts.scalars().all():
        positions = await db.execute(
            select(Position).where(
                Position.account_id == account.id,
                Position.status == PositionStatus.OPEN,
            )
        )
        for pos in positions.scalars().all():
            tick_data = await redis_client.get(PriceChannel.tick_key(pos.instrument.symbol))
            if tick_data:
                tick = json.loads(tick_data)
                close_price = Decimal(str(tick["bid"])) if pos.side == OrderSide.BUY else Decimal(str(tick["ask"]))
            else:
                close_price = pos.open_price

            if pos.side == OrderSide.BUY:
                profit = (close_price - pos.open_price) * pos.lots * pos.instrument.contract_size
            else:
                profit = (pos.open_price - close_price) * pos.lots * pos.instrument.contract_size

            pos.status = PositionStatus.CLOSED
            pos.close_price = close_price
            pos.profit = profit
            pos.closed_at = datetime.utcnow()
            pos.is_admin_modified = True

            account.balance += profit
            closed_count += 1

        account.margin_used = Decimal("0")
        account.equity = account.balance + account.credit
        account.free_margin = account.equity

    user.status = "blocked"

    await _audit(db, admin["user_id"], "kill_switch", "user", user_id,
                 new_values={"positions_closed": closed_count})
    await db.commit()

    return {"message": f"Kill switch activated: {closed_count} positions closed, user blocked"}


@router.post("/users/{user_id}/stop-trading")
async def stop_trading(
    user_id: UUID,
    hours: int = Query(default=24, ge=1, le=8760),
    admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.trading_blocked_until = datetime.utcnow() + timedelta(hours=hours)
    await _audit(db, admin["user_id"], "stop_trading", "user", user_id,
                 new_values={"blocked_until": str(user.trading_blocked_until)})
    await db.commit()

    return {"message": f"Trading blocked for {hours} hours", "blocked_until": str(user.trading_blocked_until)}


# ============================================
# TRADE MANAGEMENT (with stealth mode)
# ============================================

@router.get("/trades")
async def list_all_trades(
    status: str | None = None,
    symbol: str | None = None,
    user_id: UUID | None = None,
    page: int = 1,
    per_page: int = 50,
    admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    query = select(Position)
    if status:
        query = query.where(Position.status == PositionStatus(status))
    if user_id:
        query = query.join(TradingAccount).where(TradingAccount.user_id == user_id)
    if symbol:
        query = query.join(Instrument).where(Instrument.symbol == symbol.upper())

    result = await db.execute(
        query.order_by(Position.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    positions = result.scalars().all()

    return [
        {
            "id": str(p.id), "account_id": str(p.account_id),
            "symbol": p.instrument.symbol, "side": p.side.value,
            "lots": str(p.lots), "open_price": str(p.open_price),
            "close_price": str(p.close_price) if p.close_price else None,
            "stop_loss": str(p.stop_loss) if p.stop_loss else None,
            "take_profit": str(p.take_profit) if p.take_profit else None,
            "profit": str(p.profit), "status": p.status.value,
            "is_admin_modified": p.is_admin_modified,
            "created_at": str(p.created_at),
        }
        for p in positions
    ]


@router.post("/trades/create")
async def admin_create_trade(
    req: AdminTradeCreate,
    admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create trade in user's account — stealth mode makes it appear user-initiated."""
    account = await db.execute(select(TradingAccount).where(TradingAccount.id == req.account_id))
    account = account.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    inst = await db.execute(select(Instrument).where(Instrument.symbol == req.symbol.upper()))
    instrument = inst.scalar_one_or_none()
    if not instrument:
        raise HTTPException(status_code=404, detail="Instrument not found")

    tick_data = await redis_client.get(PriceChannel.tick_key(instrument.symbol))
    if not tick_data:
        raise HTTPException(status_code=400, detail="No price data")

    tick = json.loads(tick_data)
    fill_price = Decimal(str(tick["ask"])) if req.side == "buy" else Decimal(str(tick["bid"]))

    order = Order(
        account_id=account.id,
        instrument_id=instrument.id,
        order_type=OrderType(req.order_type),
        side=OrderSide(req.side),
        lots=req.lots,
        status=OrderStatus.FILLED,
        filled_price=fill_price,
        filled_at=datetime.utcnow(),
        is_admin_created=not req.stealth,
        admin_created_by=admin["user_id"] if not req.stealth else None,
    )
    db.add(order)
    await db.flush()

    position = Position(
        account_id=account.id,
        instrument_id=instrument.id,
        order_id=order.id,
        side=OrderSide(req.side),
        lots=req.lots,
        open_price=fill_price,
        stop_loss=req.stop_loss,
        take_profit=req.take_profit,
        status=PositionStatus.OPEN,
        is_admin_modified=not req.stealth,
    )
    db.add(position)

    margin = (req.lots * instrument.contract_size * fill_price) / Decimal(str(account.leverage))
    account.margin_used += margin
    account.free_margin = account.equity - account.margin_used

    await _audit(db, admin["user_id"], "create_trade", "position", position.id,
                 new_values={"symbol": req.symbol, "side": req.side, "lots": str(req.lots),
                             "price": str(fill_price), "stealth": req.stealth})
    await db.commit()

    return {"message": "Trade created", "position_id": str(position.id), "price": str(fill_price)}


@router.put("/trades/{position_id}")
async def admin_modify_trade(
    position_id: UUID,
    req: AdminModifyTrade,
    admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Modify running trade — stealth mode hides admin fingerprint."""
    result = await db.execute(select(Position).where(Position.id == position_id))
    pos = result.scalar_one_or_none()
    if not pos:
        raise HTTPException(status_code=404, detail="Position not found")

    old_values = {
        "stop_loss": str(pos.stop_loss) if pos.stop_loss else None,
        "take_profit": str(pos.take_profit) if pos.take_profit else None,
        "lots": str(pos.lots),
    }

    if req.stop_loss is not None:
        pos.stop_loss = req.stop_loss
    if req.take_profit is not None:
        pos.take_profit = req.take_profit
    if req.lots is not None:
        pos.lots = req.lots

    if not req.stealth:
        pos.is_admin_modified = True

    if req.close_lots:
        tick_data = await redis_client.get(PriceChannel.tick_key(pos.instrument.symbol))
        if tick_data:
            tick = json.loads(tick_data)
            close_price = Decimal(str(tick["bid"])) if pos.side == OrderSide.BUY else Decimal(str(tick["ask"]))

            if req.close_lots >= pos.lots:
                if pos.side == OrderSide.BUY:
                    profit = (close_price - pos.open_price) * pos.lots * pos.instrument.contract_size
                else:
                    profit = (pos.open_price - close_price) * pos.lots * pos.instrument.contract_size

                pos.status = PositionStatus.CLOSED
                pos.close_price = close_price
                pos.profit = profit
                pos.closed_at = datetime.utcnow()

                acct = await db.execute(select(TradingAccount).where(TradingAccount.id == pos.account_id))
                account = acct.scalar_one_or_none()
                if account:
                    account.balance += profit

    await _audit(db, admin["user_id"], "modify_trade", "position", position_id,
                 old_values=old_values,
                 new_values={"stop_loss": str(pos.stop_loss), "take_profit": str(pos.take_profit),
                             "lots": str(pos.lots), "stealth": req.stealth})
    await db.commit()

    return {"message": "Trade modified"}


# ============================================
# DEPOSIT / WITHDRAWAL MANAGEMENT
# ============================================

@router.get("/deposits")
async def admin_list_deposits(
    status: str | None = "pending",
    page: int = 1,
    per_page: int = 50,
    admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    query = select(Deposit)
    if status:
        query = query.where(Deposit.status == status)
    result = await db.execute(query.order_by(Deposit.created_at.desc()).offset((page-1)*per_page).limit(per_page))
    return result.scalars().all()


@router.post("/deposits/{deposit_id}/approve")
async def approve_deposit(
    deposit_id: UUID,
    admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Deposit).where(Deposit.id == deposit_id))
    deposit = result.scalar_one_or_none()
    if not deposit:
        raise HTTPException(status_code=404, detail="Deposit not found")

    if deposit.status != "pending":
        raise HTTPException(status_code=400, detail="Deposit already processed")

    deposit.status = "approved"
    deposit.approved_by = admin["user_id"]
    deposit.approved_at = datetime.utcnow()

    acct = await db.execute(select(TradingAccount).where(TradingAccount.id == deposit.account_id))
    account = acct.scalar_one_or_none()
    if account:
        account.balance += deposit.amount
        account.equity = account.balance + account.credit
        account.free_margin = account.equity - account.margin_used

    tx = Transaction(
        user_id=deposit.user_id,
        account_id=deposit.account_id,
        type="deposit",
        amount=deposit.amount,
        balance_after=account.balance if account else None,
        description=f"Deposit approved via {deposit.method}",
        created_by=admin["user_id"],
    )
    db.add(tx)

    notif = Notification(
        user_id=deposit.user_id,
        title="Deposit Approved",
        message=f"Your deposit of {deposit.amount} {deposit.currency} has been approved.",
        type="deposit",
    )
    db.add(notif)

    await _audit(db, admin["user_id"], "approve_deposit", "deposit", deposit_id)
    await db.commit()

    return {"message": "Deposit approved"}


@router.post("/deposits/{deposit_id}/reject")
async def reject_deposit(
    deposit_id: UUID,
    reason: str = "",
    admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Deposit).where(Deposit.id == deposit_id))
    deposit = result.scalar_one_or_none()
    if not deposit:
        raise HTTPException(status_code=404, detail="Deposit not found")

    deposit.status = "rejected"
    deposit.rejection_reason = reason
    deposit.approved_by = admin["user_id"]

    await _audit(db, admin["user_id"], "reject_deposit", "deposit", deposit_id,
                 new_values={"reason": reason})
    await db.commit()

    return {"message": "Deposit rejected"}


@router.post("/withdrawals/{withdrawal_id}/approve")
async def approve_withdrawal(
    withdrawal_id: UUID,
    admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Withdrawal).where(Withdrawal.id == withdrawal_id))
    withdrawal = result.scalar_one_or_none()
    if not withdrawal:
        raise HTTPException(status_code=404, detail="Withdrawal not found")

    if withdrawal.status != "pending":
        raise HTTPException(status_code=400, detail="Withdrawal already processed")

    acct = await db.execute(select(TradingAccount).where(TradingAccount.id == withdrawal.account_id))
    account = acct.scalar_one_or_none()
    if account and account.balance < withdrawal.amount:
        raise HTTPException(status_code=400, detail="Insufficient balance")

    withdrawal.status = "approved"
    withdrawal.approved_by = admin["user_id"]
    withdrawal.approved_at = datetime.utcnow()

    if account:
        account.balance -= withdrawal.amount
        account.equity = account.balance + account.credit
        account.free_margin = account.equity - account.margin_used

    tx = Transaction(
        user_id=withdrawal.user_id,
        account_id=withdrawal.account_id,
        type="withdrawal",
        amount=-withdrawal.amount,
        balance_after=account.balance if account else None,
        description=f"Withdrawal approved via {withdrawal.method}",
        created_by=admin["user_id"],
    )
    db.add(tx)

    await _audit(db, admin["user_id"], "approve_withdrawal", "withdrawal", withdrawal_id)
    await db.commit()

    return {"message": "Withdrawal approved"}


# ============================================
# BANK MANAGEMENT
# ============================================

@router.get("/banks")
async def list_banks(admin: dict = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(BankAccount).order_by(BankAccount.tier, BankAccount.rotation_order))
    return result.scalars().all()


@router.post("/banks")
async def add_bank(
    req: BankAccountCreate,
    admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    bank = BankAccount(**req.model_dump())
    db.add(bank)
    await db.commit()
    await db.refresh(bank)
    return bank


# ============================================
# INSTRUMENT MANAGEMENT
# ============================================

@router.get("/instruments")
async def list_instruments(
    page: int = 1,
    per_page: int = 100,
    segment_id: UUID | None = None,
    admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    query = select(Instrument)
    if segment_id:
        query = query.where(Instrument.segment_id == segment_id)

    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar()

    result = await db.execute(
        query.order_by(Instrument.symbol)
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    instruments = result.scalars().all()

    return {
        "items": [
            {
                "id": str(i.id), "symbol": i.symbol, "display_name": i.display_name,
                "segment_id": str(i.segment_id) if i.segment_id else None,
                "segment": {"id": str(i.segment.id), "name": i.segment.name} if i.segment else None,
                "digits": i.digits, "pip_size": str(i.pip_size),
                "min_lot": str(i.min_lot), "max_lot": str(i.max_lot),
                "lot_step": str(i.lot_step), "contract_size": str(i.contract_size),
                "margin_rate": str(i.margin_rate), "is_active": i.is_active,
            }
            for i in instruments
        ],
        "total": total, "page": page, "per_page": per_page,
    }


@router.post("/instruments", status_code=201)
async def create_instrument(
    symbol: str,
    display_name: str = "",
    segment_id: UUID | None = None,
    digits: int = 5,
    pip_size: Decimal = Decimal("0.0001"),
    min_lot: Decimal = Decimal("0.01"),
    max_lot: Decimal = Decimal("100"),
    lot_step: Decimal = Decimal("0.01"),
    contract_size: Decimal = Decimal("100000"),
    margin_rate: Decimal = Decimal("0.01"),
    admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(Instrument).where(Instrument.symbol == symbol.upper()))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Instrument already exists")

    if segment_id:
        seg = await db.execute(select(InstrumentSegment).where(InstrumentSegment.id == segment_id))
        if not seg.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Segment not found")

    instrument = Instrument(
        symbol=symbol.upper(), display_name=display_name, segment_id=segment_id,
        digits=digits, pip_size=pip_size, min_lot=min_lot, max_lot=max_lot,
        lot_step=lot_step, contract_size=contract_size, margin_rate=margin_rate,
    )
    db.add(instrument)

    await _audit(db, admin["user_id"], "create_instrument", "instrument", instrument.id,
                 new_values={"symbol": symbol.upper()})
    await db.commit()
    await db.refresh(instrument)

    return {"id": str(instrument.id), "symbol": instrument.symbol, "message": "Instrument created"}


@router.put("/instruments/{instrument_id}")
async def update_instrument(
    instrument_id: UUID,
    display_name: str | None = None,
    segment_id: UUID | None = None,
    digits: int | None = None,
    pip_size: Decimal | None = None,
    min_lot: Decimal | None = None,
    max_lot: Decimal | None = None,
    lot_step: Decimal | None = None,
    contract_size: Decimal | None = None,
    margin_rate: Decimal | None = None,
    is_active: bool | None = None,
    admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Instrument).where(Instrument.id == instrument_id))
    instrument = result.scalar_one_or_none()
    if not instrument:
        raise HTTPException(status_code=404, detail="Instrument not found")

    old_values = {"symbol": instrument.symbol, "is_active": instrument.is_active}
    updates = {
        "display_name": display_name, "segment_id": segment_id, "digits": digits,
        "pip_size": pip_size, "min_lot": min_lot, "max_lot": max_lot,
        "lot_step": lot_step, "contract_size": contract_size,
        "margin_rate": margin_rate, "is_active": is_active,
    }
    new_values = {}
    for field, value in updates.items():
        if value is not None:
            setattr(instrument, field, value)
            new_values[field] = str(value)

    await _audit(db, admin["user_id"], "update_instrument", "instrument", instrument_id,
                 old_values=old_values, new_values=new_values)
    await db.commit()

    return {"message": "Instrument updated", "symbol": instrument.symbol}


# ============================================
# KYC MANAGEMENT
# ============================================

@router.post("/users/{user_id}/kyc/approve")
async def approve_kyc(
    user_id: UUID,
    admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    old_status = user.kyc_status
    user.kyc_status = "approved"

    notif = Notification(
        user_id=user_id, title="KYC Approved",
        message="Your identity verification has been approved.", type="kyc",
    )
    db.add(notif)

    await _audit(db, admin["user_id"], "approve_kyc", "user", user_id,
                 old_values={"kyc_status": old_status}, new_values={"kyc_status": "approved"})
    await db.commit()

    return {"message": "KYC approved", "user_id": str(user_id)}


@router.post("/users/{user_id}/kyc/reject")
async def reject_kyc(
    user_id: UUID,
    reason: str = "",
    admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    old_status = user.kyc_status
    user.kyc_status = "rejected"

    notif = Notification(
        user_id=user_id, title="KYC Rejected",
        message=f"Your identity verification was rejected. Reason: {reason}" if reason else
                "Your identity verification was rejected.",
        type="kyc",
    )
    db.add(notif)

    await _audit(db, admin["user_id"], "reject_kyc", "user", user_id,
                 old_values={"kyc_status": old_status},
                 new_values={"kyc_status": "rejected", "reason": reason})
    await db.commit()

    return {"message": "KYC rejected", "user_id": str(user_id)}


# ============================================
# WITHDRAWAL MANAGEMENT
# ============================================

@router.get("/withdrawals")
async def list_withdrawals(
    status: str | None = None,
    page: int = 1,
    per_page: int = 50,
    admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    query = select(Withdrawal)
    if status:
        query = query.where(Withdrawal.status == status)

    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar()

    result = await db.execute(
        query.order_by(Withdrawal.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    withdrawals = result.scalars().all()

    items = []
    for w in withdrawals:
        items.append({
            "id": str(w.id), "user_id": str(w.user_id),
            "account_id": str(w.account_id), "amount": str(w.amount),
            "currency": w.currency, "method": w.method,
            "status": w.status,
            "created_at": str(w.created_at),
            "approved_at": str(w.approved_at) if w.approved_at else None,
        })

    return {
        "items": items,
        "total": total, "page": page, "per_page": per_page,
        "pages": (total + per_page - 1) // per_page if total else 0,
    }


# ============================================
# CHARGES / SPREAD / SWAP CONFIG
# ============================================

@router.get("/config/charges")
async def list_charges(admin: dict = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ChargeConfig).order_by(ChargeConfig.scope))
    return result.scalars().all()


@router.post("/config/charges")
async def set_charge(
    scope: str, charge_type: str, value: Decimal,
    segment_id: UUID | None = None, instrument_id: UUID | None = None, user_id: UUID | None = None,
    admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    config = ChargeConfig(
        scope=scope, segment_id=segment_id, instrument_id=instrument_id,
        user_id=user_id, charge_type=charge_type, value=value,
    )
    db.add(config)
    await db.commit()
    return {"message": "Charge config saved"}


@router.get("/config/spreads")
async def list_spreads(admin: dict = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SpreadConfig).order_by(SpreadConfig.scope))
    return result.scalars().all()


@router.post("/config/spreads")
async def set_spread(
    scope: str, spread_type: str, value: Decimal,
    segment_id: UUID | None = None, instrument_id: UUID | None = None, user_id: UUID | None = None,
    admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    config = SpreadConfig(
        scope=scope, segment_id=segment_id, instrument_id=instrument_id,
        user_id=user_id, spread_type=spread_type, value=value,
    )
    db.add(config)
    await db.commit()
    return {"message": "Spread config saved"}


@router.get("/config/swaps")
async def list_swaps(admin: dict = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SwapConfig).order_by(SwapConfig.scope))
    return result.scalars().all()


@router.post("/config/swaps")
async def set_swap(
    scope: str, swap_long: Decimal = Decimal("0"), swap_short: Decimal = Decimal("0"),
    triple_swap_day: int = 3, swap_free: bool = False,
    segment_id: UUID | None = None, instrument_id: UUID | None = None, user_id: UUID | None = None,
    admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    config = SwapConfig(
        scope=scope, segment_id=segment_id, instrument_id=instrument_id,
        user_id=user_id, swap_long=swap_long, swap_short=swap_short,
        triple_swap_day=triple_swap_day, swap_free=swap_free,
    )
    db.add(config)
    await db.commit()
    return {"message": "Swap config saved"}


# ============================================
# ANALYTICS
# ============================================

@router.get("/analytics/summary")
async def analytics_summary(admin: dict = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    total_users = await db.execute(select(func.count()).select_from(User))
    total_deposits = await db.execute(
        select(func.sum(Deposit.amount)).where(Deposit.status == "approved")
    )
    total_withdrawals = await db.execute(
        select(func.sum(Withdrawal.amount)).where(Withdrawal.status.in_(["approved", "completed"]))
    )
    open_positions = await db.execute(
        select(func.count()).select_from(Position).where(Position.status == PositionStatus.OPEN)
    )
    total_pnl = await db.execute(
        select(func.sum(Position.profit)).where(Position.status == PositionStatus.CLOSED)
    )

    return {
        "total_users": total_users.scalar() or 0,
        "total_deposits": str(total_deposits.scalar() or 0),
        "total_withdrawals": str(total_withdrawals.scalar() or 0),
        "open_positions": open_positions.scalar() or 0,
        "total_platform_pnl": str(-(total_pnl.scalar() or 0)),
    }
