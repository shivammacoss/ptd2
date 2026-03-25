"""Wallet API — Deposits, Withdrawals, Transactions."""
import asyncio
import logging
from decimal import Decimal
from uuid import UUID
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from packages.common.src.database import get_db
from packages.common.src.models import (
    Deposit, Withdrawal, Transaction, TradingAccount, BankAccount
)
from packages.common.src.schemas import (
    DepositRequest, WithdrawalRequest, DepositResponse, WithdrawalResponse
)
from packages.common.src.auth import get_current_user
from packages.common.src.notify import create_notification

logger = logging.getLogger("wallet")

router = APIRouter()


METHOD_MAP = {
    "bank": "bank_transfer",
    "bank_transfer": "bank_transfer",
    "upi": "upi",
    "qr": "qr",
    "crypto": "crypto_btc",
    "crypto_btc": "crypto_btc",
    "crypto_eth": "crypto_eth",
    "crypto_usdt": "crypto_usdt",
    "metamask": "metamask",
    "card": "bank_transfer",
}


async def _get_user_account_ids(user_id, db: AsyncSession) -> list[UUID]:
    result = await db.execute(
        select(TradingAccount.id).where(TradingAccount.user_id == user_id)
    )
    return [row[0] for row in result.all()]


async def _get_live_account_ids(user_id, db: AsyncSession) -> list[UUID]:
    result = await db.execute(
        select(TradingAccount.id).where(
            TradingAccount.user_id == user_id,
            TradingAccount.is_demo == False,
        )
    )
    return [row[0] for row in result.all()]


async def _get_bank_for_tier(amount: Decimal, db: AsyncSession) -> BankAccount | None:
    result = await db.execute(
        select(BankAccount).where(
            BankAccount.is_active == True,
            BankAccount.min_amount <= amount,
            BankAccount.max_amount >= amount,
        ).order_by(BankAccount.last_used_at.asc().nullsfirst(), BankAccount.rotation_order)
    )
    bank = result.scalars().first()
    if bank:
        bank.last_used_at = datetime.utcnow()
    return bank


@router.post("/deposit", status_code=201)
async def create_deposit(
    req: DepositRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from packages.common.src.settings_store import get_bool_setting
    if not await get_bool_setting("allow_deposits", True):
        raise HTTPException(status_code=403, detail="Deposits are currently disabled")

    acct = await db.execute(
        select(TradingAccount).where(
            TradingAccount.id == req.account_id,
            TradingAccount.user_id == current_user["user_id"],
        )
    )
    account = acct.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    bank = await _get_bank_for_tier(req.amount, db)

    db_method = METHOD_MAP.get(req.method, "bank_transfer")

    deposit = Deposit(
        user_id=current_user["user_id"],
        account_id=req.account_id,
        amount=req.amount,
        method=db_method,
        transaction_id=req.transaction_id,
        screenshot_url=req.screenshot_url,
        crypto_tx_hash=getattr(req, "crypto_tx_hash", None),
        crypto_address=getattr(req, "crypto_address", None),
        bank_account_id=bank.id if bank else None,
        status="pending",
    )
    db.add(deposit)
    await db.commit()
    await db.refresh(deposit)

    await create_notification(
        db, current_user["user_id"],
        title="Deposit Submitted",
        message=f"${float(req.amount):,.2f} deposit via {req.method} is pending approval",
        notif_type="deposit", action_url="/wallet",
    )
    await db.commit()

    return {"id": str(deposit.id), "status": "pending", "amount": float(deposit.amount)}


@router.post("/withdraw", status_code=201)
async def create_withdrawal(
    req: WithdrawalRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from packages.common.src.settings_store import get_bool_setting
    if not await get_bool_setting("allow_withdrawals", True):
        raise HTTPException(status_code=403, detail="Withdrawals are currently disabled")

    acct = await db.execute(
        select(TradingAccount).where(
            TradingAccount.id == req.account_id,
            TradingAccount.user_id == current_user["user_id"],
        )
    )
    account = acct.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    if account.balance < req.amount:
        raise HTTPException(status_code=400, detail="Insufficient balance")

    withdrawal = Withdrawal(
        user_id=current_user["user_id"],
        account_id=req.account_id,
        amount=req.amount,
        method=METHOD_MAP.get(req.method, "bank_transfer"),
        bank_details=getattr(req, "bank_details", None),
        crypto_address=getattr(req, "crypto_address", None),
        status="pending",
    )
    db.add(withdrawal)
    await db.commit()
    await db.refresh(withdrawal)

    await create_notification(
        db, current_user["user_id"],
        title="Withdrawal Submitted",
        message=f"${float(req.amount):,.2f} withdrawal via {req.method} is pending approval",
        notif_type="withdrawal", action_url="/wallet",
    )
    await db.commit()

    return {"id": str(withdrawal.id), "status": "pending", "amount": float(withdrawal.amount)}


@router.get("/deposits")
async def list_deposits(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    live_ids = await _get_live_account_ids(current_user["user_id"], db)
    query = (
        select(Deposit)
        .where(
            Deposit.user_id == current_user["user_id"],
            Deposit.account_id.in_(live_ids) if live_ids else Deposit.user_id == current_user["user_id"],
        )
        .order_by(Deposit.created_at.desc())
    )
    result = await db.execute(query)
    deposits = result.scalars().all()
    return {
        "items": [
            {
                "id": str(d.id),
                "created_at": d.created_at.isoformat() if d.created_at else None,
                "type": "deposit",
                "method": d.method or "bank",
                "amount": float(d.amount or 0),
                "status": d.status or "pending",
                "currency": "USD",
            }
            for d in deposits
        ]
    }


@router.get("/withdrawals")
async def list_withdrawals(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    live_ids = await _get_live_account_ids(current_user["user_id"], db)
    query = (
        select(Withdrawal)
        .where(
            Withdrawal.user_id == current_user["user_id"],
            Withdrawal.account_id.in_(live_ids) if live_ids else Withdrawal.user_id == current_user["user_id"],
        )
        .order_by(Withdrawal.created_at.desc())
    )
    result = await db.execute(query)
    withdrawals = result.scalars().all()
    return {
        "items": [
            {
                "id": str(w.id),
                "created_at": w.created_at.isoformat() if w.created_at else None,
                "type": "withdrawal",
                "method": w.method or "bank",
                "amount": float(w.amount or 0),
                "status": w.status or "pending",
                "currency": "USD",
            }
            for w in withdrawals
        ]
    }


@router.get("/transactions")
async def list_transactions(
    account_id: UUID | None = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = current_user["user_id"]

    if account_id:
        acct = await db.execute(
            select(TradingAccount).where(
                TradingAccount.id == account_id,
                TradingAccount.user_id == user_id,
            )
        )
        if not acct.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Account not found")
        query = select(Transaction).where(Transaction.account_id == account_id)
    else:
        live_ids = await _get_live_account_ids(user_id, db)
        if not live_ids:
            return {"items": []}
        query = select(Transaction).where(Transaction.account_id.in_(live_ids))

    query = query.order_by(Transaction.created_at.desc()).limit(100)
    result = await db.execute(query)
    txns = result.scalars().all()

    return {
        "items": [
            {
                "id": str(t.id),
                "created_at": t.created_at.isoformat() if t.created_at else None,
                "type": t.type or "adjustment",
                "method": "admin" if t.type in ("adjustment", "credit") else (t.type or ""),
                "amount": float(t.amount or 0),
                "status": "completed",
                "currency": "USD",
            }
            for t in txns
        ]
    }


@router.get("/summary")
async def wallet_summary(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return accurate wallet totals for the user's live account."""
    user_id = current_user["user_id"]

    acct_q = await db.execute(
        select(TradingAccount).where(
            TradingAccount.user_id == user_id,
            TradingAccount.is_demo == False,
        ).limit(1)
    )
    account = acct_q.scalar_one_or_none()
    if not account:
        return {"balance": 0, "equity": 0, "total_deposited": 0, "total_withdrawn": 0}

    dep_q = await db.execute(
        select(func.coalesce(func.sum(Deposit.amount), 0)).where(
            Deposit.user_id == user_id,
            Deposit.account_id == account.id,
            Deposit.status.in_(["approved", "auto_approved"]),
        )
    )
    total_dep = float(dep_q.scalar() or 0)

    adj_in_q = await db.execute(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.account_id == account.id,
            Transaction.type.in_(["adjustment", "credit"]),
            Transaction.amount > 0,
        )
    )
    total_adj_in = float(adj_in_q.scalar() or 0)

    wd_q = await db.execute(
        select(func.coalesce(func.sum(Withdrawal.amount), 0)).where(
            Withdrawal.user_id == user_id,
            Withdrawal.account_id == account.id,
            Withdrawal.status.in_(["approved", "completed"]),
        )
    )
    total_wd = float(wd_q.scalar() or 0)

    adj_out_q = await db.execute(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.account_id == account.id,
            Transaction.type.in_(["adjustment", "credit"]),
            Transaction.amount < 0,
        )
    )
    total_adj_out = abs(float(adj_out_q.scalar() or 0))

    return {
        "balance": float(account.balance or 0),
        "credit": float(account.credit or 0),
        "equity": float(account.equity or 0),
        "total_deposited": total_dep + total_adj_in,
        "total_withdrawn": total_wd + total_adj_out,
    }


@router.post("/deposit/bank-details")
async def get_deposit_bank_details(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the first active bank account for deposits (with QR)."""
    result = await db.execute(
        select(BankAccount)
        .where(BankAccount.is_active == True)
        .order_by(BankAccount.rotation_order)
        .limit(1)
    )
    bank = result.scalars().first()
    if not bank:
        return {}

    resp: dict = {}
    if bank.bank_name:
        resp["bank_name"] = bank.bank_name
    if bank.account_name:
        resp["account_holder"] = bank.account_name
    if bank.account_number:
        resp["account_number"] = bank.account_number
    if bank.ifsc_code:
        resp["ifsc_code"] = bank.ifsc_code
    if bank.upi_id:
        resp["upi_id"] = bank.upi_id
    if bank.qr_code_url:
        resp["qr_code_url"] = bank.qr_code_url
    return resp


@router.get("/bank-info")
async def get_bank_info(
    amount: Decimal = Query(..., gt=0),
    db: AsyncSession = Depends(get_db),
):
    bank = await _get_bank_for_tier(amount, db)
    if not bank:
        raise HTTPException(status_code=404, detail="No bank account available for this amount")

    await db.commit()

    return {
        "bank_name": bank.bank_name,
        "account_name": bank.account_name,
        "account_number": bank.account_number,
        "ifsc_code": bank.ifsc_code,
        "upi_id": bank.upi_id,
        "qr_code_url": bank.qr_code_url,
    }
