import uuid
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from packages.common.src.database import get_db
from dependencies import get_current_admin, require_permission, write_audit_log
from packages.common.src.models import User, TradingAccount, Deposit, Withdrawal, Transaction, BonusOffer, UserBonus
from packages.common.src.admin_schemas import DepositOut, WithdrawalOut, PaginatedResponse, RejectRequest

router = APIRouter(prefix="/finance", tags=["Finance"])


def _deposit_to_out(d: Deposit, user: User = None) -> DepositOut:
    return DepositOut(
        id=str(d.id),
        user_id=str(d.user_id),
        account_id=str(d.account_id) if d.account_id else None,
        amount=float(d.amount or 0),
        currency=d.currency or "INR",
        method=d.method,
        status=d.status,
        transaction_id=d.transaction_id,
        screenshot_url=d.screenshot_url,
        rejection_reason=d.rejection_reason,
        created_at=d.created_at,
        user_email=user.email if user else None,
        user_name=f"{user.first_name or ''} {user.last_name or ''}".strip() if user else None,
    )


def _withdrawal_to_out(w: Withdrawal, user: User = None) -> WithdrawalOut:
    return WithdrawalOut(
        id=str(w.id),
        user_id=str(w.user_id),
        account_id=str(w.account_id) if w.account_id else None,
        amount=float(w.amount or 0),
        currency=w.currency or "INR",
        method=w.method,
        status=w.status,
        bank_details=w.bank_details,
        crypto_address=w.crypto_address,
        rejection_reason=w.rejection_reason,
        created_at=w.created_at,
        user_email=user.email if user else None,
        user_name=f"{user.first_name or ''} {user.last_name or ''}".strip() if user else None,
    )


@router.get("/deposits/pending")
async def list_pending_deposits(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    admin: User = Depends(require_permission("deposits.view")),
    db: AsyncSession = Depends(get_db),
):
    query = select(Deposit).where(Deposit.status == "pending")
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    query = query.order_by(Deposit.created_at.asc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    deposits = result.scalars().all()

    items = []
    for d in deposits:
        user_q = await db.execute(select(User).where(User.id == d.user_id))
        user = user_q.scalar_one_or_none()
        items.append(_deposit_to_out(d, user))

    return PaginatedResponse(items=items, total=total, page=page, per_page=per_page)


@router.get("/withdrawals/pending")
async def list_pending_withdrawals(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    admin: User = Depends(require_permission("withdrawals.view")),
    db: AsyncSession = Depends(get_db),
):
    query = select(Withdrawal).where(Withdrawal.status == "pending")
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    query = query.order_by(Withdrawal.created_at.asc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    withdrawals = result.scalars().all()

    items = []
    for w in withdrawals:
        user_q = await db.execute(select(User).where(User.id == w.user_id))
        user = user_q.scalar_one_or_none()
        items.append(_withdrawal_to_out(w, user))

    return PaginatedResponse(items=items, total=total, page=page, per_page=per_page)


@router.get("/deposits")
async def list_all_deposits(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status: str = Query(None),
    admin: User = Depends(require_permission("deposits.view")),
    db: AsyncSession = Depends(get_db),
):
    query = select(Deposit)
    if status and status != "all":
        query = query.where(Deposit.status == status)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    query = query.order_by(Deposit.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    deposits = result.scalars().all()

    items = []
    for d in deposits:
        user_q = await db.execute(select(User).where(User.id == d.user_id))
        user = user_q.scalar_one_or_none()
        items.append(_deposit_to_out(d, user))

    return PaginatedResponse(items=items, total=total, page=page, per_page=per_page)


@router.get("/withdrawals")
async def list_all_withdrawals(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status: str = Query(None),
    admin: User = Depends(require_permission("withdrawals.view")),
    db: AsyncSession = Depends(get_db),
):
    query = select(Withdrawal)
    if status and status != "all":
        query = query.where(Withdrawal.status == status)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    query = query.order_by(Withdrawal.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    withdrawals = result.scalars().all()

    items = []
    for w in withdrawals:
        user_q = await db.execute(select(User).where(User.id == w.user_id))
        user = user_q.scalar_one_or_none()
        items.append(_withdrawal_to_out(w, user))

    return PaginatedResponse(items=items, total=total, page=page, per_page=per_page)


@router.post("/deposits/{deposit_id}/approve")
async def approve_deposit(
    deposit_id: uuid.UUID,
    request: Request,
    admin: User = Depends(require_permission("deposits.approve")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Deposit).where(Deposit.id == deposit_id))
    deposit = result.scalar_one_or_none()
    if not deposit:
        raise HTTPException(status_code=404, detail="Deposit not found")
    if deposit.status != "pending":
        raise HTTPException(status_code=400, detail="Deposit is not pending")

    deposit.status = "approved"
    deposit.approved_by = admin.id
    deposit.approved_at = datetime.utcnow()

    if deposit.account_id:
        acc_q = await db.execute(
            select(TradingAccount).where(TradingAccount.id == deposit.account_id)
        )
        account = acc_q.scalar_one_or_none()
        if account:
            account.balance = (account.balance or Decimal("0")) + deposit.amount
            account.equity = account.balance + (account.credit or Decimal("0"))
            account.free_margin = account.equity - (account.margin_used or Decimal("0"))

            txn = Transaction(
                user_id=deposit.user_id,
                account_id=account.id,
                type="deposit",
                amount=deposit.amount,
                balance_after=account.balance,
                reference_id=deposit.id,
                description=f"Deposit approved - {deposit.method or 'manual'}",
                created_by=admin.id,
            )
            db.add(txn)

    bonus_msg = ""
    if deposit.account_id and account:
        now = datetime.utcnow()
        offers_q = await db.execute(
            select(BonusOffer).where(
                BonusOffer.is_active == True,
                BonusOffer.bonus_type.in_(["deposit", "welcome"]),
                BonusOffer.min_deposit <= deposit.amount,
            )
        )
        for offer in offers_q.scalars().all():
            if offer.starts_at and offer.starts_at > now:
                continue
            if offer.expires_at and offer.expires_at < now:
                continue

            if offer.percentage and offer.percentage > 0:
                bonus_amount = deposit.amount * offer.percentage / Decimal("100")
            elif offer.fixed_amount and offer.fixed_amount > 0:
                bonus_amount = offer.fixed_amount
            else:
                continue

            if offer.max_bonus and bonus_amount > offer.max_bonus:
                bonus_amount = offer.max_bonus

            user_bonus = UserBonus(
                user_id=deposit.user_id,
                account_id=deposit.account_id,
                offer_id=offer.id,
                amount=bonus_amount,
                lots_traded=Decimal("0"),
                lots_required=offer.lots_required or Decimal("0"),
                status="active",
                expires_at=offer.expires_at,
            )
            db.add(user_bonus)

            account.credit = (account.credit or Decimal("0")) + bonus_amount
            account.equity = account.balance + account.credit
            account.free_margin = account.equity - (account.margin_used or Decimal("0"))

            db.add(Transaction(
                user_id=deposit.user_id,
                account_id=account.id,
                type="bonus",
                amount=bonus_amount,
                balance_after=account.balance,
                description=f"Bonus: {offer.name} ({offer.percentage or 0}%)",
                created_by=admin.id,
            ))

            bonus_msg = f" + ${float(bonus_amount):.2f} bonus ({offer.name})"

    await write_audit_log(
        db, admin.id, "approve_deposit", "deposit", deposit_id,
        new_values={"amount": float(deposit.amount), "status": "approved"},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return {"message": f"Deposit approved successfully{bonus_msg}"}


@router.post("/deposits/{deposit_id}/reject")
async def reject_deposit(
    deposit_id: uuid.UUID,
    body: RejectRequest,
    request: Request,
    admin: User = Depends(require_permission("deposits.reject")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Deposit).where(Deposit.id == deposit_id))
    deposit = result.scalar_one_or_none()
    if not deposit:
        raise HTTPException(status_code=404, detail="Deposit not found")
    if deposit.status != "pending":
        raise HTTPException(status_code=400, detail="Deposit is not pending")

    deposit.status = "rejected"
    deposit.rejection_reason = body.reason
    deposit.approved_by = admin.id
    deposit.approved_at = datetime.utcnow()

    await write_audit_log(
        db, admin.id, "reject_deposit", "deposit", deposit_id,
        new_values={"status": "rejected", "reason": body.reason},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return {"message": "Deposit rejected"}


@router.post("/withdrawals/{withdrawal_id}/approve")
async def approve_withdrawal(
    withdrawal_id: uuid.UUID,
    request: Request,
    admin: User = Depends(require_permission("withdrawals.approve")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Withdrawal).where(Withdrawal.id == withdrawal_id))
    withdrawal = result.scalar_one_or_none()
    if not withdrawal:
        raise HTTPException(status_code=404, detail="Withdrawal not found")
    if withdrawal.status != "pending":
        raise HTTPException(status_code=400, detail="Withdrawal is not pending")

    if withdrawal.account_id:
        acc_q = await db.execute(
            select(TradingAccount).where(TradingAccount.id == withdrawal.account_id)
        )
        account = acc_q.scalar_one_or_none()
        if account:
            if (account.balance or Decimal("0")) < withdrawal.amount:
                raise HTTPException(status_code=400, detail="Insufficient account balance")
            account.balance = (account.balance or Decimal("0")) - withdrawal.amount
            account.equity = account.balance + (account.credit or Decimal("0"))
            account.free_margin = account.equity - (account.margin_used or Decimal("0"))

            txn = Transaction(
                user_id=withdrawal.user_id,
                account_id=account.id,
                type="withdrawal",
                amount=-withdrawal.amount,
                balance_after=account.balance,
                reference_id=withdrawal.id,
                description=f"Withdrawal approved - {withdrawal.method or 'manual'}",
                created_by=admin.id,
            )
            db.add(txn)

    withdrawal.status = "approved"
    withdrawal.approved_by = admin.id
    withdrawal.approved_at = datetime.utcnow()

    await write_audit_log(
        db, admin.id, "approve_withdrawal", "withdrawal", withdrawal_id,
        new_values={"amount": float(withdrawal.amount), "status": "approved"},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return {"message": "Withdrawal approved successfully"}


@router.post("/withdrawals/{withdrawal_id}/reject")
async def reject_withdrawal(
    withdrawal_id: uuid.UUID,
    body: RejectRequest,
    request: Request,
    admin: User = Depends(require_permission("withdrawals.reject")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Withdrawal).where(Withdrawal.id == withdrawal_id))
    withdrawal = result.scalar_one_or_none()
    if not withdrawal:
        raise HTTPException(status_code=404, detail="Withdrawal not found")
    if withdrawal.status != "pending":
        raise HTTPException(status_code=400, detail="Withdrawal is not pending")

    withdrawal.status = "rejected"
    withdrawal.rejection_reason = body.reason
    withdrawal.approved_by = admin.id
    withdrawal.approved_at = datetime.utcnow()

    await write_audit_log(
        db, admin.id, "reject_withdrawal", "withdrawal", withdrawal_id,
        new_values={"status": "rejected", "reason": body.reason},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return {"message": "Withdrawal rejected"}
