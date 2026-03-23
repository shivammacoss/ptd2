from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    ENVIRONMENT: str = "development"
    DATABASE_URL: str = "postgresql+asyncpg://protrader:protrader_dev@localhost:5432/protrader"
    TIMESCALE_URL: str = "postgresql+asyncpg://protrader:protrader_dev@localhost:5433/marketdata"
    REDIS_URL: str = "redis://localhost:6379/0"
    KAFKA_BOOTSTRAP_SERVERS: str = "localhost:9092"

    JWT_SECRET: str = "dev-secret-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRY_MINUTES: int = 1440

    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:3001"

    MARGIN_CALL_LEVEL: float = 80.0
    STOP_OUT_LEVEL: float = 50.0
    MAX_OPEN_TRADES: int = 200
    DEFAULT_LEVERAGE: int = 100

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
