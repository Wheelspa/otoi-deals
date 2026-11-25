# Prints a snapshot of products/drop_alerts/test-user phones (for before/after restore comparison)
import asyncio, os, json
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
load_dotenv("/app/backend/.env")


async def main():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    async for p in db.products.find({}, {"_id": 0, "id": 1, "name": 1, "status": 1, "drop_number": 1, "sold": 1, "reserved": 1,
                                         "start_at": 1, "early_access_until": 1, "closed_at": 1, "activated_at": 1, "queue_position": 1}):
        print("P", p)
    async for a in db.drop_alerts.find({}, {"_id": 0}):
        print("A", a)
    async for u in db.users.find({"email": {"$regex": "clerk_test"}}, {"_id": 0, "email": 1, "phone": 1, "name": 1}):
        print("U", u)
    print("orders", await db.orders.count_documents({}))

asyncio.run(main())
