import uuid
from datetime import datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from jose import jwt
from sqlalchemy import select, func, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from database import get_db
from dependencies import get_current_admin, require_permission, write_audit_log
from models import (
    User, TradingAccount, Position, Order, Transaction, Deposit, Withdrawal,
    PositionStatus, OrderStatus,
)
from schemas import (
    UserOut, UserDetailOut, TradingAccountOut, PaginatedResponse,
    FundRequest, CreditRequest, TransactionOut,
)

router = APIRouter(prefix="/users", tags=["Users"])
settings = get_settings()


def _user_to_out(u: User) -> dict:
    return {
        "id": str(u.id),
        "email": u.email,
        "phone": u.phone,
        "first_name": u.first_name,
        "last_name": u.last_name,
        "date_of_birth": u.date_of_birth,
        "country": u.country,
        "address": u.address,
        "role": u.role,
        "status": u.status,
        "kyc_status": u.kyc_status,
        "is_demo": u.is_demo,
        "language": u.language,
        "theme": u.theme,
        "trading_blocked_until": u.trading_blocked_until,
        "created_at": u.created_at,
        "updated_at": u.updated_at,
    }


def _account_to_out(a: TradingAccount) -> dict:
    return {
        "id": str(a.id),
        "user_id": str(a.user_id),
        "account_group_id": str(a.account_group_id) if a.account_group_id else None,
        "account_number": a.account_number,
        "balance": float(a.balance or 0),
        "credit": float(a.credit or 0),
        "equity": float(a.equity or 0),
        "margin_used": float(a.margin_used or 0),
        "free_margin": float(a.free_margin or 0),
        "margin_level": float(a.margin_level or 0),
        "leverage": a.leverage,
        "currency": a.currency,
        "is_demo": a.is_demo,
        "is_active": a.is_active,
        "created_at": a.created_at,
    }


@router.get("")
async def list_users(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: str = Query(None),
    status_filter: str = Query(None, alias="status"),
    kyc_filter: str = Query(None, alias="kyc_status"),
    group_id: str = Query(None),
    admin: User = Depends(require_permission("users.view")),
    db: AsyncSession = Depends(get_db),
):
    query = select(User).where(User.role.notin_(["admin", "super_admin"]))

    if search:
        term = f"%{search}%"
        query = query.where(
            or_(
                User.email.ilike(term),
                User.first_name.ilike(term),
                User.last_name.ilike(term),
                User.phone.ilike(term),
            )
        )
    if status_filter:
        query = query.where(User.status == status_filter)
    if kyc_filter:
        query = query.where(User.kyc_status == kyc_filter)

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    query = query.order_by(User.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    users = result.scalars().all()

    user_ids = [u.id for u in users]
    balance_map: dict = {}
    if user_ids:
        acc_q = await db.execute(
            select(
                TradingAccount.user_id,
                func.coalesce(func.sum(TradingAccount.balance), 0).label("total_balance"),
                func.coalesce(func.sum(TradingAccount.equity), 0).label("total_equity"),
            )
            .where(TradingAccount.user_id.in_(user_ids))
            .group_by(TradingAccount.user_id)
        )
        for row in acc_q.all():
            balance_map[row[0]] = {"balance": float(row[1]), "equity": float(row[2])}

    user_list = []
    for u in users:
        name = " ".join(filter(None, [u.first_name, u.last_name])) or u.email.split("@")[0]
        bals = balance_map.get(u.id, {"balance": 0.0, "equity": 0.0})
        user_list.append({
            "id": str(u.id),
            "name": name,
            "email": u.email,
            "balance": bals["balance"],
            "equity": bals["equity"],
            "group": u.role or "user",
            "kyc_status": u.kyc_status or "pending",
            "status": u.status or "active",
        })

    pages = max(1, (total + per_page - 1) // per_page)
    return {
        "users": user_list,
        "total": total,
        "page": page,
        "pages": pages,
    }


@router.get("/{user_id}")
async def get_user_detail(
    user_id: uuid.UUID,
    admin: User = Depends(require_permission("users.view")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    accounts_q = await db.execute(
        select(TradingAccount).where(TradingAccount.user_id == user_id)
    )
    accounts = accounts_q.scalars().all()

    dep_q = await db.execute(
        select(func.coalesce(func.sum(Deposit.amount), 0)).where(
            Deposit.user_id == user_id,
            Deposit.status.in_(["approved", "auto_approved"]),
        )
    )
    total_deposit = float(dep_q.scalar() or 0)

    wd_q = await db.execute(
        select(func.coalesce(func.sum(Withdrawal.amount), 0)).where(
            Withdrawal.user_id == user_id,
            Withdrawal.status.in_(["approved", "completed"]),
        )
    )
    total_withdrawal = float(wd_q.scalar() or 0)

    account_ids = [a.id for a in accounts]
    total_trades = 0
    open_positions = 0
    if account_ids:
        trades_q = await db.execute(
            select(func.count(Order.id)).where(Order.account_id.in_(account_ids))
        )
        total_trades = trades_q.scalar() or 0

        pos_q = await db.execute(
            select(func.count(Position.id)).where(
                Position.account_id.in_(account_ids),
                Position.status == PositionStatus.OPEN.value,
            )
        )
        open_positions = pos_q.scalar() or 0

    return UserDetailOut(
        user=UserOut(**_user_to_out(user)),
        accounts=[TradingAccountOut(**_account_to_out(a)) for a in accounts],
        total_deposit=total_deposit,
        total_withdrawal=total_withdrawal,
        total_trades=total_trades,
        open_positions=open_positions,
    )


@router.post("/{user_id}/add-fund")
async def add_fund(
    user_id: uuid.UUID,
    body: FundRequest,
    request: Request,
    admin: User = Depends(require_permission("users.add_fund")),
    db: AsyncSession = Depends(get_db),
):
    account_result = await db.execute(
        select(TradingAccount).where(
            TradingAccount.id == uuid.UUID(body.account_id),
            TradingAccount.user_id == user_id,
        )
    )
    account = account_result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Trading account not found")

    old_balance = float(account.balance or 0)
    account.balance = Decimal(str(old_balance)) + Decimal(str(body.amount))
    account.equity = account.balance + (account.credit or Decimal("0"))
    account.free_margin = account.equity - (account.margin_used or Decimal("0"))

    txn = Transaction(
        user_id=user_id,
        account_id=account.id,
        type="adjustment",
        amount=Decimal(str(body.amount)),
        balance_after=account.balance,
        description=body.description or f"Admin fund addition",
        created_by=admin.id,
    )
    db.add(txn)

    await write_audit_log(
        db, admin.id, "add_fund", "trading_account", account.id,
        old_values={"balance": old_balance},
        new_values={"balance": float(account.balance), "amount_added": body.amount},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return {"message": "Fund added successfully", "new_balance": float(account.balance)}


@router.post("/{user_id}/deduct-fund")
async def deduct_fund(
    user_id: uuid.UUID,
    body: FundRequest,
    request: Request,
    admin: User = Depends(require_permission("users.deduct_fund")),
    db: AsyncSession = Depends(get_db),
):
    account_result = await db.execute(
        select(TradingAccount).where(
            TradingAccount.id == uuid.UUID(body.account_id),
            TradingAccount.user_id == user_id,
        )
    )
    account = account_result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Trading account not found")

    old_balance = float(account.balance or 0)
    if old_balance < body.amount:
        raise HTTPException(status_code=400, detail="Insufficient balance")

    account.balance = Decimal(str(old_balance)) - Decimal(str(body.amount))
    account.equity = account.balance + (account.credit or Decimal("0"))
    account.free_margin = account.equity - (account.margin_used or Decimal("0"))

    txn = Transaction(
        user_id=user_id,
        account_id=account.id,
        type="adjustment",
        amount=-Decimal(str(body.amount)),
        balance_after=account.balance,
        description=body.description or "Admin fund deduction",
        created_by=admin.id,
    )
    db.add(txn)

    await write_audit_log(
        db, admin.id, "deduct_fund", "trading_account", account.id,
        old_values={"balance": old_balance},
        new_values={"balance": float(account.balance), "amount_deducted": body.amount},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return {"message": "Fund deducted successfully", "new_balance": float(account.balance)}


@router.post("/{user_id}/give-credit")
async def give_credit(
    user_id: uuid.UUID,
    body: CreditRequest,
    request: Request,
    admin: User = Depends(require_permission("users.add_fund")),
    db: AsyncSession = Depends(get_db),
):
    account_result = await db.execute(
        select(TradingAccount).where(
            TradingAccount.id == uuid.UUID(body.account_id),
            TradingAccount.user_id == user_id,
        )
    )
    account = account_result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Trading account not found")

    old_credit = float(account.credit or 0)
    account.credit = Decimal(str(old_credit)) + Decimal(str(body.amount))
    account.equity = (account.balance or Decimal("0")) + account.credit

    txn = Transaction(
        user_id=user_id,
        account_id=account.id,
        type="credit",
        amount=Decimal(str(body.amount)),
        balance_after=account.balance,
        description=body.description or "Admin credit addition",
        created_by=admin.id,
    )
    db.add(txn)

    await write_audit_log(
        db, admin.id, "give_credit", "trading_account", account.id,
        old_values={"credit": old_credit},
        new_values={"credit": float(account.credit), "amount": body.amount},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return {"message": "Credit added successfully", "new_credit": float(account.credit)}


@router.post("/{user_id}/take-credit")
async def take_credit(
    user_id: uuid.UUID,
    body: CreditRequest,
    request: Request,
    admin: User = Depends(require_permission("users.add_fund")),
    db: AsyncSession = Depends(get_db),
):
    account_result = await db.execute(
        select(TradingAccount).where(
            TradingAccount.id == uuid.UUID(body.account_id),
            TradingAccount.user_id == user_id,
        )
    )
    account = account_result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Trading account not found")

    old_credit = float(account.credit or 0)
    if old_credit < body.amount:
        raise HTTPException(status_code=400, detail="Insufficient credit")

    account.credit = Decimal(str(old_credit)) - Decimal(str(body.amount))
    account.equity = (account.balance or Decimal("0")) + account.credit

    txn = Transaction(
        user_id=user_id,
        account_id=account.id,
        type="credit",
        amount=-Decimal(str(body.amount)),
        balance_after=account.balance,
        description=body.description or "Admin credit removal",
        created_by=admin.id,
    )
    db.add(txn)

    await write_audit_log(
        db, admin.id, "take_credit", "trading_account", account.id,
        old_values={"credit": old_credit},
        new_values={"credit": float(account.credit), "amount_removed": body.amount},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return {"message": "Credit removed successfully", "new_credit": float(account.credit)}


@router.post("/{user_id}/ban")
async def ban_user(
    user_id: uuid.UUID,
    request: Request,
    admin: User = Depends(require_permission("users.ban")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    old_status = user.status
    user.status = "banned"

    await write_audit_log(
        db, admin.id, "ban_user", "user", user_id,
        old_values={"status": old_status},
        new_values={"status": "banned"},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return {"message": "User banned successfully"}


@router.post("/{user_id}/unban")
async def unban_user(
    user_id: uuid.UUID,
    request: Request,
    admin: User = Depends(require_permission("users.ban")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    old_status = user.status
    user.status = "active"

    await write_audit_log(
        db, admin.id, "unban_user", "user", user_id,
        old_values={"status": old_status},
        new_values={"status": "active"},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return {"message": "User unbanned successfully"}


@router.post("/{user_id}/block-trading")
async def block_trading(
    user_id: uuid.UUID,
    request: Request,
    admin: User = Depends(require_permission("users.block_trading")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    far_future = datetime.utcnow() + timedelta(days=36500)
    user.trading_blocked_until = far_future

    await write_audit_log(
        db, admin.id, "block_trading", "user", user_id,
        new_values={"trading_blocked_until": far_future.isoformat()},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return {"message": "Trading blocked successfully"}


@router.post("/{user_id}/kill-switch")
async def kill_switch(
    user_id: uuid.UUID,
    request: Request,
    admin: User = Depends(require_permission("users.kill_switch")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    accounts_q = await db.execute(
        select(TradingAccount).where(TradingAccount.user_id == user_id)
    )
    accounts = accounts_q.scalars().all()
    account_ids = [a.id for a in accounts]

    closed_count = 0
    if account_ids:
        positions_q = await db.execute(
            select(Position).where(
                Position.account_id.in_(account_ids),
                Position.status == PositionStatus.OPEN.value,
            )
        )
        positions = positions_q.scalars().all()
        for pos in positions:
            pos.status = PositionStatus.CLOSED.value
            pos.close_price = pos.open_price
            pos.closed_at = datetime.utcnow()
            pos.profit = Decimal("0")
            pos.is_admin_modified = True
            closed_count += 1

    far_future = datetime.utcnow() + timedelta(days=36500)
    user.trading_blocked_until = far_future

    await write_audit_log(
        db, admin.id, "kill_switch", "user", user_id,
        new_values={"positions_closed": closed_count, "trading_blocked": True},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return {"message": f"Kill switch activated. {closed_count} positions closed. Trading disabled."}


@router.post("/{user_id}/login-as")
async def login_as_user(
    user_id: uuid.UUID,
    request: Request,
    admin: User = Depends(require_permission("users.view")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    expire = datetime.utcnow() + timedelta(hours=2)
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "role": user.role,
        "type": "user",
        "impersonated_by": str(admin.id),
        "exp": expire,
        "iat": datetime.utcnow(),
    }
    token = jwt.encode(payload, settings.USER_JWT_SECRET, algorithm=settings.USER_JWT_ALGORITHM)

    await write_audit_log(
        db, admin.id, "login_as_user", "user", user_id,
        new_values={"impersonated_user_email": user.email},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()

    return {"access_token": token, "token_type": "bearer", "user_email": user.email}
