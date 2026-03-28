"""Market Data Service — Connects to price feeds, normalizes, distributes via Redis pub/sub and stores in TimescaleDB."""
import asyncio
import json
import logging
import signal
from datetime import datetime, timezone

from packages.common.src.config import get_settings
from packages.common.src.redis_client import redis_client, publish_price, PriceChannel
from packages.common.src.kafka_client import produce_event, KafkaTopics, close_producer

from .feed_handler import FeedSimulator, INSTRUMENTS
from .infoway_feed import InfowayFeed
from .bar_aggregator import BarAggregator
from .store import TickStore

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("market-data")

settings = get_settings()


class MarketDataService:
    def __init__(self):
        if settings.INFOWAY_API_KEY and settings.INFOWAY_API_KEY.strip():
            self.feed = InfowayFeed(settings.INFOWAY_API_KEY, INSTRUMENTS)
            logger.info("Price feed: Infoway WebSocket (depth)")
        else:
            self.feed = FeedSimulator(tick_rate_multiplier=1.0)
            logger.warning(
                "INFOWAY_API_KEY not set — using simulated forex/indices + Binance crypto"
            )
        self.aggregator = BarAggregator()
        self.store = TickStore()
        self.running = True

    async def start(self):
        logger.info("Starting Market Data Service...")

        signal.signal(signal.SIGINT, lambda *_: setattr(self, "running", False))
        signal.signal(signal.SIGTERM, lambda *_: setattr(self, "running", False))

        await self.store.init()

        tasks = [
            asyncio.create_task(self.feed.start()),
            asyncio.create_task(self._process_ticks()),
            asyncio.create_task(self.aggregator.run_aggregation_loop()),
        ]

        await asyncio.gather(*tasks)

    async def _process_ticks(self):
        logger.info("Tick processor started")
        while self.running:
            tick = await self.feed.get_tick()
            if tick is None:
                await asyncio.sleep(0.01)
                continue

            symbol = tick["symbol"]
            bid = tick["bid"]
            ask = tick["ask"]
            ts = tick.get("timestamp", datetime.now(timezone.utc).isoformat())

            await publish_price(symbol, bid, ask, ts)

            await self.store.insert_tick(symbol, bid, ask, ts)

            self.aggregator.update(symbol, bid, ask, ts)

    async def shutdown(self):
        logger.info("Shutting down Market Data Service...")
        self.running = False
        await self.feed.stop()
        await close_producer()
        await redis_client.close()


async def main():
    service = MarketDataService()
    try:
        await service.start()
    except KeyboardInterrupt:
        await service.shutdown()


if __name__ == "__main__":
    asyncio.run(main())
