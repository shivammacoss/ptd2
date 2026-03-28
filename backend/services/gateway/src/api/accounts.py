"""Trading Accounts API."""
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from packages.common.src.database import get_db
from packages.common.src.models import TradingAccount, User, Position, PositionStatus
from packages.common.src.schemas import TradingAccountResponse, AccountSummary
from packages.common.src.auth import get_current_user
from packages.common.src.redis_client import redis_client, PriceChannel

import json
from decimal import Decimal

router = APIRouter()


@router.get("")
async def list_accounts(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TradingAccount).where(TradingAccount.user_id == current_user["user_id"])
    )
    accounts = result.scalars().all()

    items = []
    for a in accounts:
        # Dynamically compute equity with unrealized PnL from live prices
        unrealized_pnl = Decimal("0")
        pos_result = await db.execute(
            select(Position).where(
                Position.account_id == a.id,
                Position.status == PositionStatus.OPEN,
            )
        )
        for pos in pos_result.scalars().all():
            try:
                tick_data = await redis_client.get(PriceChannel.tick_key(pos.instrument.symbol))
                if tick_data:
                    tick = json.loads(tick_data)
                    sv = pos.side.value if hasattr(pos.side, 'value') else str(pos.side)
                    cp = Decimal(str(tick["bid"])) if sv == "buy" else Decimal(str(tick["ask"]))
                    cs = pos.instrument.contract_size if pos.instrument else Decimal("100000")
                    if sv == "buy":
                        unrealized_pnl += (cp - pos.open_price) * pos.lots * cs
                    else:
                        unrealized_pnl += (pos.open_price - cp) * pos.lots * cs
            except Exception:
                pass

        balance = a.balance or Decimal("0")
        credit = a.credit or Decimal("0")
        margin_used = a.margin_used or Decimal("0")
        equity = balance + credit + unrealized_pnl
        free_margin = equity - margin_used
        margin_level = float((equity / margin_used) * 100) if margin_used > 0 else 0

        items.append({
            "id": str(a.id),
            "account_number": a.account_number,
            "balance": float(balance),
            "credit": float(credit),
            "equity": float(equity),
            "margin_used": float(margin_used),
            "free_margin": float(free_margin),
            "margin_level": margin_level,
            "leverage": a.leverage,
            "currency": a.currency,
            "is_demo": a.is_demo,
            "is_active": a.is_active,
        })

    return {"items": items}


@router.get("/{account_id}", response_model=TradingAccountResponse)
async def get_account(
    account_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TradingAccount).where(
            TradingAccount.id == account_id,
            TradingAccount.user_id == current_user["user_id"],
        )
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


@router.get("/{account_id}/summary", response_model=AccountSummary)
async def get_account_summary(
    account_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TradingAccount).where(
            TradingAccount.id == account_id,
            TradingAccount.user_id == current_user["user_id"],
        )
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    positions_result = await db.execute(
        select(Position).where(
            Position.account_id == account_id,
            Position.status == PositionStatus.OPEN,
        )
    )
    open_positions = positions_result.scalars().all()

    unrealized_pnl = Decimal("0")
    for pos in open_positions:
        tick_data = await redis_client.get(PriceChannel.tick_key(pos.instrument.symbol))
        if tick_data:
            tick = json.loads(tick_data)
            current_price = Decimal(str(tick["bid"])) if pos.side.value == "buy" else Decimal(str(tick["ask"]))
            if pos.side.value == "buy":
                pnl = (current_price - pos.open_price) * pos.lots * pos.instrument.contract_size
            else:
                pnl = (pos.open_price - current_price) * pos.lots * pos.instrument.contract_size
            unrealized_pnl += pnl

    equity = account.balance + account.credit + unrealized_pnl

    return AccountSummary(
        balance=account.balance,
        credit=account.credit,
        equity=equity,
        margin_used=account.margin_used,
        free_margin=equity - account.margin_used,
        margin_level=((equity / account.margin_used) * 100) if account.margin_used > 0 else Decimal("0"),
        unrealized_pnl=unrealized_pnl,
        open_positions_count=len(open_positions),
    )
