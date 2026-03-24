import uuid
from decimal import Decimal
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from typing import Optional
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import require_permission, write_audit_log
from models import (
    User, MasterAccount, TradingAccount, InvestorAllocation,
    CopyTrade, TradeHistory, Transaction, Position,
)
from schemas import PaginatedResponse

router = APIRouter(prefix="/social", tags=["Social Trading"])


class ApproveRequest(BaseModel):
    admin_commission_pct: Optional[float] = None
    max_investors: Optional[int] = None
    master_type: Optional[str] = None


class RejectRequest(BaseModel):
    reason: Optional[str] = None


@router.get("/master-requests")
async def list_master_requests(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    admin: User = Depends(require_permission("social.view")),
    db: AsyncSession = Depends(get_db),
):
    query = select(MasterAccount).where(MasterAccount.status == "pending")
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    query = query.order_by(MasterAccount.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    masters = result.scalars().all()

    items = []
    for m in masters:
        user_q = await db.execute(select(User).where(User.id == m.user_id))
        user = user_q.scalar_one_or_none()
        acc_q = await db.execute(select(TradingAccount).where(TradingAccount.id == m.account_id))
        acc = acc_q.scalar_one_or_none()
        items.append({
            "id": str(m.id),
            "user_id": str(m.user_id),
            "user_email": user.email if user else None,
            "user_name": f"{user.first_name or ''} {user.last_name or ''}".strip() if user else None,
            "account_id": str(m.account_id),
            "account_number": acc.account_number if acc else None,
            "account_balance": float(acc.balance or 0) if acc else 0,
            "status": m.status,
            "master_type": m.master_type,
            "performance_fee_pct": float(m.performance_fee_pct or 0),
            "management_fee_pct": float(m.management_fee_pct or 0),
            "admin_commission_pct": float(m.admin_commission_pct or 0),
            "max_investors": m.max_investors or 100,
            "min_investment": float(m.min_investment or 0),
            "description": m.description,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        })

    return {"items": items, "total": total, "page": page, "per_page": per_page}


@router.post("/master-requests/{master_id}/approve")
async def approve_master_request(
    master_id: uuid.UUID,
    body: ApproveRequest,
    request: Request,
    admin: User = Depends(require_permission("social.manage")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(MasterAccount).where(MasterAccount.id == master_id))
    master = result.scalar_one_or_none()
    if not master:
        raise HTTPException(status_code=404, detail="Master request not found")
    if master.status != "pending":
        raise HTTPException(status_code=400, detail="Request is not pending")

    master.status = "approved"
    if body.admin_commission_pct is not None:
        master.admin_commission_pct = Decimal(str(body.admin_commission_pct))
    if body.max_investors is not None:
        master.max_investors = body.max_investors
    if body.master_type:
        master.master_type = body.master_type

    user_q = await db.execute(select(User).where(User.id == master.user_id))
    user = user_q.scalar_one_or_none()
    if user:
        user.role = "master_trader"

    await write_audit_log(
        db, admin.id, "approve_master_request", "master_account", master_id,
        new_values={
            "status": "approved",
            "admin_commission_pct": float(master.admin_commission_pct or 0),
            "master_type": master.master_type,
        },
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return {"message": "Master request approved"}


@router.post("/master-requests/{master_id}/reject")
async def reject_master_request(
    master_id: uuid.UUID,
    body: RejectRequest,
    request: Request,
    admin: User = Depends(require_permission("social.manage")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(MasterAccount).where(MasterAccount.id == master_id))
    master = result.scalar_one_or_none()
    if not master:
        raise HTTPException(status_code=404, detail="Master request not found")
    if master.status != "pending":
        raise HTTPException(status_code=400, detail="Request is not pending")

    master.status = "rejected"
    master.description = (master.description or "") + f"\n[Rejected: {body.reason or 'No reason'}]"

    await write_audit_log(
        db, admin.id, "reject_master_request", "master_account", master_id,
        new_values={"status": "rejected", "reason": body.reason},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return {"message": "Master request rejected"}


@router.get("/masters")
async def list_masters(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    admin: User = Depends(require_permission("social.view")),
    db: AsyncSession = Depends(get_db),
):
    query = select(MasterAccount).where(MasterAccount.status.in_(["approved", "active"]))
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    query = query.order_by(MasterAccount.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    masters = result.scalars().all()

    items = []
    for m in masters:
        user_q = await db.execute(select(User).where(User.id == m.user_id))
        user = user_q.scalar_one_or_none()
        acc_q = await db.execute(select(TradingAccount).where(TradingAccount.id == m.account_id))
        acc = acc_q.scalar_one_or_none()

        investor_q = await db.execute(
            select(
                func.count().label("count"),
                func.coalesce(func.sum(InvestorAllocation.allocation_amount), 0).label("aum"),
                func.coalesce(func.sum(InvestorAllocation.total_profit), 0).label("inv_profit"),
            ).where(InvestorAllocation.master_id == m.id, InvestorAllocation.status == "active")
        )
        inv = investor_q.one()

        admin_rev_q = await db.execute(
            select(func.coalesce(func.sum(Transaction.amount), 0)).where(
                Transaction.type == "commission",
                Transaction.description.ilike(f"%Admin commission%"),
                Transaction.reference_id.in_(
                    select(Position.id).where(Position.account_id == m.account_id)
                ) if m.account_id else Transaction.amount == 0,
            )
        )
        admin_revenue = abs(float(admin_rev_q.scalar() or 0))

        perf_fee_q = await db.execute(
            select(func.coalesce(func.sum(Transaction.amount), 0)).where(
                Transaction.user_id == m.user_id,
                Transaction.type == "ib_commission",
            )
        )
        master_earnings = float(perf_fee_q.scalar() or 0)

        copy_trades_q = await db.execute(
            select(func.count(CopyTrade.id)).where(
                CopyTrade.investor_allocation_id.in_(
                    select(InvestorAllocation.id).where(InvestorAllocation.master_id == m.id)
                )
            )
        )
        total_copy_trades = copy_trades_q.scalar() or 0

        master_trades_q = await db.execute(
            select(func.count(TradeHistory.id)).where(TradeHistory.account_id == m.account_id)
        )
        total_master_trades = master_trades_q.scalar() or 0

        master_pnl_q = await db.execute(
            select(func.coalesce(func.sum(TradeHistory.profit), 0)).where(TradeHistory.account_id == m.account_id)
        )
        master_pnl = float(master_pnl_q.scalar() or 0)

        live_positions_q = await db.execute(
            select(func.count(Position.id)).where(
                Position.account_id == m.account_id,
                Position.status == "open",
            )
        )
        live_positions = live_positions_q.scalar() or 0

        items.append({
            "id": str(m.id),
            "user_id": str(m.user_id),
            "user_email": user.email if user else None,
            "user_name": f"{user.first_name or ''} {user.last_name or ''}".strip() if user else None,
            "account_number": acc.account_number if acc else None,
            "account_balance": float(acc.balance or 0) if acc else 0,
            "status": m.status,
            "master_type": m.master_type,
            "performance_fee_pct": float(m.performance_fee_pct or 0),
            "admin_commission_pct": float(m.admin_commission_pct or 0),
            "max_investors": m.max_investors or 100,
            "followers_count": m.followers_count or 0,
            "active_investors": inv.count,
            "aum": float(inv.aum),
            "total_investor_profit": float(inv.inv_profit),
            "master_earnings": master_earnings,
            "admin_revenue": admin_revenue,
            "total_return_pct": float(m.total_return_pct or 0),
            "max_drawdown_pct": float(m.max_drawdown_pct or 0),
            "min_investment": float(m.min_investment or 0),
            "total_copy_trades": total_copy_trades,
            "total_master_trades": total_master_trades,
            "master_pnl": master_pnl,
            "live_positions": live_positions,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        })

    return {"items": items, "total": total, "page": page, "per_page": per_page}


@router.put("/masters/{master_id}")
async def update_master_settings(
    master_id: uuid.UUID,
    body: ApproveRequest,
    request: Request,
    admin: User = Depends(require_permission("social.manage")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(MasterAccount).where(MasterAccount.id == master_id))
    master = result.scalar_one_or_none()
    if not master:
        raise HTTPException(status_code=404, detail="Master not found")

    if body.admin_commission_pct is not None:
        master.admin_commission_pct = Decimal(str(body.admin_commission_pct))
    if body.max_investors is not None:
        master.max_investors = body.max_investors

    await write_audit_log(
        db, admin.id, "update_master_settings", "master_account", master_id,
        new_values={"admin_commission_pct": float(master.admin_commission_pct or 0), "max_investors": master.max_investors},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return {"message": "Master settings updated"}
