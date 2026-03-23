"""Social Trading API — Leaderboard, copy trading, MAM/PAMM."""
import json
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from packages.common.src.database import get_db
from packages.common.src.models import (
    MasterAccount, InvestorAllocation, CopyTrade, TradingAccount, User,
    Position, PositionStatus, TradeHistory,
)
from packages.common.src.auth import get_current_user
from packages.common.src.redis_client import redis_client, PriceChannel

router = APIRouter()


async def _calculate_live_return(account_id: UUID) -> dict:
    """Get live equity stats from Redis for a master account."""
    equity_data = await redis_client.get(f"account_equity:{account_id}")
    if equity_data:
        return json.loads(equity_data)
    return {}


@router.get("/leaderboard")
async def list_leaderboard(
    sort_by: str = Query("total_return_pct", pattern="^(total_return_pct|followers_count|sharpe_ratio)$"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    count_result = await db.execute(
        select(func.count()).select_from(MasterAccount).where(
            MasterAccount.status == "approved",
        )
    )
    total = count_result.scalar()

    query = (
        select(MasterAccount, User.first_name, User.last_name)
        .join(User, MasterAccount.user_id == User.id)
        .where(
            MasterAccount.status == "approved",
        )
        .order_by(getattr(MasterAccount, sort_by).desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(query)
    rows = result.all()

    items = []
    for master, first_name, last_name in rows:
        items.append({
            "id": str(master.id),
            "provider_name": f"{first_name or ''} {last_name or ''}".strip(),
            "total_return_pct": float(master.total_return_pct),
            "max_drawdown_pct": float(master.max_drawdown_pct),
            "sharpe_ratio": float(master.sharpe_ratio),
            "followers_count": master.followers_count,
            "performance_fee_pct": float(master.performance_fee_pct),
            "min_investment": float(master.min_investment),
            "description": master.description,
            "created_at": master.created_at.isoformat() if master.created_at else None,
        })

    return {
        "items": items,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page if total else 0,
    }


@router.get("/providers/{provider_id}")
async def get_provider_detail(
    provider_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(MasterAccount, User.first_name, User.last_name)
        .join(User, MasterAccount.user_id == User.id)
        .where(MasterAccount.id == provider_id, MasterAccount.status == "approved")
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Provider not found")

    master, first_name, last_name = row

    investor_count = await db.execute(
        select(func.count()).select_from(InvestorAllocation).where(
            InvestorAllocation.master_id == master.id,
            InvestorAllocation.status == "active",
        )
    )
    active_investors = investor_count.scalar()

    trades_result = await db.execute(
        select(func.count(), func.sum(TradeHistory.profit)).where(
            TradeHistory.account_id == master.account_id,
        )
    )
    trades_row = trades_result.one()
    total_trades = trades_row[0] or 0
    total_profit = float(trades_row[1] or 0)

    win_count_result = await db.execute(
        select(func.count()).where(
            TradeHistory.account_id == master.account_id,
            TradeHistory.profit > 0,
        )
    )
    wins = win_count_result.scalar()
    win_rate = (wins / total_trades * 100) if total_trades > 0 else 0

    monthly_result = await db.execute(
        select(
            func.date_trunc("month", TradeHistory.closed_at).label("month"),
            func.sum(TradeHistory.profit).label("profit"),
        )
        .where(TradeHistory.account_id == master.account_id)
        .group_by("month")
        .order_by("month")
    )
    monthly_breakdown = [
        {"month": str(r.month), "profit": float(r.profit)}
        for r in monthly_result.all()
    ]

    is_copying = False
    alloc_result = await db.execute(
        select(InvestorAllocation).where(
            InvestorAllocation.master_id == master.id,
            InvestorAllocation.investor_user_id == current_user["user_id"],
            InvestorAllocation.status == "active",
        )
    )
    if alloc_result.scalar_one_or_none():
        is_copying = True

    return {
        "id": str(master.id),
        "provider_name": f"{first_name or ''} {last_name or ''}".strip(),
        "total_return_pct": float(master.total_return_pct),
        "max_drawdown_pct": float(master.max_drawdown_pct),
        "sharpe_ratio": float(master.sharpe_ratio),
        "followers_count": master.followers_count,
        "active_investors": active_investors,
        "performance_fee_pct": float(master.performance_fee_pct),
        "management_fee_pct": float(master.management_fee_pct),
        "min_investment": float(master.min_investment),
        "max_investors": master.max_investors,
        "description": master.description,
        "total_trades": total_trades,
        "total_profit": total_profit,
        "win_rate": round(win_rate, 2),
        "monthly_breakdown": monthly_breakdown,
        "is_copying": is_copying,
        "created_at": master.created_at.isoformat() if master.created_at else None,
    }


@router.post("/copy", status_code=201)
async def start_copy(
    master_id: UUID = Query(...),
    account_id: UUID = Query(...),
    amount: Decimal = Query(..., gt=0),
    max_drawdown_pct: Decimal = Query(None),
    max_lot_override: Decimal = Query(None),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    master_result = await db.execute(
        select(MasterAccount).where(
            MasterAccount.id == master_id, MasterAccount.status == "approved"
        )
    )
    master = master_result.scalar_one_or_none()
    if not master:
        raise HTTPException(status_code=404, detail="Provider not found")

    if amount < master.min_investment:
        raise HTTPException(
            status_code=400,
            detail=f"Minimum investment is {master.min_investment}",
        )

    investor_count = await db.execute(
        select(func.count()).select_from(InvestorAllocation).where(
            InvestorAllocation.master_id == master.id,
            InvestorAllocation.status == "active",
        )
    )
    if investor_count.scalar() >= master.max_investors:
        raise HTTPException(status_code=400, detail="Provider has reached maximum investors")

    acct_result = await db.execute(
        select(TradingAccount).where(
            TradingAccount.id == account_id,
            TradingAccount.user_id == current_user["user_id"],
        )
    )
    account = acct_result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Trading account not found")
    if not account.is_active:
        raise HTTPException(status_code=403, detail="Account is not active")
    if account.balance < amount:
        raise HTTPException(status_code=400, detail="Insufficient balance")

    existing = await db.execute(
        select(InvestorAllocation).where(
            InvestorAllocation.master_id == master_id,
            InvestorAllocation.investor_user_id == current_user["user_id"],
            InvestorAllocation.status == "active",
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Already copying this provider")

    allocation = InvestorAllocation(
        master_id=master_id,
        investor_user_id=current_user["user_id"],
        investor_account_id=account_id,
        allocation_amount=amount,
        max_drawdown_pct=max_drawdown_pct,
        max_lot_override=max_lot_override,
        status="active",
    )
    db.add(allocation)

    master.followers_count = (master.followers_count or 0) + 1

    await db.commit()
    await db.refresh(allocation)

    return {
        "id": str(allocation.id),
        "master_id": str(master_id),
        "account_id": str(account_id),
        "amount": float(amount),
        "status": allocation.status,
        "created_at": allocation.created_at.isoformat() if allocation.created_at else None,
    }


@router.get("/my-copies")
async def my_copies(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(InvestorAllocation, MasterAccount, User.first_name, User.last_name)
        .join(MasterAccount, InvestorAllocation.master_id == MasterAccount.id)
        .join(User, MasterAccount.user_id == User.id)
        .where(
            InvestorAllocation.investor_user_id == current_user["user_id"],
            InvestorAllocation.status == "active",
        )
        .order_by(InvestorAllocation.created_at.desc())
    )
    rows = result.all()

    items = []
    for alloc, master, first_name, last_name in rows:
        items.append({
            "id": str(alloc.id),
            "master_id": str(master.id),
            "provider_name": f"{first_name or ''} {last_name or ''}".strip(),
            "allocation_amount": float(alloc.allocation_amount),
            "total_profit": float(alloc.total_profit),
            "total_return_pct": float(master.total_return_pct),
            "status": alloc.status,
            "created_at": alloc.created_at.isoformat() if alloc.created_at else None,
        })

    return {"items": items, "total": len(items)}


@router.delete("/copy/{allocation_id}")
async def stop_copy(
    allocation_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(InvestorAllocation).where(
            InvestorAllocation.id == allocation_id,
            InvestorAllocation.investor_user_id == current_user["user_id"],
        )
    )
    allocation = result.scalar_one_or_none()
    if not allocation:
        raise HTTPException(status_code=404, detail="Copy subscription not found")
    if allocation.status != "active":
        raise HTTPException(status_code=400, detail="Subscription already inactive")

    allocation.status = "stopped"

    master_result = await db.execute(
        select(MasterAccount).where(MasterAccount.id == allocation.master_id)
    )
    master = master_result.scalar_one_or_none()
    if master and master.followers_count and master.followers_count > 0:
        master.followers_count -= 1

    await db.commit()
    return {"message": "Copy trading stopped", "allocation_id": str(allocation_id)}


@router.post("/become-provider", status_code=201)
async def become_provider(
    account_id: UUID = Query(...),
    master_type: str = Query("signal_provider"),
    description: str = Query(None),
    performance_fee_pct: Decimal = Query(Decimal("20"), ge=0, le=50),
    management_fee_pct: Decimal = Query(Decimal("0"), ge=0, le=10),
    min_investment: Decimal = Query(Decimal("100"), gt=0),
    max_investors: int = Query(100, ge=1, le=1000),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        select(MasterAccount).where(MasterAccount.user_id == current_user["user_id"])
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="You already have a provider application")

    acct_result = await db.execute(
        select(TradingAccount).where(
            TradingAccount.id == account_id,
            TradingAccount.user_id == current_user["user_id"],
        )
    )
    account = acct_result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Trading account not found")
    if not account.is_active:
        raise HTTPException(status_code=403, detail="Account is not active")
    if account.is_demo:
        raise HTTPException(status_code=400, detail="Cannot use a demo account as provider")

    master = MasterAccount(
        user_id=current_user["user_id"],
        account_id=account_id,
        status="pending",
        master_type=master_type if master_type in ("signal_provider", "pamm", "mamm") else "signal_provider",
        performance_fee_pct=performance_fee_pct,
        management_fee_pct=management_fee_pct,
        min_investment=min_investment,
        max_investors=max_investors,
        description=description,
    )
    db.add(master)
    await db.commit()
    await db.refresh(master)

    return {
        "id": str(master.id),
        "status": master.status,
        "message": "Application submitted for review",
    }


@router.get("/my-provider")
async def my_provider_stats(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(MasterAccount).where(MasterAccount.user_id == current_user["user_id"])
    )
    master = result.scalar_one_or_none()
    if not master:
        raise HTTPException(status_code=404, detail="You are not a signal provider")

    investor_result = await db.execute(
        select(
            func.count().label("count"),
            func.coalesce(func.sum(InvestorAllocation.allocation_amount), 0).label("total_aum"),
            func.coalesce(func.sum(InvestorAllocation.total_profit), 0).label("total_investor_profit"),
        ).where(
            InvestorAllocation.master_id == master.id,
            InvestorAllocation.status == "active",
        )
    )
    inv_stats = investor_result.one()

    trades_result = await db.execute(
        select(func.count(), func.sum(TradeHistory.profit)).where(
            TradeHistory.account_id == master.account_id,
        )
    )
    trades_row = trades_result.one()

    return {
        "id": str(master.id),
        "status": master.status,
        "master_type": master.master_type,
        "total_return_pct": float(master.total_return_pct),
        "max_drawdown_pct": float(master.max_drawdown_pct),
        "sharpe_ratio": float(master.sharpe_ratio),
        "followers_count": master.followers_count,
        "active_investors": inv_stats.count,
        "total_aum": float(inv_stats.total_aum),
        "total_investor_profit": float(inv_stats.total_investor_profit),
        "total_trades": trades_row[0] or 0,
        "total_profit": float(trades_row[1] or 0),
        "performance_fee_pct": float(master.performance_fee_pct),
        "management_fee_pct": float(master.management_fee_pct),
        "min_investment": float(master.min_investment),
        "max_investors": master.max_investors,
        "description": master.description,
        "created_at": master.created_at.isoformat() if master.created_at else None,
    }


@router.get("/mamm-pamm")
async def list_managed_accounts(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    count_result = await db.execute(
        select(func.count()).select_from(MasterAccount).where(
            MasterAccount.status == "approved",
            MasterAccount.master_type.in_(["mamm", "pamm"]),
        )
    )
    total = count_result.scalar()

    result = await db.execute(
        select(MasterAccount, User.first_name, User.last_name)
        .join(User, MasterAccount.user_id == User.id)
        .where(
            MasterAccount.status == "approved",
            MasterAccount.master_type.in_(["mamm", "pamm"]),
        )
        .order_by(MasterAccount.total_return_pct.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    rows = result.all()

    items = []
    for master, first_name, last_name in rows:
        investor_count = await db.execute(
            select(func.count()).select_from(InvestorAllocation).where(
                InvestorAllocation.master_id == master.id,
                InvestorAllocation.status == "active",
            )
        )
        active = investor_count.scalar()

        items.append({
            "id": str(master.id),
            "manager_name": f"{first_name or ''} {last_name or ''}".strip(),
            "master_type": master.master_type,
            "total_return_pct": float(master.total_return_pct),
            "max_drawdown_pct": float(master.max_drawdown_pct),
            "sharpe_ratio": float(master.sharpe_ratio),
            "performance_fee_pct": float(master.performance_fee_pct),
            "management_fee_pct": float(master.management_fee_pct),
            "min_investment": float(master.min_investment),
            "max_investors": master.max_investors,
            "active_investors": active,
            "slots_available": master.max_investors - active,
            "description": master.description,
        })

    return {
        "items": items,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page if total else 0,
    }


@router.post("/mamm-pamm/{master_id}/invest", status_code=201)
async def invest_managed_account(
    master_id: UUID,
    account_id: UUID = Query(...),
    amount: Decimal = Query(..., gt=0),
    max_drawdown_pct: Decimal = Query(None),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    master_result = await db.execute(
        select(MasterAccount).where(
            MasterAccount.id == master_id,
            MasterAccount.status == "approved",
            MasterAccount.master_type.in_(["mamm", "pamm"]),
        )
    )
    master = master_result.scalar_one_or_none()
    if not master:
        raise HTTPException(status_code=404, detail="Managed account not found")

    if amount < master.min_investment:
        raise HTTPException(
            status_code=400,
            detail=f"Minimum investment is {master.min_investment}",
        )

    investor_count = await db.execute(
        select(func.count()).select_from(InvestorAllocation).where(
            InvestorAllocation.master_id == master.id,
            InvestorAllocation.status == "active",
        )
    )
    if investor_count.scalar() >= master.max_investors:
        raise HTTPException(status_code=400, detail="No slots available")

    acct_result = await db.execute(
        select(TradingAccount).where(
            TradingAccount.id == account_id,
            TradingAccount.user_id == current_user["user_id"],
        )
    )
    account = acct_result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Trading account not found")
    if not account.is_active:
        raise HTTPException(status_code=403, detail="Account is not active")
    if account.balance < amount:
        raise HTTPException(status_code=400, detail="Insufficient balance")

    existing = await db.execute(
        select(InvestorAllocation).where(
            InvestorAllocation.master_id == master_id,
            InvestorAllocation.investor_user_id == current_user["user_id"],
            InvestorAllocation.status == "active",
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Already invested in this managed account")

    allocation = InvestorAllocation(
        master_id=master_id,
        investor_user_id=current_user["user_id"],
        investor_account_id=account_id,
        allocation_amount=amount,
        max_drawdown_pct=max_drawdown_pct,
        status="active",
    )
    db.add(allocation)
    master.followers_count = (master.followers_count or 0) + 1

    await db.commit()
    await db.refresh(allocation)

    return {
        "id": str(allocation.id),
        "master_id": str(master_id),
        "master_type": master.master_type,
        "account_id": str(account_id),
        "amount": float(amount),
        "status": allocation.status,
        "created_at": allocation.created_at.isoformat() if allocation.created_at else None,
    }
