import os
from datetime import datetime, timezone

from bson.binary import Binary
from pymongo import ASCENDING, MongoClient

APP_NAME = "otoi"
_client = None
_collection = None


def _get_collection():
    global _client, _collection
    if _collection is None:
        _client = MongoClient(os.environ["MONGO_URL"])
        _collection = _client[os.environ["DB_NAME"]]["file_blobs"]
    return _collection


def init_storage(force: bool = False):
    col = _get_collection()
    col.create_index([("path", ASCENDING)], unique=True, name="path")
    return "mongodb"


def put_object(path: str, data: bytes, content_type: str) -> dict:
    col = _get_collection()
    col.update_one(
        {"path": path},
        {
            "$set": {
                "path": path,
                "data": Binary(data),
                "content_type": content_type or "application/octet-stream",
                "size": len(data),
                "created_at": datetime.now(timezone.utc),
            }
        },
        upsert=True,
    )
    return {"path": path, "size": len(data)}


def get_object(path: str) -> tuple[bytes, str]:
    col = _get_collection()
    doc = col.find_one({"path": path}, {"_id": 0, "data": 1, "content_type": 1})
    if not doc:
        raise FileNotFoundError(path)
    return bytes(doc["data"]), doc.get("content_type", "application/octet-stream")
