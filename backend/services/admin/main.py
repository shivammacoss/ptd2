import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from packages.common.src.config import get_settings
from packages.common.src.database import engine

logger = logging.getLogger("uvicorn.error")
from routes import (
    auth, dashboard, users, trades, deposits, banks,
    config as routes_config, business, social, analytics, bonus, banners,
    support, employees, settings, transactions,
)

app_settings = get_settings()

_cors_origins = [
    o.strip()
    for o in app_settings.CORS_ORIGINS.split(",")
    if o.strip()
]
if not _cors_origins:
    _cors_origins = ["http://localhost:3001"]


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await engine.dispose()


app = FastAPI(
    title="ProTrader Admin API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception(request: Request, exc: Exception):
    """Return JSON (not plain text) so proxies and the admin UI can parse errors."""
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


prefix = "/api/v1/admin"

app.include_router(auth.router, prefix=prefix)
app.include_router(dashboard.router, prefix=prefix)
app.include_router(users.router, prefix=prefix)
app.include_router(trades.router, prefix=prefix)
app.include_router(deposits.router, prefix=prefix)
app.include_router(banks.router, prefix=prefix)
app.include_router(routes_config.router, prefix=prefix)
app.include_router(business.router, prefix=prefix)
app.include_router(social.router, prefix=prefix)
app.include_router(analytics.router, prefix=prefix)
app.include_router(bonus.router, prefix=prefix)
app.include_router(banners.router, prefix=prefix)
app.include_router(support.router, prefix=prefix)
app.include_router(employees.router, prefix=prefix)
app.include_router(settings.router, prefix=prefix)
app.include_router(transactions.router, prefix=prefix)


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "admin"}
