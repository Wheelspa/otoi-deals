"""Standalone seed script to populate an empty MongoDB database with initial deals and coupon.
Usage: python seed.py
(Note: server.py also runs seed() automatically on first startup when the database is empty.)
"""

import asyncio
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from server import client, db, ensure_indexes, seed  # noqa: E402


async def main():
    await ensure_indexes()
    await seed()
    products = await db.products.find({}, {"_id": 0, "name": 1, "status": 1, "total_qty": 1}).to_list(100)
    coupons = await db.coupons.find({}, {"_id": 0, "code": 1, "active": 1}).to_list(100)
    print("Seed complete.")
    print("Products:", products)
    print("Coupons:", coupons)
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
