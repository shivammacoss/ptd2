"""B-Book Engine Service Entry Point."""
import asyncio
import logging
from .matching_engine import MatchingEngine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("b-book-engine")


async def main():
    engine = MatchingEngine()
    try:
        await engine.start()
    except KeyboardInterrupt:
        await engine.stop()


if __name__ == "__main__":
    asyncio.run(main())
