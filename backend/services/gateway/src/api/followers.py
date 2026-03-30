"""Followers API — Get detailed follower information for masters."""
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from packages.common.src.database import get_db
from packages.common.src.models import (
    MasterAccount, InvestorAllocation, CopyTrade, User, TradingAccount
)
from packages.common.src.auth import get_current_user

router = APIRouter()


@router.get("/my-followers")
async def get_my_followers(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get detailed list of all followers for the current user's master account."""
    # Check if user is a master
    master_result = await db.execute(
        select(MasterAccount).where(
            MasterAccount.user_id == current_user["user_id"],
            MasterAccount.status.in_(["approved", "active"]),
        )
    )
    master = master_result.scalar_one_or_none()
    if not master:
        raise HTTPException(status_code=404, detail="You are not a signal provider")

    # Get all active investor allocations
    allocations_result = await db.execute(
        select(InvestorAllocation, User, TradingAccount)
        .join(User, InvestorAllocation.user_id == User.id)
        .join(TradingAccount, InvestorAllocation.investor_account_id == TradingAccount.id)
        .where(
            InvestorAllocation.master_id == master.id,
            InvestorAllocation.status == "active",
        )
        .order_by(InvestorAllocation.created_at.desc())
    )
    allocations = allocations_result.all()

    followers = []
    for allocation, user, account in allocations:
        # Count copied trades for this follower
        copy_trades_result = await db.execute(
            select(func.count()).where(
                CopyTrade.investor_allocation_id == allocation.id
            )
        )
        total_copied_trades = copy_trades_result.scalar() or 0

        # Calculate profit/loss percentage
        profit_pct = 0
        if allocation.allocation_amount and allocation.allocation_amount > 0:
            profit_pct = (float(allocation.total_profit or 0) / float(allocation.allocation_amount)) * 100

        followers.append({
            "id": str(allocation.id),
            "user_id": str(user.id),
            "user_name": f"{user.first_name or ''} {user.last_name or ''}".strip() or user.email,
            "user_email": user.email,
            "account_number": account.account_number,
            "allocation_amount": float(allocation.allocation_amount or 0),
            "total_profit": float(allocation.total_profit or 0),
            "profit_pct": round(profit_pct, 2),
            "total_copied_trades": total_copied_trades,
            "status": allocation.status,
            "joined_at": allocation.created_at.isoformat() if allocation.created_at else None,
        })

    return {
        "master_id": str(master.id),
        "total_followers": len(followers),
        "total_aum": sum(f["allocation_amount"] for f in followers),
        "followers": followers,
    }
