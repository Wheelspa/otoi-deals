# Restores seed products (Acoustic One live, Chrono/Titan queued) after engine tests; closes TEST_ products.
import asyncio
import os

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv("/app/backend/.env")


async def main():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    await db.products.update_many({"name": {"$regex": "^TEST_"}, "status": {"$in": ["live", "paused", "queued", "draft"]}},
                                  {"$set": {"status": "stopped"}})
    seeds = ["Chrono-X Smart Watch", "Titan EDC Minimalist Set"]
    # park queued seeds as draft so the sweeper cannot activate them mid-restore
    await db.products.update_many({"name": {"$in": seeds}}, {"$set": {"status": "draft"}})
    await db.products.update_one({"name": {"$regex": "^Acoustic One"}},
                                 {"$set": {"status": "live"}, "$unset": {"closed_at": ""}})
    for name in seeds:
        await db.products.update_one({"name": name},
                                     {"$set": {"status": "queued", "drop_number": 0}, "$unset": {"closed_at": "", "activated_at": ""}})
    async for p in db.products.find({}, {"_id": 0, "name": 1, "status": 1, "drop_number": 1}):
        print(p)


asyncio.run(main())
