from datetime import datetime, timedelta, timezone

import jwt

from fastapi import APIRouter, Depends, HTTPException, status
from passlib.context import CryptContext
from passlib.exc import UnknownHashError
import logging
from sqlalchemy import select
from sqlalchemy.exc import DBAPIError, OperationalError
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("uvicorn.error")

from packages.common.src.config import get_settings
from packages.common.src.database import get_db
from dependencies import get_current_admin
from packages.common.src.models import User
from packages.common.src.admin_schemas import AdminLoginRequest, AdminLoginResponse, AdminRefreshRequest

router = APIRouter(prefix="/auth", tags=["Auth"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
settings = get_settings()


def create_admin_token(admin_id: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    expire = now + timedelta(hours=settings.ADMIN_JWT_EXPIRY_HOURS)
    payload = {
        "admin_id": admin_id,
        "role": str(role),
        "type": "admin",
        "exp": expire,
        "iat": now,
    }
    try:
        return jwt.encode(payload, settings.ADMIN_JWT_SECRET, algorithm=settings.ADMIN_JWT_ALGORITHM)
    except jwt.PyJWTError as e:
        logger.error("Admin JWT encode failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server configuration error (JWT)",
        ) from e


@router.post("/login", response_model=AdminLoginResponse)
async def admin_login(body: AdminLoginRequest, db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(
            select(User).where(
                User.email == body.email,
                User.role.in_(["admin", "super_admin"]),
            )
        )
    except (OperationalError, DBAPIError) as e:
        logger.exception("Database error on admin login")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable",
        ) from e

    admin = result.scalar_one_or_none()

    if admin is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    try:
        password_ok = pwd_context.verify(body.password, admin.password_hash)
    except (UnknownHashError, ValueError, TypeError):
        password_ok = False
    except Exception:
        logger.exception("Password verify error for admin email=%s", body.email)
        password_ok = False
    if not password_ok:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if admin.status != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is not active")

    token = create_admin_token(str(admin.id), admin.role)

    return AdminLoginResponse(
        access_token=token,
        admin_id=str(admin.id),
        role=admin.role,
        first_name=admin.first_name,
        last_name=admin.last_name,
    )


@router.post("/refresh", response_model=AdminLoginResponse)
async def admin_refresh(body: AdminRefreshRequest, db: AsyncSession = Depends(get_db)):
    try:
        payload = jwt.decode(
            body.access_token,
            settings.ADMIN_JWT_SECRET,
            algorithms=[settings.ADMIN_JWT_ALGORITHM],
            options={"verify_exp": False},
        )
        if payload.get("type") != "admin":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

        admin_id = payload.get("admin_id")
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    result = await db.execute(
        select(User).where(
            User.id == admin_id,
            User.role.in_(["admin", "super_admin"]),
            User.status == "active",
        )
    )
    admin = result.scalar_one_or_none()
    if admin is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Admin not found")

    token = create_admin_token(str(admin.id), admin.role)
    return AdminLoginResponse(
        access_token=token,
        admin_id=str(admin.id),
        role=admin.role,
        first_name=admin.first_name,
        last_name=admin.last_name,
    )


@router.get("/me")
async def get_admin_me(
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    from dependencies import EMPLOYEE_ROLE_PERMISSIONS
    from packages.common.src.models import Employee

    employee_role = None
    permissions = set()

    if admin.role == "super_admin":
        employee_role = "super_admin"
        permissions = {"*"}
    else:
        emp_q = await db.execute(
            select(Employee).where(Employee.user_id == admin.id, Employee.is_active == True)
        )
        emp = emp_q.scalar_one_or_none()
        if emp:
            employee_role = emp.role
            permissions = EMPLOYEE_ROLE_PERMISSIONS.get(emp.role, set())

    return {
        "id": str(admin.id),
        "email": admin.email,
        "first_name": admin.first_name,
        "last_name": admin.last_name,
        "role": admin.role,
        "employee_role": employee_role,
        "permissions": list(permissions),
    }
