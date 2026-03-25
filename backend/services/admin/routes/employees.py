import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from passlib.context import CryptContext
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from packages.common.src.database import get_db
from dependencies import get_current_admin, write_audit_log
from packages.common.src.models import User, Employee, AuditLog
from packages.common.src.admin_schemas import EmployeeIn, EmployeeUpdate, EmployeeOut, AuditLogOut, PaginatedResponse

router = APIRouter(prefix="/employees", tags=["Employees"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

VALID_EMPLOYEE_ROLES = [
    "super_admin", "trade_manager", "support", "finance", "risk_manager", "marketing"
]


@router.get("")
async def list_employees(
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Employee).order_by(Employee.created_at.desc()))
    employees = result.scalars().all()

    items = []
    for emp in employees:
        user_q = await db.execute(select(User).where(User.id == emp.user_id))
        user = user_q.scalar_one_or_none()
        full_name = f"{user.first_name or ''} {user.last_name or ''}".strip() if user else ""
        items.append({
            "id": str(emp.id),
            "user_id": str(emp.user_id),
            "role": emp.role,
            "is_active": emp.is_active,
            "created_at": emp.created_at.isoformat() if emp.created_at else None,
            "email": user.email if user else None,
            "full_name": full_name,
            "first_name": user.first_name if user else None,
            "last_name": user.last_name if user else None,
            "phone": user.phone if user else None,
        })
    return {"employees": items}


@router.post("")
async def create_employee(
    body: EmployeeIn,
    request: Request,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    if admin.role != "super_admin":
        raise HTTPException(status_code=403, detail="Only super admins can create employees")

    if body.role not in VALID_EMPLOYEE_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {VALID_EMPLOYEE_ROLES}")

    existing_q = await db.execute(select(User).where(User.email == body.email))
    if existing_q.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already in use")

    import secrets
    raw_password = body.password or secrets.token_urlsafe(12)
    password_hash = pwd_context.hash(raw_password)

    first_name = body.first_name
    last_name = body.last_name
    if not first_name and body.full_name:
        parts = body.full_name.strip().split(" ", 1)
        first_name = parts[0]
        last_name = parts[1] if len(parts) > 1 else ""

    user = User(
        email=body.email,
        password_hash=password_hash,
        first_name=first_name or "",
        last_name=last_name or "",
        phone=body.phone,
        role="admin",
        status="active",
        kyc_status="approved",
    )
    db.add(user)
    await db.flush()

    employee = Employee(
        user_id=user.id,
        role=body.role,
        is_active=True,
    )
    db.add(employee)
    await db.flush()

    await write_audit_log(
        db, admin.id, "create_employee", "employee", employee.id,
        new_values={"email": body.email, "role": body.role},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return {"message": "Employee created", "id": str(employee.id), "user_id": str(user.id), "password": raw_password}


@router.put("/{employee_id}")
async def update_employee(
    employee_id: uuid.UUID,
    body: EmployeeUpdate,
    request: Request,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    if admin.role != "super_admin":
        raise HTTPException(status_code=403, detail="Only super admins can update employees")

    result = await db.execute(select(Employee).where(Employee.id == employee_id))
    employee = result.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    old_values = {"role": employee.role, "is_active": employee.is_active}

    if body.role is not None:
        if body.role not in VALID_EMPLOYEE_ROLES:
            raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {VALID_EMPLOYEE_ROLES}")
        employee.role = body.role

    if body.is_active is not None:
        employee.is_active = body.is_active

    user_q = await db.execute(select(User).where(User.id == employee.user_id))
    user = user_q.scalar_one_or_none()
    if user:
        if body.first_name is not None:
            user.first_name = body.first_name
        if body.last_name is not None:
            user.last_name = body.last_name

    await write_audit_log(
        db, admin.id, "update_employee", "employee", employee_id,
        old_values=old_values,
        new_values={"role": employee.role, "is_active": employee.is_active},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return {"message": "Employee updated"}


@router.delete("/{employee_id}")
async def delete_employee(
    employee_id: uuid.UUID,
    request: Request,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    if admin.role != "super_admin":
        raise HTTPException(status_code=403, detail="Only super admins can delete employees")

    result = await db.execute(select(Employee).where(Employee.id == employee_id))
    employee = result.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    employee.is_active = False

    user_q = await db.execute(select(User).where(User.id == employee.user_id))
    user = user_q.scalar_one_or_none()
    if user:
        user.status = "suspended"

    await write_audit_log(
        db, admin.id, "delete_employee", "employee", employee_id,
        new_values={"is_active": False, "user_status": "suspended"},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return {"message": "Employee deactivated"}


@router.get("/{employee_id}/activity")
async def get_employee_activity(
    employee_id: uuid.UUID,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Employee).where(Employee.id == employee_id))
    employee = result.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    query = select(AuditLog).where(AuditLog.admin_id == employee.user_id)

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    query = query.order_by(AuditLog.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    logs = result.scalars().all()

    items = [
        AuditLogOut(
            id=str(log.id),
            admin_id=str(log.admin_id),
            action=log.action,
            entity_type=log.entity_type,
            entity_id=str(log.entity_id) if log.entity_id else None,
            old_values=log.old_values,
            new_values=log.new_values,
            ip_address=str(log.ip_address) if log.ip_address else None,
            created_at=log.created_at,
        )
        for log in logs
    ]

    return PaginatedResponse(items=items, total=total, page=page, per_page=per_page)


@router.post("/{employee_id}/login-as")
async def login_as_employee(
    employee_id: uuid.UUID,
    request: Request,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    if admin.role != "super_admin":
        raise HTTPException(status_code=403, detail="Only super admins can login as employees")

    result = await db.execute(select(Employee).where(Employee.id == employee_id))
    employee = result.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    user_q = await db.execute(select(User).where(User.id == employee.user_id))
    user = user_q.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Employee user not found")

    import jwt
    from packages.common.src.config import get_settings
    settings = get_settings()

    expire = datetime.utcnow() + __import__('datetime').timedelta(hours=8)
    payload = {
        "admin_id": str(user.id),
        "role": user.role,
        "type": "admin",
        "employee_role": employee.role,
        "impersonated_by": str(admin.id),
        "exp": expire,
        "iat": datetime.utcnow(),
    }
    token = jwt.encode(payload, settings.ADMIN_JWT_SECRET, algorithm=settings.ADMIN_JWT_ALGORITHM)

    await write_audit_log(
        db, admin.id, "login_as_employee", "employee", employee_id,
        new_values={"employee_email": user.email, "employee_role": employee.role},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()

    return {
        "access_token": token,
        "token_type": "bearer",
        "employee_email": user.email,
        "employee_role": employee.role,
    }
