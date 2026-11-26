# Restores seed state after test_otoi_early_access.py: deletes given TEST_EA products (by exact name) + their orders,
# removes drop_alerts for the TEST phones, sets Acoustic One live, Chrono/Titan queued (drop_number 0, Titan start_at null).
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
names = sys.argv[1:]
TEST_PHONES = ["9000000201", "9000000202", "9000000203", "9000000204", "9000000205"]

ids = [p["id"] for p in db.products.find({"name": {"$in": names}}) if p["name"].startswith("TEST_")]
print("orders deleted", db.orders.delete_many({"product_id": {"$in": ids}}).deleted_count)
print("products deleted", db.products.delete_many({"id": {"$in": ids}}).deleted_count)
print("alerts deleted", db.drop_alerts.delete_many({"phone": {"$in": TEST_PHONES}}).deleted_count)
seeds = ["Chrono-X Smart Watch", "Titan EDC Minimalist Set"]
db.products.update_many({"name": {"$in": seeds}}, {"$set": {"status": "draft"}})
db.products.update_one({"name": {"$regex": "^Acoustic One"}},
                       {"$set": {"status": "live", "early_access_until": None}, "$unset": {"closed_at": ""}})
for name in seeds:
    db.products.update_one({"name": name}, {"$set": {"status": "queued", "drop_number": 0, "early_access_until": None},
                                            "$unset": {"closed_at": "", "activated_at": ""}})
db.products.update_one({"name": "Titan EDC Minimalist Set"}, {"$set": {"start_at": None}})
