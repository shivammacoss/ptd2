from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..database import get_db
from ..dependencies import get_current_admin
from ..models import User
from ..schemas import AdminLoginRequest, AdminLoginResponse, AdminRefreshRequest

router = APIRouter(prefix="/auth", tags=["Auth"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
settings = get_settings()


def create_admin_token(admin_id: str, role: str) -> str:
    expire = datetime.utcnow() + timedelta(hours=settings.ADMIN_JWT_EXPIRY_HOURS)
    payload = {
        "admin_id": admin_id,
        "role": role,
        "type": "admin",
        "exp": expire,
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, settings.ADMIN_JWT_SECRET, algorithm=settings.ADMIN_JWT_ALGORITHM)


@router.post("/login", response_model=AdminLoginResponse)
async def admin_login(body: AdminLoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User).where(
            User.email == body.email,
            User.role.in_(["admin", "super_admin"]),
        )
    )
    admin = result.scalar_one_or_none()

    if admin is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not pwd_context.verify(body.password, admin.password_hash):
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
    except JWTError:
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
    from ..dependencies import EMPLOYEE_ROLE_PERMISSIONS
    from ..models import Employee

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
