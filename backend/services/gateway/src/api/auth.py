"""Authentication API — Register, Login, 2FA, Password Change."""
import secrets
from datetime import datetime, timedelta
from uuid import uuid4

import pyotp
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from packages.common.src.database import get_db
from packages.common.src.models import User, UserSession, TradingAccount, AccountGroup, IPLog, IBProfile, Referral
from packages.common.src.schemas import RegisterRequest, LoginRequest, TokenResponse, UserResponse
from packages.common.src.auth import (
    hash_password, verify_password, create_access_token, get_current_user, hash_token
)

router = APIRouter()


def generate_account_number() -> str:
    return f"PT{secrets.randbelow(90000000) + 10000000}"


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(req: RegisterRequest, request: Request, db: AsyncSession = Depends(get_db)):
    from packages.common.src.settings_store import get_bool_setting, get_int_setting
    if not await get_bool_setting("allow_new_registrations", True):
        raise HTTPException(status_code=403, detail="New registrations are currently disabled")

    existing = await db.execute(select(User).where(User.email == req.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=req.email,
        password_hash=hash_password(req.password),
        first_name=req.first_name,
        last_name=req.last_name,
        phone=req.phone,
        country=req.country,
        role="user",
        status="active",
        kyc_status="pending",
    )
    db.add(user)
    await db.flush()

    default_group = await db.execute(
        select(AccountGroup).where(AccountGroup.name == "Standard", AccountGroup.is_demo == False)
    )
    group = default_group.scalar_one_or_none()

    default_leverage = await get_int_setting("default_leverage", 100)

    live_account = TradingAccount(
        user_id=user.id,
        account_group_id=group.id if group else None,
        account_number=generate_account_number(),
        leverage=default_leverage,
        currency="USD",
        is_demo=False,
    )
    db.add(live_account)

    demo_group = await db.execute(
        select(AccountGroup).where(AccountGroup.name == "Demo")
    )
    dg = demo_group.scalar_one_or_none()

    demo_account = TradingAccount(
        user_id=user.id,
        account_group_id=dg.id if dg else None,
        account_number=generate_account_number(),
        balance=0,
        equity=0,
        free_margin=0,
        leverage=100,
        currency="USD",
        is_demo=True,
    )
    db.add(demo_account)

    if req.referral_code:
        ib_q = await db.execute(
            select(IBProfile).where(IBProfile.referral_code == req.referral_code, IBProfile.is_active == True)
        )
        ib_profile = ib_q.scalar_one_or_none()
        if ib_profile:
            referral = Referral(
                referrer_id=ib_profile.user_id,
                referred_id=user.id,
                ib_profile_id=ib_profile.id,
            )
            db.add(referral)

    token, expires = create_access_token(str(user.id), user.role)

    session = UserSession(
        user_id=user.id,
        token_hash=hash_token(token),
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        expires_at=expires,
    )
    db.add(session)

    await db.commit()

    return TokenResponse(
        access_token=token,
        user_id=str(user.id),
        role=user.role,
        expires_at=expires,
    )


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if user.status == "banned":
        raise HTTPException(status_code=403, detail="Account has been banned")

    if user.status == "blocked":
        raise HTTPException(status_code=403, detail="Account has been blocked")

    if user.two_factor_enabled:
        if not req.totp_code:
            raise HTTPException(status_code=400, detail="2FA code required")
        totp = pyotp.TOTP(user.two_factor_secret)
        if not totp.verify(req.totp_code):
            raise HTTPException(status_code=401, detail="Invalid 2FA code")

    token, expires = create_access_token(str(user.id), user.role)

    session = UserSession(
        user_id=user.id,
        token_hash=hash_token(token),
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        expires_at=expires,
    )
    db.add(session)
    await db.commit()

    return TokenResponse(
        access_token=token,
        user_id=str(user.id),
        role=user.role,
        expires_at=expires,
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == current_user["user_id"]))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.post("/2fa/setup")
async def setup_2fa(current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == current_user["user_id"]))
    user = result.scalar_one_or_none()

    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret)
    provisioning_uri = totp.provisioning_uri(name=user.email, issuer_name="ProTrader")

    user.two_factor_secret = secret
    await db.commit()

    return {"secret": secret, "qr_uri": provisioning_uri}


@router.post("/2fa/verify")
async def verify_2fa(
    code: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == current_user["user_id"]))
    user = result.scalar_one_or_none()

    if not user.two_factor_secret:
        raise HTTPException(status_code=400, detail="2FA not set up")

    totp = pyotp.TOTP(user.two_factor_secret)
    if not totp.verify(code):
        raise HTTPException(status_code=401, detail="Invalid code")

    user.two_factor_enabled = True
    await db.commit()

    return {"message": "2FA enabled successfully"}


@router.post("/password/change")
async def change_password(
    old_password: str,
    new_password: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == current_user["user_id"]))
    user = result.scalar_one_or_none()

    if not verify_password(old_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    user.password_hash = hash_password(new_password)
    await db.commit()

    return {"message": "Password changed successfully"}


@router.post("/logout")
async def logout(current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(
        select(UserSession)
        .where(UserSession.user_id == current_user["user_id"], UserSession.is_active == True)
    )
    result = await db.execute(
        select(UserSession).where(
            UserSession.user_id == current_user["user_id"],
            UserSession.is_active == True
        )
    )
    sessions = result.scalars().all()
    for s in sessions:
        s.is_active = False
    await db.commit()

    return {"message": "Logged out"}
