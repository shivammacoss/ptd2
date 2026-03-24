import os
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_admin, require_permission, write_audit_log
from models import User, BankAccount
from schemas import BankAccountIn, BankAccountOut

router = APIRouter(prefix="/banks", tags=["Banks"])

UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent.parent / "uploads" / "qr"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.get("")
async def list_bank_accounts(
    admin: User = Depends(require_permission("banks.view")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(BankAccount).order_by(BankAccount.rotation_order)
    )
    banks = result.scalars().all()
    return [
        BankAccountOut(
            id=str(b.id),
            account_name=b.account_name,
            account_number=b.account_number,
            bank_name=b.bank_name,
            ifsc_code=b.ifsc_code,
            upi_id=b.upi_id,
            qr_code_url=b.qr_code_url,
            tier=b.tier or 1,
            min_amount=float(b.min_amount or 0),
            max_amount=float(b.max_amount or 999999999),
            is_active=b.is_active,
            rotation_order=b.rotation_order or 0,
            last_used_at=b.last_used_at,
            created_at=b.created_at,
        )
        for b in banks
    ]


@router.post("")
async def create_bank_account(
    body: BankAccountIn,
    request: Request,
    admin: User = Depends(require_permission("banks.create")),
    db: AsyncSession = Depends(get_db),
):
    bank = BankAccount(
        account_name=body.account_name,
        account_number=body.account_number,
        bank_name=body.bank_name,
        ifsc_code=body.ifsc_code,
        upi_id=body.upi_id,
        qr_code_url=body.qr_code_url,
        tier=body.tier,
        min_amount=body.min_amount,
        max_amount=body.max_amount,
        is_active=body.is_active,
        rotation_order=body.rotation_order,
    )
    db.add(bank)
    await db.flush()

    await write_audit_log(
        db, admin.id, "create_bank_account", "bank_account", bank.id,
        new_values={"bank_name": body.bank_name, "account_number": body.account_number},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return {"message": "Bank account created", "id": str(bank.id)}


@router.put("/{bank_id}")
async def update_bank_account(
    bank_id: uuid.UUID,
    body: BankAccountIn,
    request: Request,
    admin: User = Depends(require_permission("banks.update")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(BankAccount).where(BankAccount.id == bank_id))
    bank = result.scalar_one_or_none()
    if not bank:
        raise HTTPException(status_code=404, detail="Bank account not found")

    old_values = {"bank_name": bank.bank_name, "account_number": bank.account_number}

    bank.account_name = body.account_name
    bank.account_number = body.account_number
    bank.bank_name = body.bank_name
    bank.ifsc_code = body.ifsc_code
    bank.upi_id = body.upi_id
    bank.qr_code_url = body.qr_code_url
    bank.tier = body.tier
    bank.min_amount = body.min_amount
    bank.max_amount = body.max_amount
    bank.is_active = body.is_active
    bank.rotation_order = body.rotation_order

    await write_audit_log(
        db, admin.id, "update_bank_account", "bank_account", bank_id,
        old_values=old_values,
        new_values={"bank_name": body.bank_name, "account_number": body.account_number},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return {"message": "Bank account updated"}


@router.post("/upload-qr")
async def upload_qr_code(
    file: UploadFile = File(...),
    admin: User = Depends(require_permission("banks.create")),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed")

    max_size = 5 * 1024 * 1024
    contents = await file.read()
    if len(contents) > max_size:
        raise HTTPException(status_code=400, detail="File too large (max 5MB)")

    ext = file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else "png"
    if ext not in ("png", "jpg", "jpeg", "webp", "gif"):
        ext = "png"

    filename = f"{uuid.uuid4().hex}.{ext}"
    filepath = UPLOAD_DIR / filename
    filepath.write_bytes(contents)

    return {"url": f"/admin/banks/qr/{filename}", "filename": filename}


@router.get("/qr/{filename}")
async def serve_qr_code(filename: str):
    filepath = UPLOAD_DIR / filename
    if not filepath.exists() or not filepath.is_file():
        raise HTTPException(status_code=404, detail="QR code not found")
    return FileResponse(filepath)


@router.delete("/{bank_id}")
async def delete_bank_account(
    bank_id: uuid.UUID,
    request: Request,
    admin: User = Depends(require_permission("banks.update")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(BankAccount).where(BankAccount.id == bank_id))
    bank = result.scalar_one_or_none()
    if not bank:
        raise HTTPException(status_code=404, detail="Bank account not found")

    bank.is_active = False

    await write_audit_log(
        db, admin.id, "delete_bank_account", "bank_account", bank_id,
        new_values={"is_active": False},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return {"message": "Bank account deactivated"}
