from pydantic_settings import BaseSettings
from functools import lru_cache


class AdminSettings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://protrader:protrader_dev@localhost:5432/protrader"
    REDIS_URL: str = "redis://localhost:6379/1"
    ADMIN_JWT_SECRET: str = "admin-secret-change-in-production"
    ADMIN_JWT_ALGORITHM: str = "HS256"
    ADMIN_JWT_EXPIRY_HOURS: int = 8
    USER_JWT_SECRET: str = "dev-secret-change-in-production"
    USER_JWT_ALGORITHM: str = "HS256"
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:3001"
    ENVIRONMENT: str = "development"

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> AdminSettings:
    return AdminSettings()
