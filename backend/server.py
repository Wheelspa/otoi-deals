import asyncio
import csv
import hashlib
import hmac
import io
import json
import logging
import os
import random
import string
import uuid
from contextlib import suppress
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Literal, Optional

import requests
from dotenv import load_dotenv
from fastapi import (APIRouter, Depends, FastAPI, File, HTTPException, Query, Request, Response, UploadFile,
                     WebSocket, WebSocketDisconnect)
from fastapi.responses import HTMLResponse, StreamingResponse
import html
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from pymongo import ASCENDING, DESCENDING, IndexModel, ReturnDocument
from pymongo.errors import DuplicateKeyError
import re
from starlette.concurrency import run_in_threadpool
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

try:
    from backend.clerk_auth import clerk_router, require_user
    from backend.notify import send_sms, send_whatsapp
    from backend import storage
    from backend.invoice import DEFAULT_SETTINGS, build_invoice, financial_year, invoice_pdf, tax_totals
except ModuleNotFoundError:
    from clerk_auth import clerk_router, require_user
    from notify import send_sms, send_whatsapp
    import storage
    from invoice import DEFAULT_SETTINGS, build_invoice, financial_year, invoice_pdf, tax_totals

client = AsyncIOMotorClient(os.environ['MONGO_URL'], tz_aware=True)
db = client[os.environ['DB_NAME']]
logger = logging.getLogger("dealwills")
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

RESERVATION_MINUTES = 10
REFERRAL_REWARD = 100
SWEEP_SECONDS = 5

INDEXES: dict[str, list[IndexModel]] = {
    "products": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("status", ASCENDING)], name="one_live", unique=True,
                   partialFilterExpression={"status": "live"}),
        IndexModel([("status", ASCENDING), ("queue_position", ASCENDING)], name="queue"),
        IndexModel([("closed_at", DESCENDING)], name="closed_at"),
    ],
    "orders": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("order_number", ASCENDING)], name="order_number", unique=True),
        IndexModel([("user_id", ASCENDING), ("created_at", DESCENDING)], name="user_created"),
        IndexModel([("status", ASCENDING), ("expires_at", ASCENDING)], name="status_expires"),
        IndexModel([("product_id", ASCENDING), ("status", ASCENDING)], name="product_status"),
        IndexModel([("paid_at", DESCENDING)], name="paid_at"),
        IndexModel([("invoice_token", ASCENDING)], name="invoice_token", sparse=True),
        IndexModel([("user_id", ASCENDING), ("product_id", ASCENDING)], name="one_pending_per_user", unique=True,
                   partialFilterExpression={"status": "pending"}),
        IndexModel([("user_id", ASCENDING), ("coupon_code", ASCENDING), ("status", ASCENDING)], name="user_coupon"),
        IndexModel([("created_at", DESCENDING)], name="created_at"),
    ],
    "users": [
        IndexModel([("user_id", ASCENDING)], name="user_id", unique=True),
        IndexModel([("referral_code", ASCENDING)], name="referral_code", unique=True, sparse=True),
    ],
    "coupons": [IndexModel([("code", ASCENDING)], name="code", unique=True)],
    "files": [IndexModel([("storage_path", ASCENDING)], name="storage_path")],
    "contact_messages": [IndexModel([("created_at", DESCENDING)], name="created_at")],
    "drop_alerts": [IndexModel([("phone", ASCENDING)], name="active_phone", unique=True,
                               partialFilterExpression={"active": True})],
}


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:
                logger.error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)


app = FastAPI(title="Dealwills API")
api = APIRouter(prefix="/api")


def now() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return str(uuid.uuid4())


def clean(doc):
    if doc:
        doc.pop("_id", None)
    return doc


# ---------------- Realtime ----------------
class Hub:
    def __init__(self):
        self.sockets: set[WebSocket] = set()

    async def broadcast(self, msg: dict):
        dead = []
        for ws in list(self.sockets):
            try:
                await ws.send_text(json.dumps(msg))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.sockets.discard(ws)


hub = Hub()


@api.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    hub.sockets.add(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        hub.sockets.discard(ws)


async def notify_deal_change():
    await hub.broadcast({"type": "deal_update", "at": now().isoformat()})


# ---------------- Users & roles ----------------
ROLES = ["admin", "customer"]
DEFAULT_ROLE = "customer"
RETIRED_ROLES = {}
RANK = {r: len(ROLES) - i for i, r in enumerate(ROLES)}
ENV = "live" if os.environ.get("CLERK_PUBLISHABLE_KEY", "").startswith("pk_live_") else "preview"
IN_ENV = {"env": {"$in": [ENV, None]}}


def effective_role(role) -> str:
    role = RETIRED_ROLES.get(role, role)
    return role if role in ROLES else DEFAULT_ROLE


def _clerk_profile(user_id: str) -> dict:
    """One Clerk lookup on first sign-in: verified-admin flag, email and name."""
    admins = {e.strip().lower() for e in os.environ.get("ADMIN_EMAIL", "").split(",") if e.strip()}
    r = requests.get(f"https://api.clerk.com/v1/users/{user_id}", timeout=10,
                     headers={"Authorization": f"Bearer {os.environ['CLERK_SECRET_KEY']}", "User-Agent": "dealwills-app"})
    r.raise_for_status()
    data = r.json()
    emails = data.get("email_addresses") or []
    is_admin = any(e["email_address"].lower() in admins and (e.get("verification") or {}).get("status") == "verified"
                   for e in emails)
    primary = next((e["email_address"] for e in emails if e["id"] == data.get("primary_email_address_id")),
                   emails[0]["email_address"] if emails else "")
    name = " ".join(x for x in [data.get("first_name"), data.get("last_name")] if x)
    return {"is_admin": is_admin, "email": primary, "name": name}


def gen_ref_code() -> str:
    return "OT" + "".join(random.choices(string.ascii_uppercase + string.digits, k=6))


async def current_member(user: dict = Depends(require_user)) -> dict:
    uid = user["user_id"]
    member = await db.users.find_one({"user_id": uid}, {"_id": 0})
    if member is None or not member.get("role"):
        prof = await run_in_threadpool(_clerk_profile, uid)
        role = "admin" if prof["is_admin"] else DEFAULT_ROLE
        await db.users.update_one({"user_id": uid, "role": {"$in": [None, ""]}}, {"$set": {"role": role}})
        member = await db.users.find_one_and_update(
            {"user_id": uid},
            {"$setOnInsert": {"user_id": uid, "role": role, "email": prof["email"], "name": prof["name"],
                              "phone": "", "referral_code": gen_ref_code(), "referral_credit": 0,
                              "referred_by": None, "created_at": now()}},
            upsert=True, projection={"_id": 0}, return_document=ReturnDocument.AFTER)
    if member.get("env") != ENV:
        await db.users.update_one({"user_id": uid}, {"$set": {"env": ENV}})
    return {**member, "env": ENV, "role": effective_role(member["role"])}


def require_role(*roles: str):
    async def check(member: dict = Depends(current_member)) -> dict:
        if member["role"] not in roles:
            raise HTTPException(status_code=403, detail="Not allowed")
        return member
    return check


admin_only = require_role("admin")


class ProfileIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    phone: str = Field(min_length=10, max_length=16)


@api.get("/me")
async def me(member: dict = Depends(current_member)):
    referrals = await db.users.count_documents({"referred_by": member["user_id"], "referral_rewarded": True})
    return {**member, "referrals_count": referrals, "referral_reward": REFERRAL_REWARD}


@api.put("/me")
async def update_me(body: ProfileIn, member: dict = Depends(current_member)):
    await db.users.update_one({"user_id": member["user_id"]}, {"$set": {"name": body.name, "phone": body.phone}})
    return {"ok": True}


@api.get("/users")
async def list_users(admin: dict = Depends(admin_only)):
    people = await db.users.find(IN_ENV, {"_id": 0}).sort("created_at", -1).to_list(2000)
    stats = {s["_id"]: s async for s in db.orders.aggregate([
        {"$match": {"status": "paid"}},
        {"$group": {"_id": "$user_id", "orders": {"$sum": 1}, "spent": {"$sum": "$total"}, "units": {"$sum": "$qty"}}}])}
    return {"roles": [r for r in ROLES if RANK[r] <= RANK[admin["role"]]],
            "users": [{**p, "role": effective_role(p.get("role")),
                       "paid_orders": stats.get(p["user_id"], {}).get("orders", 0),
                       "spent": stats.get(p["user_id"], {}).get("spent", 0)} for p in people]}


class RoleIn(BaseModel):
    role: str


@api.patch("/users/{user_id}/role")
async def set_role(user_id: str, body: RoleIn, admin: dict = Depends(admin_only)):
    if body.role not in ROLES or RANK[body.role] > RANK[admin["role"]]:
        raise HTTPException(status_code=403, detail="Not allowed")
    target = await db.users.find_one({"user_id": user_id, **IN_ENV}, {"_id": 0})
    if target is None:
        raise HTTPException(status_code=404, detail="Not found")
    if (effective_role(target.get("role")) == "admin" and body.role != "admin"
            and await db.users.count_documents({"role": "admin", **IN_ENV}) <= 1):
        raise HTTPException(status_code=409, detail="Keep at least one admin")
    await db.users.update_one({"user_id": user_id}, {"$set": {"role": body.role}})
    return {"user_id": user_id, "role": body.role}


# ---------------- Products / deal engine ----------------
class Slab(BaseModel):
    qty: int = Field(ge=1)
    price: float = Field(gt=0)


class Spec(BaseModel):
    label: str
    value: str


class ProductIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    category: str = ""
    description: str = ""
    images: List[str] = []
    specs: List[Spec] = []
    original_price: float = Field(gt=0)
    slabs: List[Slab] = Field(min_length=1)
    min_qty: int = Field(default=1, ge=1)
    max_qty: int = Field(default=2, ge=1)
    delivery_charge: float = Field(default=0, ge=0)
    gst_rate: Literal[5, 18] = 18
    hsn_code: str = Field(default="", max_length=12)
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None


def total_qty(slabs) -> int:
    return sum(s["qty"] for s in slabs)


def price_at(slabs, position: int) -> float:
    acc = 0
    for s in slabs:
        acc += s["qty"]
        if position < acc:
            return s["price"]
    return slabs[-1]["price"]


def price_breakdown(slabs, start: int, qty: int):
    lines = {}
    for i in range(qty):
        p = price_at(slabs, start + i)
        lines[p] = lines.get(p, 0) + 1
    return [{"price": p, "qty": q} for p, q in lines.items()]


EARLY_ACCESS_MINUTES = 5


def phone10(s: str) -> str:
    digits = "".join(c for c in (s or "") if c.isdigit())
    return digits[-10:]


def in_early_access(p: dict) -> bool:
    return p["status"] == "live" and bool(p.get("early_access_until")) and p["early_access_until"] > now()


def display_status(p: dict) -> str:
    st = p["status"]
    if st == "sold_out" or (st == "live" and p["sold"] >= p["total_qty"]):
        return "SOLD_OUT"
    if in_early_access(p):
        return "EARLY_ACCESS"
    if st in ("expired", "stopped"):
        return "OFFER_EXPIRED"
    if st == "paused":
        return "PAUSED"
    if st in ("queued", "draft"):
        return "COMING_SOON"
    remaining = p["total_qty"] - p["sold"]
    ratio = remaining / p["total_qty"]
    if ratio <= 0.10:
        return "ALMOST_SOLD_OUT"
    if ratio <= 0.50:
        return "LIMITED_STOCK"
    return "LIVE_DEAL"


def public_product(p: dict) -> dict:
    position = p["sold"] + p["reserved"]
    current_price = price_at(p["slabs"], min(position, p["total_qty"] - 1))
    return {
        "id": p["id"], "name": p["name"], "category": p.get("category", ""), "description": p.get("description", ""),
        "images": p.get("images", []), "specs": p.get("specs", []), "original_price": p["original_price"],
        "slabs": p["slabs"], "min_qty": p["min_qty"], "max_qty": p["max_qty"],
        "delivery_charge": p.get("delivery_charge", 0), "gst_rate": p.get("gst_rate", 18),
        "start_at": p.get("start_at"), "end_at": p.get("end_at"), "status": p["status"],
        "display_status": display_status(p), "total_qty": p["total_qty"], "sold": p["sold"],
        "reserved": p["reserved"], "remaining": max(p["total_qty"] - p["sold"], 0),
        "available": max(p["total_qty"] - p["sold"] - p["reserved"], 0),
        "current_price": current_price,
        "discount_percent": round((1 - current_price / p["original_price"]) * 100),
        "percent_sold": round(p["sold"] * 100 / p["total_qty"], 1),
        "drop_number": p.get("drop_number", 0),
        "early_access_until": p.get("early_access_until") if in_early_access(p) else None,
        "activated_at": p.get("activated_at"), "closed_at": p.get("closed_at"),
        "sold_in_seconds": int((p["closed_at"] - p["activated_at"]).total_seconds())
        if p["status"] == "sold_out" and p.get("closed_at") and p.get("activated_at") else None,
    }


_engine_lock = asyncio.Lock()


async def close_product(p: dict, status: str):
    await db.products.update_one({"id": p["id"], "status": p["status"]},
                                 {"$set": {"status": status, "closed_at": now()}})
    for o in await db.orders.find({"product_id": p["id"], "status": "pending"}).to_list(1000):
        await release_order(o, "cancelled")


async def advance_deals() -> bool:
    """Close the live deal when sold out/expired and activate the next eligible queued one."""
    changed = False
    async with _engine_lock:
        t = now()
        live = await db.products.find_one({"status": "live"})
        if live:
            if live["sold"] >= live["total_qty"]:
                await close_product(live, "sold_out")
                changed = True
            elif live.get("end_at") and live["end_at"] <= t:
                await close_product(live, "expired")
                changed = True
            else:
                return False
        if await db.products.find_one({"status": "paused"}):
            return changed
        candidate = await db.products.find_one(
            {"status": "queued", "$or": [{"start_at": None}, {"start_at": {"$lte": t}}]},
            sort=[("queue_position", ASCENDING)])
        if candidate:
            if candidate.get("end_at") and candidate["end_at"] <= t:
                await close_product(candidate, "expired")
            else:
                last = await db.products.find_one({"drop_number": {"$gt": 0}}, sort=[("drop_number", DESCENDING)])
                with suppress(DuplicateKeyError):
                    has_subs = await db.drop_alerts.count_documents({"active": True}) > 0
                    res = await db.products.update_one(
                        {"id": candidate["id"], "status": "queued"},
                        {"$set": {"status": "live", "activated_at": t,
                                  "early_access_until": t + timedelta(minutes=EARLY_ACCESS_MINUTES) if has_subs else None,
                                  "drop_number": (last["drop_number"] if last else 0) + 1}})
                    if res.modified_count:
                        await db.drop_alerts.update_many({"active": True}, {"$set": {"early_product_id": candidate["id"]}})
                        task = asyncio.create_task(send_drop_alerts(candidate["id"]))
                        _bg_tasks.add(task)
                        task.add_done_callback(_bg_tasks.discard)
            changed = True
    if changed:
        await notify_deal_change()
    return changed


async def activity_for(product_id: str) -> dict:
    t = now()
    recent = await db.orders.find({"product_id": product_id, "status": "paid"},
                                  {"_id": 0, "qty": 1, "paid_at": 1, "customer_name": 1}).sort("paid_at", -1).limit(5).to_list(5)
    for r in recent:
        first = (r.pop("customer_name", "") or "").strip().split(" ")[0]
        r["name"] = first[:20].capitalize() or "Someone"
    last_hour = await db.orders.aggregate([
        {"$match": {"product_id": product_id, "status": "paid", "paid_at": {"$gte": t - timedelta(hours=1)}}},
        {"$group": {"_id": None, "units": {"$sum": "$qty"}, "orders": {"$sum": 1}}}]).to_list(1)
    return {"recent": recent,
            "last_hour_units": last_hour[0]["units"] if last_hour else 0,
            "last_hour_orders": last_hour[0]["orders"] if last_hour else 0}


@api.get("/deal/current")
async def current_deal():
    p = await db.products.find_one({"status": {"$in": ["live", "paused"]}})
    if not p:
        p = await db.products.find_one({"status": {"$in": ["sold_out", "expired", "stopped"]}},
                                       sort=[("closed_at", DESCENDING)])
    nxt = await db.products.find_one({"status": "queued"}, sort=[("queue_position", ASCENDING)])
    teaser = None
    if nxt:
        teaser = {"name": nxt["name"], "category": nxt.get("category", ""),
                  "image": (nxt.get("images") or [None])[0], "start_at": nxt.get("start_at"),
                  "original_price": nxt["original_price"]}
    return {"deal": public_product(p) if p else None,
            "activity": await activity_for(p["id"]) if p else None,
            "next": teaser, "server_time": now()}


# ---------------- Admin: products ----------------
def product_doc(body: ProductIn) -> dict:
    d = body.model_dump()
    d["total_qty"] = total_qty(d["slabs"])
    if d["max_qty"] < d["min_qty"]:
        raise HTTPException(400, "Max quantity per customer must be ≥ min quantity")
    if d["start_at"] and d["end_at"] and d["end_at"] <= d["start_at"]:
        raise HTTPException(400, "Offer end must be after start")
    return d


@api.get("/admin/products")
async def admin_products(_: dict = Depends(admin_only)):
    items = await db.products.find({}, {"_id": 0}).to_list(1000)
    order = {"live": 0, "paused": 1, "queued": 2, "draft": 3}
    items.sort(key=lambda p: (order.get(p["status"], 4), p.get("queue_position") or 0,
                              -(p.get("closed_at") or p["created_at"]).timestamp()))
    return [{**p, "display_status": display_status(p)} for p in items]


@api.post("/admin/products")
async def create_product(body: ProductIn, _: dict = Depends(admin_only)):
    d = product_doc(body)
    last = await db.products.find_one({}, sort=[("queue_position", DESCENDING)])
    d.update({"id": new_id(), "status": "draft", "sold": 0, "reserved": 0, "created_at": now(),
              "queue_position": (last.get("queue_position", 0) if last else 0) + 1, "drop_number": 0})
    await db.products.insert_one(d)
    return clean(d)


@api.put("/admin/products/{pid}")
async def update_product(pid: str, body: ProductIn, _: dict = Depends(admin_only)):
    d = product_doc(body)
    res = await db.products.find_one_and_update(
        {"id": pid, "$expr": {"$gte": [d["total_qty"], {"$add": ["$sold", "$reserved"]}]}},
        {"$set": d}, projection={"_id": 0}, return_document=ReturnDocument.AFTER)
    if not res:
        if await db.products.find_one({"id": pid}):
            raise HTTPException(400, "Total quantity cannot be lower than units already sold or reserved")
        raise HTTPException(404, "Not found")
    await advance_deals()
    await notify_deal_change()
    return res


@api.delete("/admin/products/{pid}")
async def delete_product(pid: str, _: dict = Depends(admin_only)):
    """Explicit admin action: permanently removes the product and all of its orders."""
    res = await db.products.delete_one({"id": pid})
    if not res.deleted_count:
        raise HTTPException(404, "Not found")
    orders = await db.orders.delete_many({"product_id": pid})
    await advance_deals()
    await notify_deal_change()
    return {"ok": True, "orders_deleted": orders.deleted_count}


class ActionIn(BaseModel):
    action: Literal["queue", "unqueue", "activate_now", "pause", "resume", "stop", "make_next", "move_up", "move_down"]


@api.post("/admin/products/{pid}/action")
async def product_action(pid: str, body: ActionIn, _: dict = Depends(admin_only)):
    p = await db.products.find_one({"id": pid})
    if not p:
        raise HTTPException(404, "Not found")
    a, st = body.action, p["status"]
    if a == "queue" and st == "draft":
        last = await db.products.find_one({"status": "queued"}, sort=[("queue_position", DESCENDING)])
        await db.products.update_one({"id": pid}, {"$set": {"status": "queued",
                                                            "queue_position": (last["queue_position"] if last else 0) + 1}})
    elif a == "unqueue" and st == "queued":
        await db.products.update_one({"id": pid}, {"$set": {"status": "draft"}})
    elif a == "make_next" and st in ("queued", "draft"):
        first = await db.products.find_one({"status": "queued"}, sort=[("queue_position", ASCENDING)])
        await db.products.update_one({"id": pid}, {"$set": {"status": "queued",
                                                            "queue_position": (first["queue_position"] if first else 1) - 1}})
    elif a in ("move_up", "move_down") and st == "queued":
        cmp, srt = ("$lt", DESCENDING) if a == "move_up" else ("$gt", ASCENDING)
        other = await db.products.find_one({"status": "queued", "queue_position": {cmp: p["queue_position"]}},
                                           sort=[("queue_position", srt)])
        if other:
            await db.products.update_one({"id": pid}, {"$set": {"queue_position": other["queue_position"]}})
            await db.products.update_one({"id": other["id"]}, {"$set": {"queue_position": p["queue_position"]}})
    elif a == "pause" and st == "live":
        await db.products.update_one({"id": pid, "status": "live"}, {"$set": {"status": "paused"}})
    elif a == "resume" and st == "paused":
        if await db.products.find_one({"status": "live"}):
            raise HTTPException(409, "Another deal is live")
        await db.products.update_one({"id": pid, "status": "paused"}, {"$set": {"status": "live"}})
    elif a == "stop" and st in ("live", "paused"):
        await close_product(p, "stopped")
    elif a == "activate_now" and st in ("queued", "draft"):
        if p["sold"] >= p["total_qty"]:
            raise HTTPException(400, "No stock left on this product")
        async with _engine_lock:
            for cur in await db.products.find({"status": {"$in": ["live", "paused"]}}).to_list(5):
                await close_product(cur, "stopped")
            first = await db.products.find_one({"status": "queued"}, sort=[("queue_position", ASCENDING)])
            await db.products.update_one({"id": pid}, {"$set": {
                "status": "queued", "start_at": None,
                "queue_position": (first["queue_position"] if first else 1) - 1}})
    else:
        raise HTTPException(400, f"Cannot {a.replace('_', ' ')} a {st} product")
    await advance_deals()
    await notify_deal_change()
    return clean(await db.products.find_one({"id": pid}))


@api.post("/admin/upload")
async def upload_image(file: UploadFile = File(...), admin: dict = Depends(admin_only)):
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(400, "Only images allowed")
    data = await file.read()
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(400, "Image must be under 8MB")
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "jpg"
    path = f"{storage.APP_NAME}/products/{uuid.uuid4()}.{ext}"
    result = await run_in_threadpool(storage.put_object, path, data, file.content_type)
    await db.files.insert_one({"id": new_id(), "storage_path": result["path"], "original_filename": file.filename,
                               "content_type": file.content_type, "size": result.get("size"), "is_deleted": False,
                               "uploaded_by": admin["user_id"], "created_at": now()})
    return {"url": f"/api/files/{result['path']}"}


@api.get("/files/{path:path}")
async def get_file(path: str):
    record = await db.files.find_one({"storage_path": path, "is_deleted": False})
    if not record:
        raise HTTPException(404, "File not found")
    try:
        data, ctype = await run_in_threadpool(storage.get_object, path)
    except FileNotFoundError:
        raise HTTPException(404, "File not found")
    return Response(content=data, media_type=record.get("content_type") or ctype,
                    headers={"Cache-Control": "public, max-age=86400"})


# ---------------- Coupons ----------------
class CouponIn(BaseModel):
    code: str = Field(min_length=3, max_length=24)
    kind: Literal["percent", "flat"] = "percent"
    value: float = Field(gt=0)
    max_uses: int = Field(default=100, ge=1)
    min_order: float = 0
    expires_at: Optional[datetime] = None
    active: bool = True


@api.get("/admin/coupons")
async def list_coupons(_: dict = Depends(admin_only)):
    return await db.coupons.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.post("/admin/coupons")
async def create_coupon(body: CouponIn, _: dict = Depends(admin_only)):
    d = body.model_dump()
    d["code"] = d["code"].strip().upper()
    if d["kind"] == "percent" and d["value"] > 90:
        raise HTTPException(400, "Percent discount max 90")
    if await db.coupons.find_one({"code": d["code"]}):
        raise HTTPException(409, "Coupon code already exists")
    d.update({"id": new_id(), "used_count": 0, "created_at": now()})
    await db.coupons.insert_one(d)
    return clean(d)


class CouponToggleIn(BaseModel):
    active: bool


@api.patch("/admin/coupons/{cid}")
async def toggle_coupon(cid: str, body: CouponToggleIn, _: dict = Depends(admin_only)):
    if not (await db.coupons.update_one({"id": cid}, {"$set": {"active": body.active}})).matched_count:
        raise HTTPException(404, "Coupon not found")
    return {"ok": True}


def coupon_discount(c: dict, subtotal: float) -> float:
    if c["kind"] == "percent":
        return round(subtotal * c["value"] / 100, 2)
    return min(c["value"], subtotal - 1)


async def validate_coupon(code: str, subtotal: float, user_id: str) -> dict:
    c = await db.coupons.find_one({"code": code.strip().upper()}, {"_id": 0})
    if not c or not c.get("active"):
        raise HTTPException(400, "Invalid coupon code")
    if c.get("expires_at") and c["expires_at"] <= now():
        raise HTTPException(400, "Coupon has expired")
    if c["used_count"] >= c["max_uses"]:
        raise HTTPException(400, "Coupon usage limit reached")
    if subtotal < c.get("min_order", 0):
        raise HTTPException(400, f"Minimum order ₹{c['min_order']:.0f} for this coupon")
    if await db.orders.find_one({"user_id": user_id, "coupon_code": c["code"], "status": "paid"}):
        raise HTTPException(400, "You have already used this coupon")
    return c


# ---------------- Orders / checkout ----------------
class ReserveIn(BaseModel):
    product_id: str
    qty: int = Field(ge=1, le=100)
    ref_code: Optional[str] = None


def order_number() -> str:
    return "OT" + now().strftime("%y%m%d") + "".join(random.choices(string.digits, k=5))


@api.post("/orders/reserve")
async def reserve(body: ReserveIn, member: dict = Depends(current_member)):
    await advance_deals()
    p = await db.products.find_one({"id": body.product_id, "status": "live"})
    if not p:
        raise HTTPException(409, "This deal is not live")
    if in_early_access(p) and not await has_early_access(member, p["id"]):
        raise HTTPException(403, "Early access is for drop-alert subscribers. Opens to everyone in a few minutes.")
    if body.qty < p["min_qty"] or body.qty > p["max_qty"]:
        raise HTTPException(400, f"Quantity must be between {p['min_qty']} and {p['max_qty']}")
    existing = await db.orders.find_one({"user_id": member["user_id"], "product_id": p["id"], "status": "pending"})
    if existing:
        return clean(existing)
    bought = await db.orders.aggregate([
        {"$match": {"user_id": member["user_id"], "product_id": p["id"], "status": "paid"}},
        {"$group": {"_id": None, "q": {"$sum": "$qty"}}}]).to_list(1)
    already = bought[0]["q"] if bought else 0
    if already + body.qty > p["max_qty"]:
        raise HTTPException(400, f"Limit is {p['max_qty']} per customer; you already bought {already}")
    before = await db.products.find_one_and_update(
        {"id": p["id"], "status": "live",
         "$expr": {"$lte": [{"$add": ["$sold", "$reserved", body.qty]}, "$total_qty"]}},
        {"$inc": {"reserved": body.qty}}, return_document=ReturnDocument.BEFORE)
    if not before:
        raise HTTPException(409, "Not enough units left — they may be reserved by other shoppers")
    lines = price_breakdown(before["slabs"], before["sold"] + before["reserved"], body.qty)
    subtotal = round(sum(line["price"] * line["qty"] for line in lines), 2)
    if body.ref_code and not member.get("referred_by") and not await db.orders.find_one(
            {"user_id": member["user_id"], "status": "paid"}):
        ref = await db.users.find_one({"referral_code": body.ref_code.strip().upper()})
        if ref and ref["user_id"] != member["user_id"]:
            await db.users.update_one({"user_id": member["user_id"], "referred_by": None},
                                      {"$set": {"referred_by": ref["user_id"]}})
    order = {
        "id": new_id(), "order_number": order_number(), "user_id": member["user_id"],
        "email": member.get("email", ""), "product_id": p["id"], "product_name": p["name"],
        "product_image": (p.get("images") or [None])[0], "qty": body.qty, "lines": lines,
        "original_price": p["original_price"], "subtotal": subtotal, "coupon_code": None,
        "coupon_discount": 0, "credit_used": 0, "delivery_charge": p.get("delivery_charge", 0),
        "gst_rate": p.get("gst_rate", 18), "hsn_code": p.get("hsn_code", ""),
        **tax_totals(subtotal, 0, 0, p.get("delivery_charge", 0), p.get("gst_rate", 18)), "status": "pending",
        "fulfillment": "placed", "payment_method": None, "customer_name": member.get("name", ""),
        "phone": member.get("phone", ""), "address": None, "created_at": now(),
        "expires_at": now() + timedelta(minutes=RESERVATION_MINUTES), "paid_at": None,
    }
    try:
        await db.orders.insert_one(order)
    except DuplicateKeyError:
        await db.products.update_one({"id": p["id"]}, {"$inc": {"reserved": -body.qty}})
        return clean(await db.orders.find_one({"user_id": member["user_id"], "product_id": p["id"], "status": "pending"}))
    await notify_deal_change()
    return clean(order)


@api.get("/orders/mine")
async def my_orders(member: dict = Depends(current_member)):
    return await db.orders.find({"user_id": member["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)


@api.get("/orders/{oid}")
async def get_order(oid: str, member: dict = Depends(current_member)):
    o = await db.orders.find_one({"id": oid, "user_id": member["user_id"]}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Not found")
    return o


class Address(BaseModel):
    line1: str = Field(min_length=3)
    line2: str = ""
    city: str = Field(min_length=2)
    state: str = Field(min_length=2)
    pincode: str = Field(min_length=6, max_length=6)


class CheckoutIn(BaseModel):
    customer_name: str = Field(min_length=1)
    phone: str = Field(min_length=10, max_length=16)
    address: Address
    coupon_code: Optional[str] = None
    use_credit: bool = False
    payment_method: Literal["upi", "card", "netbanking"]


class CouponCheckIn(BaseModel):
    code: str
    order_id: str


@api.post("/coupons/validate")
async def coupon_check(body: CouponCheckIn, member: dict = Depends(current_member)):
    o = await db.orders.find_one({"id": body.order_id, "user_id": member["user_id"]})
    if not o:
        raise HTTPException(404, "Not found")
    c = await validate_coupon(body.code, o["subtotal"], member["user_id"])
    return {"code": c["code"], "discount": coupon_discount(c, o["subtotal"]), "kind": c["kind"], "value": c["value"]}


async def refund_credit(o: dict):
    amt = o.get("credit_used") or 0
    if amt and (await db.orders.update_one({"id": o["id"], "credit_used": amt}, {"$set": {"credit_used": 0}})).modified_count:
        await db.users.update_one({"user_id": o["user_id"]}, {"$inc": {"referral_credit": amt}})


def backend_public_url(request: Request = None) -> str:
    url = (os.environ.get("BACKEND_PUBLIC_URL") or os.environ.get("RENDER_EXTERNAL_URL") or "").strip().rstrip("/")
    if url:
        return url
    if request is not None:
        return str(request.base_url).rstrip("/")
    return ""


@api.post("/orders/{oid}/checkout")
async def checkout(oid: str, body: CheckoutIn, request: Request, member: dict = Depends(current_member)):
    o = await db.orders.find_one({"id": oid, "user_id": member["user_id"], "status": "pending"})
    if not o:
        raise HTTPException(404, "No active reservation")
    if o["expires_at"] <= now():
        raise HTTPException(410, "Reservation expired")
    discount, code = 0, None
    if body.coupon_code:
        c = await validate_coupon(body.coupon_code, o["subtotal"], member["user_id"])
        discount, code = coupon_discount(c, o["subtotal"]), c["code"]
    await refund_credit(o)
    credit = 0
    if body.use_credit:
        u = await db.users.find_one({"user_id": member["user_id"]})
        want = min(u.get("referral_credit", 0), max(o["subtotal"] - discount - 1, 0))
        if want > 0 and await db.users.find_one_and_update(
                {"user_id": member["user_id"], "referral_credit": {"$gte": want}}, {"$inc": {"referral_credit": -want}}):
            credit = want
    totals = tax_totals(o["subtotal"], discount, credit, o.get("delivery_charge", 0), o.get("gst_rate", 18))
    await db.orders.update_one({"id": oid}, {"$set": {
        "customer_name": body.customer_name, "phone": body.phone, "address": body.address.model_dump(),
        "coupon_code": code, "coupon_discount": discount, "credit_used": credit, **totals,
        "payment_method": body.payment_method,
        "site_origin": request.headers.get("origin", ""),
        "backend_origin": backend_public_url(request)}})
    if not member.get("phone"):
        await db.users.update_one({"user_id": member["user_id"]},
                                  {"$set": {"phone": body.phone, "name": member.get("name") or body.customer_name}})
    return clean(await db.orders.find_one({"id": oid}))


async def release_order(o: dict, status: str) -> bool:
    res = await db.orders.update_one({"id": o["id"], "status": "pending"},
                                     {"$set": {"status": status, "closed_at": now()}})
    if not res.modified_count:
        return False
    await db.products.update_one({"id": o["product_id"], "reserved": {"$gte": o["qty"]}},
                                 {"$inc": {"reserved": -o["qty"]}})
    await refund_credit(o)
    return True


async def confirm_paid(order_id: str, payment_id: str) -> Optional[dict]:
    pending = await db.orders.find_one({"id": order_id, "status": "pending"})
    if not pending or not await db.products.find_one({"id": pending["product_id"], "status": {"$in": ["live", "paused"]}}):
        return None
    o = await db.orders.find_one_and_update(
        {"id": order_id, "status": "pending", "expires_at": {"$gt": now()}, "address": {"$ne": None}},
        {"$set": {"status": "paid", "paid_at": now(), "payment_id": payment_id}},
        return_document=ReturnDocument.AFTER)
    if not o:
        return None
    await db.products.update_one({"id": o["product_id"]}, {"$inc": {"sold": o["qty"], "reserved": -o["qty"]}})
    if o.get("coupon_code"):
        if not (await db.coupons.update_one({"code": o["coupon_code"], "$expr": {"$lt": ["$used_count", "$max_uses"]}},
                                            {"$inc": {"used_count": 1}})).modified_count:
            logger.warning("Coupon %s over max_uses on paid order %s", o["coupon_code"], o["order_number"])
    buyer = await db.users.find_one({"user_id": o["user_id"]})
    if buyer and buyer.get("referred_by") and not buyer.get("referral_rewarded"):
        if (await db.users.update_one({"user_id": o["user_id"], "referral_rewarded": {"$ne": True}},
                                      {"$set": {"referral_rewarded": True}})).modified_count:
            await db.users.update_one({"user_id": buyer["referred_by"]}, {"$inc": {"referral_credit": REFERRAL_REWARD}})
    msg = (f"Dealwills: Order {o['order_number']} confirmed! {o['qty']} x {o['product_name']} for Rs.{o['total']:.0f}. "
           f"Track it on Dealwills with your order number.")
    sms_status = await run_in_threadpool(send_sms, o["phone"], msg)
    await db.orders.update_one({"id": o["id"]}, {"$set": {"sms_status": sms_status}})
    o = await ensure_invoice(o)
    await send_invoice_whatsapp(o)
    await advance_deals()
    await notify_deal_change()
    return clean(o)


async def handle_payment_event(event: dict):
    """Single server-side entry point for gateway events (webhook)."""
    oid, kind = event.get("order_id"), event.get("event")
    o = await db.orders.find_one({"id": oid})
    if not o:
        raise HTTPException(404, "Order not found")
    if kind == "payment.captured":
        if o["status"] == "paid":
            return clean(o)
        res = await confirm_paid(oid, event.get("payment_id", ""))
        if not res:
            fresh = await db.orders.find_one({"id": oid}, {"_id": 0})
            if fresh["status"] == "pending":
                await release_order(fresh, "expired")
                await notify_deal_change()
            raise HTTPException(410, "Reservation expired or the deal closed before payment completed")
        return res
    if kind == "payment.failed":
        await release_order(o, "failed")
        await notify_deal_change()
        return clean(await db.orders.find_one({"id": oid}))
    raise HTTPException(400, "Unknown event")


def sign(body: bytes) -> str:
    secret = os.environ.get("PAYMENT_WEBHOOK_SECRET", "")
    if not secret:
        raise HTTPException(503, "Webhook secret is not configured")
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


@api.post("/payments/webhook")
async def payment_webhook(request: Request):
    raw = await request.body()
    if not hmac.compare_digest(sign(raw), request.headers.get("x-dealwills-signature", "")):
        raise HTTPException(401, "Bad signature")
    try:
        event = json.loads(raw)
    except ValueError:
        raise HTTPException(400, "Invalid JSON")
    return await handle_payment_event(event)


class SimulateIn(BaseModel):
    outcome: Literal["success", "failure"]


@api.post("/payments/simulate/{oid}")
async def simulate_payment(oid: str, body: SimulateIn, member: dict = Depends(current_member)):
    """SIMULATED gateway: builds a signed event and runs it through the same webhook handler."""
    o = await db.orders.find_one({"id": oid, "user_id": member["user_id"]})
    if not o:
        raise HTTPException(404, "Not found")
    if o["status"] != "pending":
        raise HTTPException(409, f"Order is already {o['status']}")
    if not o.get("address"):
        raise HTTPException(400, "Complete delivery details first")
    event = {"event": "payment.captured" if body.outcome == "success" else "payment.failed",
             "order_id": oid, "payment_id": "sim_pay_" + uuid.uuid4().hex[:14]}
    return await handle_payment_event(event)


@api.post("/orders/{oid}/cancel")
async def cancel_reservation(oid: str, member: dict = Depends(current_member)):
    o = await db.orders.find_one({"id": oid, "user_id": member["user_id"]})
    if not o:
        raise HTTPException(404, "Not found")
    if not await release_order(o, "cancelled"):
        raise HTTPException(409, "Only pending orders can be cancelled")
    await notify_deal_change()
    return {"ok": True}


class TrackIn(BaseModel):
    order_number: str
    phone: str


@api.post("/track")
async def track(body: TrackIn):
    o = await db.orders.find_one({"order_number": body.order_number.strip().upper()}, {"_id": 0})
    digits = lambda s: "".join(c for c in (s or "") if c.isdigit())[-10:]
    if not o or len(digits(body.phone)) < 10 or digits(o.get("phone")) != digits(body.phone):
        raise HTTPException(404, "No order found with that number and phone")
    return {k: o.get(k) for k in ("order_number", "product_name", "product_image", "qty", "total", "status",
                                  "fulfillment", "created_at", "paid_at")}


async def sweeper():
    while True:
        try:
            expired = await db.orders.find({"status": "pending", "expires_at": {"$lte": now()}}).to_list(500)
            released = [await release_order(o, "expired") for o in expired]
            await advance_deals()
            if any(released):
                await notify_deal_change()
        except Exception as exc:
            logger.error("sweeper: %s", exc)
        await asyncio.sleep(SWEEP_SECONDS)


# ---------------- Admin: orders, analytics, export ----------------
def order_filter(status: Optional[str], product_id: Optional[str], q: Optional[str]) -> dict:
    f = {}
    if status:
        f["status"] = status
    if product_id:
        f["product_id"] = product_id
    if q:
        f["$or"] = [{k: {"$regex": re.escape(q), "$options": "i"}} for k in ("order_number", "customer_name", "phone", "email")]
    return f


@api.get("/admin/orders")
async def admin_orders(status: Optional[str] = None, product_id: Optional[str] = None, q: Optional[str] = None,
                       limit: int = Query(200, le=1000), _: dict = Depends(admin_only)):
    return await db.orders.find(order_filter(status, product_id, q), {"_id": 0}).sort("created_at", -1) \
        .limit(limit).to_list(limit)


class FulfillIn(BaseModel):
    fulfillment: Literal["placed", "packed", "shipped", "delivered"]


@api.patch("/admin/orders/{oid}")
async def fulfil_order(oid: str, body: FulfillIn, _: dict = Depends(admin_only)):
    res = await db.orders.update_one({"id": oid, "status": "paid"}, {"$set": {"fulfillment": body.fulfillment}})
    if not res.matched_count:
        raise HTTPException(400, "Only paid orders can be fulfilled")
    return {"ok": True}


EXPORT_COLS = ["order_number", "created_at", "paid_at", "status", "fulfillment", "customer_name", "email", "phone",
               "product_name", "qty", "subtotal", "coupon_code", "coupon_discount", "credit_used", "delivery_charge",
               "taxable_value", "gst_rate", "gst_amount", "total", "invoice_number",
               "payment_method", "payment_id", "address"]


def export_row(o: dict) -> list:
    row = []
    for c in EXPORT_COLS:
        v = o.get(c)
        if c == "invoice_number":
            v = (o.get("invoice") or {}).get("number")
        if c == "address" and v:
            v = ", ".join(x for x in [v.get("line1"), v.get("line2"), v.get("city"), v.get("state"), v.get("pincode")] if x)
        elif isinstance(v, datetime):
            v = v.strftime("%Y-%m-%d %H:%M:%S")
        row.append("" if v is None else v)
    return row


@api.get("/admin/orders/export")
async def export_orders(fmt: Literal["csv", "xlsx"] = "csv", status: Optional[str] = None,
                        product_id: Optional[str] = None, _: dict = Depends(admin_only)):
    orders = await db.orders.find(order_filter(status, product_id, None), {"_id": 0}).sort("created_at", -1).to_list(50000)
    stamp = now().strftime("%Y%m%d_%H%M")
    if fmt == "csv":
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(EXPORT_COLS)
        for o in orders:
            w.writerow(export_row(o))
        return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                                 headers={"Content-Disposition": f"attachment; filename=dealwills_orders_{stamp}.csv"})
    from openpyxl import Workbook
    wb = Workbook()
    ws = wb.active
    ws.title = "Orders"
    ws.append(EXPORT_COLS)
    for o in orders:
        ws.append(export_row(o))
    out = io.BytesIO()
    wb.save(out)
    out.seek(0)
    return StreamingResponse(out, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f"attachment; filename=dealwills_orders_{stamp}.xlsx"})


@api.get("/admin/analytics")
async def analytics(_: dict = Depends(admin_only)):
    t = now()
    by_status = {s["_id"]: s["n"] async for s in db.orders.aggregate([{"$group": {"_id": "$status", "n": {"$sum": 1}}}])}
    paid = await db.orders.aggregate([{"$match": {"status": "paid"}},
                                      {"$group": {"_id": None, "rev": {"$sum": "$total"}, "units": {"$sum": "$qty"}}}]).to_list(1)
    daily = await db.orders.aggregate([
        {"$match": {"status": "paid", "paid_at": {"$gte": t - timedelta(days=30)}}},
        {"$group": {"_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$paid_at", "timezone": "Asia/Kolkata"}},
                    "revenue": {"$sum": "$total"}, "units": {"$sum": "$qty"}, "orders": {"$sum": 1}}},
        {"$sort": {"_id": 1}}]).to_list(40)
    monthly = await db.orders.aggregate([
        {"$match": {"status": "paid"}},
        {"$group": {"_id": {"$dateToString": {"format": "%Y-%m", "date": "$paid_at", "timezone": "Asia/Kolkata"}},
                    "revenue": {"$sum": "$total"}, "units": {"$sum": "$qty"}, "orders": {"$sum": 1}}},
        {"$sort": {"_id": 1}}]).to_list(24)
    by_product = {s["_id"]: s async for s in db.orders.aggregate([
        {"$match": {"status": "paid"}},
        {"$group": {"_id": "$product_id", "revenue": {"$sum": "$total"}, "units": {"$sum": "$qty"}, "orders": {"$sum": 1}}}])}
    products = await db.products.find({"status": {"$ne": "draft"}}, {"_id": 0}).to_list(500)
    pay_methods = await db.orders.aggregate([
        {"$match": {"status": "paid"}},
        {"$group": {"_id": "$payment_method", "n": {"$sum": 1}, "amount": {"$sum": "$total"}}}]).to_list(10)
    live = next((p for p in products if p["status"] in ("live", "paused")), None)
    fill = lambda rows: [{"date": r["_id"], "revenue": r["revenue"], "units": r["units"], "orders": r["orders"]} for r in rows]
    return {
        "customers": await db.users.count_documents({**IN_ENV, "role": "customer"}),
        "drop_alert_signups": await db.drop_alerts.count_documents({"active": True}),
        "total_orders": sum(by_status.values()),
        "successful_orders": by_status.get("paid", 0),
        "cancelled_orders": by_status.get("cancelled", 0) + by_status.get("expired", 0),
        "failed_orders": by_status.get("failed", 0),
        "pending_payments": by_status.get("pending", 0),
        "units_sold": paid[0]["units"] if paid else 0,
        "revenue": paid[0]["rev"] if paid else 0,
        "daily": fill(daily), "monthly": fill(monthly),
        "payment_methods": [{"method": p["_id"] or "unknown", "orders": p["n"], "amount": p["amount"]} for p in pay_methods],
        "live": public_product(live) if live else None,
        "products": [{"id": p["id"], "name": p["name"], "status": p["status"], "total_qty": p["total_qty"],
                      "sold": p["sold"], "reserved": p["reserved"], "remaining": p["total_qty"] - p["sold"],
                      "revenue": by_product.get(p["id"], {}).get("revenue", 0),
                      "orders": by_product.get(p["id"], {}).get("orders", 0)} for p in products],
    }


# ---------------- Contact ----------------
_bg_tasks: set = set()


class AlertIn(BaseModel):
    phone: str = Field(min_length=10, max_length=16)


@api.post("/alerts")
async def subscribe_alert(body: AlertIn, request: Request):
    digits = "".join(c for c in body.phone if c.isdigit())
    if len(digits) < 10:
        raise HTTPException(400, "Enter a valid 10-digit mobile number")
    phone = phone10(digits)
    origin = request.headers.get("origin") or ""
    try:
        await db.drop_alerts.insert_one({"id": new_id(), "phone": phone, "active": True, "origin": origin,
                                         "created_at": now()})
    except DuplicateKeyError:
        return {"ok": True, "already": True}
    return {"ok": True, "already": False}


async def has_early_access(member: dict, product_id: str) -> bool:
    phone = phone10(member.get("phone", ""))
    return bool(phone) and bool(await db.drop_alerts.find_one({"phone": phone, "early_product_id": product_id}))


@api.get("/deal/early-access")
async def early_access_status(member: dict = Depends(current_member)):
    p = await db.products.find_one({"status": "live"})
    if not p or not in_early_access(p):
        return {"active": False, "eligible": True}
    return {"active": True, "eligible": await has_early_access(member, p["id"]),
            "until": p["early_access_until"], "has_phone": bool(member.get("phone"))}


@api.get("/drops/past")
async def past_drops():
    items = await db.products.find({"status": {"$in": ["sold_out", "expired"]}, "drop_number": {"$gt": 0}},
                                   {"_id": 0}).sort("closed_at", -1).to_list(200)
    drops = [{k: d[k] for k in ("id", "name", "category", "images", "original_price", "slabs", "total_qty", "sold",
                                "display_status", "percent_sold", "drop_number", "activated_at", "closed_at",
                                "sold_in_seconds")} | {"best_price": min(s["price"] for s in d["slabs"]),
                                                       "discount_percent": round((1 - min(s["price"] for s in d["slabs"]) / d["original_price"]) * 100)}
             for d in map(public_product, items)]
    sellouts = [d["sold_in_seconds"] for d in drops if d["sold_in_seconds"]]
    saved = await db.orders.aggregate([
        {"$match": {"status": "paid", "product_id": {"$in": [d["id"] for d in drops]}}},
        {"$group": {"_id": None, "v": {"$sum": {"$subtract": [{"$multiply": ["$original_price", "$qty"]}, "$total"]}}}}]).to_list(1)
    return {"drops": drops, "stats": {
        "completed": len(drops), "sold_out": len(sellouts), "units_sold": sum(d["sold"] for d in drops),
        "fastest_seconds": min(sellouts) if sellouts else None,
        "customer_savings": round(saved[0]["v"]) if saved else 0}}


@api.post("/alerts/unsubscribe")
async def unsubscribe_alert(body: AlertIn):
    await db.drop_alerts.update_many({"phone": phone10(body.phone), "active": True},
                                     {"$set": {"active": False, "unsubscribed_at": now()}})
    return {"ok": True}


async def send_drop_alerts(product_id: str):
    p = await db.products.find_one({"id": product_id})
    if not p:
        return
    d = public_product(p)
    subs = await db.drop_alerts.find({"active": True}).to_list(20000)
    for sub in subs:
        link = f" Grab it: {sub['origin']}" if sub.get("origin") else ""
        early = (f" Your {EARLY_ACCESS_MINUTES}-min early access is ON - sign in with this mobile number."
                 if in_early_access(p) and sub.get("early_product_id") == product_id else "")
        msg = (f"Dealwills: New drop is LIVE! {d['name']} at Rs.{d['current_price']:,.0f} "
               f"({d['discount_percent']}% OFF). Only {d['total_qty']} units.{early}{link}")
        status = await run_in_threadpool(send_sms, sub["phone"], msg)
        await db.drop_alerts.update_one({"id": sub["id"]}, {"$set": {
            "notified_at": now(), "notified_product_id": product_id, "sms_status": status}})
    logger.info("Drop alerts for %s: %d subscribers", p["name"], len(subs))


# ---------------- GST invoices ----------------
async def invoice_settings() -> dict:
    doc = await db.settings.find_one({"key": "invoice"}, {"_id": 0, "key": 0}) or {}
    return {**DEFAULT_SETTINGS, **doc}


class InvoiceSettingsIn(BaseModel):
    legal_name: str = Field(min_length=2, max_length=120)
    brand: str = Field(default="Dealwills", max_length=60)
    gstin: str = Field(min_length=15, max_length=15)
    address: str = Field(default="", max_length=300)
    state: str = Field(min_length=2)
    phone: str = ""
    email: str = ""
    prefix: str = Field(default="DW", min_length=1, max_length=6)


@api.get("/admin/invoice-settings")
async def get_invoice_settings(_: dict = Depends(admin_only)):
    return await invoice_settings()


@api.put("/admin/invoice-settings")
async def put_invoice_settings(body: InvoiceSettingsIn, _: dict = Depends(admin_only)):
    d = body.model_dump()
    d["gstin"] = d["gstin"].upper()
    await db.settings.update_one({"key": "invoice"}, {"$set": {**d, "key": "invoice"}}, upsert=True)
    return d


async def ensure_invoice(o: dict) -> dict:
    """Creates the GST invoice for a paid order once; the number is sequential per financial year."""
    if o.get("invoice") or o.get("status") != "paid":
        return o
    seller = await invoice_settings()
    issued = o.get("paid_at") or now()
    fy = financial_year(issued)
    ctr = await db.counters.find_one_and_update({"key": f"invoice-{fy}"}, {"$inc": {"seq": 1}},
                                                upsert=True, return_document=ReturnDocument.AFTER)
    number = f"{seller['prefix']}/{fy}/{ctr['seq']:05d}"
    inv = build_invoice(o, seller, number, issued)
    res = await db.orders.find_one_and_update({"id": o["id"], "invoice": {"$exists": False}},
                                              {"$set": {"invoice": inv, "invoice_token": uuid.uuid4().hex}},
                                              projection={"_id": 0}, return_document=ReturnDocument.AFTER)
    return res or clean(await db.orders.find_one({"id": o["id"]}))


async def send_invoice_whatsapp(o: dict, request: Request = None) -> str:
    frontend_base = (os.environ.get("FRONTEND_URL") or o.get("site_origin") or "").strip().rstrip("/")
    backend_base = (backend_public_url(request) or o.get("backend_origin") or frontend_base).strip().rstrip("/")
    token = o.get("invoice_token")
    pdf = f"{backend_base}/api/invoices/{token}/pdf" if backend_base else ""
    page = f"{frontend_base}/invoice/{token}" if frontend_base else ""
    body = (f"Dealwills: Thank you for your order {o['order_number']}! Your GST invoice {o['invoice']['number']} "
            f"for Rs.{o['total']:,.2f} is attached." + (f" View online: {page}" if page else ""))
    status = await run_in_threadpool(send_whatsapp, o["phone"], body, pdf)
    await db.orders.update_one({"id": o["id"]}, {"$set": {"whatsapp_status": status, "whatsapp_sent_at": now()}})
    return status


@api.get("/invoices/{token}")
async def get_invoice(token: str):
    o = await db.orders.find_one({"invoice_token": token}, {"_id": 0, "invoice": 1})
    if not o:
        raise HTTPException(404, "Invoice not found")
    return o["invoice"]


@api.get("/invoices/{token}/pdf")
async def get_invoice_pdf(token: str):
    o = await db.orders.find_one({"invoice_token": token}, {"_id": 0, "invoice": 1})
    if not o:
        raise HTTPException(404, "Invoice not found")
    data = await run_in_threadpool(invoice_pdf, o["invoice"])
    name = o["invoice"]["number"].replace("/", "-")
    return Response(content=data, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="Invoice-{name}.pdf"'})


@api.post("/admin/orders/{oid}/invoice")
async def admin_send_invoice(oid: str, request: Request, _: dict = Depends(admin_only)):
    o = await db.orders.find_one({"id": oid, "status": "paid"}, {"_id": 0})
    if not o:
        raise HTTPException(400, "Invoices are only for paid orders")
    updates = {}
    if not o.get("site_origin") and request.headers.get("origin"):
        o["site_origin"] = request.headers.get("origin", "")
        updates["site_origin"] = o["site_origin"]
    if not o.get("backend_origin"):
        o["backend_origin"] = backend_public_url(request)
        updates["backend_origin"] = o["backend_origin"]
    if updates:
        await db.orders.update_one({"id": oid}, {"$set": updates})
    o = await ensure_invoice(o)
    status = await send_invoice_whatsapp(o, request)
    return {"invoice_token": o["invoice_token"], "number": o["invoice"]["number"], "whatsapp_status": status}


class ContactIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: str = Field(min_length=5, max_length=120)
    phone: str = ""
    message: str = Field(min_length=5, max_length=2000)


@api.post("/contact")
async def contact(body: ContactIn):
    await db.contact_messages.insert_one({**body.model_dump(), "id": new_id(), "created_at": now()})
    return {"ok": True}


@api.delete("/admin/messages/{mid}")
async def delete_message(mid: str, _: dict = Depends(admin_only)):
    if not (await db.contact_messages.delete_one({"id": mid})).deleted_count:
        raise HTTPException(404, "Not found")
    return {"ok": True}


@api.delete("/admin/orders/{oid}")
async def delete_order(oid: str, _: dict = Depends(admin_only)):
    """Explicit admin action: permanently removes one order and reverses its stock effect."""
    o = await db.orders.find_one_and_delete({"id": oid})
    if not o:
        raise HTTPException(404, "Not found")
    if o["status"] == "pending":
        await db.products.update_one({"id": o["product_id"], "reserved": {"$gte": o["qty"]}}, {"$inc": {"reserved": -o["qty"]}})
        if o.get("credit_used"):
            await db.users.update_one({"user_id": o["user_id"]}, {"$inc": {"referral_credit": o["credit_used"]}})
    elif o["status"] == "paid":
        await db.products.update_one({"id": o["product_id"], "sold": {"$gte": o["qty"]}}, {"$inc": {"sold": -o["qty"]}})
        if o.get("coupon_code"):
            await db.coupons.update_one({"code": o["coupon_code"], "used_count": {"$gt": 0}}, {"$inc": {"used_count": -1}})
    await notify_deal_change()
    return {"ok": True}


@api.delete("/admin/coupons/{cid}")
async def delete_coupon(cid: str, _: dict = Depends(admin_only)):
    if not (await db.coupons.delete_one({"id": cid})).deleted_count:
        raise HTTPException(404, "Not found")
    return {"ok": True}


def _delete_clerk_user(user_id: str):
    r = requests.delete(f"https://api.clerk.com/v1/users/{user_id}", timeout=10,
                        headers={"Authorization": f"Bearer {os.environ['CLERK_SECRET_KEY']}", "User-Agent": "dealwills-app"})
    if r.status_code not in (200, 404):
        r.raise_for_status()


@api.delete("/users/{user_id}")
async def delete_user(user_id: str, admin: dict = Depends(admin_only)):
    """Explicit admin action: permanently removes a customer's account (their orders stay as sales records)."""
    if user_id == admin["user_id"]:
        raise HTTPException(400, "You cannot delete your own account")
    target = await db.users.find_one({"user_id": user_id})
    if not target:
        raise HTTPException(404, "Not found")
    if effective_role(target.get("role")) == "admin":
        raise HTTPException(400, "Change this user's role to customer before deleting")
    await run_in_threadpool(_delete_clerk_user, user_id)
    await db.users.delete_one({"user_id": user_id})
    return {"ok": True}


@api.post("/admin/erase-all")
async def erase_all(admin: dict = Depends(admin_only)):
    """Explicit admin action: permanently wipes all store data. Admin accounts are kept."""
    customers = await db.users.find({"role": {"$ne": "admin"}}, {"user_id": 1}).to_list(100000)
    for c in customers:
        with suppress(Exception):
            await run_in_threadpool(_delete_clerk_user, c["user_id"])
    counts = {}
    for name in ("products", "orders", "coupons", "drop_alerts", "contact_messages", "files", "file_blobs"):
        counts[name] = (await db[name].delete_many({})).deleted_count
    counts["customers"] = (await db.users.delete_many({"role": {"$ne": "admin"}})).deleted_count
    await db.users.update_many({}, {"$set": {"referral_credit": 0, "referred_by": None, "referral_rewarded": False}})
    logger.warning("ERASE ALL by %s: %s", admin.get("email"), counts)
    await notify_deal_change()
    return {"ok": True, "deleted": counts}


@api.get("/admin/messages")
async def messages(_: dict = Depends(admin_only)):
    return await db.contact_messages.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.get("/share/deal-image")
async def share_deal_image(pid: str = ""):
    """CORS-enabled copy of a deal's main photo, so the browser can draw it on a canvas."""
    p = await db.products.find_one({"id": pid, "status": {"$ne": "draft"}}) if pid else \
        await db.products.find_one({"status": {"$in": ["live", "paused"]}})
    src = (p.get("images") or [""])[0] if p else ""
    if not src:
        raise HTTPException(404, "No image")
    if src.startswith("/api/files/"):
        data, ctype = await run_in_threadpool(storage.get_object, src[len("/api/files/"):])
    else:
        r = await run_in_threadpool(lambda: requests.get(src, timeout=20))
        if r.status_code != 200:
            raise HTTPException(502, "Image unavailable")
        data, ctype = r.content, r.headers.get("Content-Type", "image/jpeg")
    return Response(content=data, media_type=ctype, headers={"Cache-Control": "public, max-age=300"})


@api.get("/share/deal", response_class=HTMLResponse)
async def share_deal(request: Request, ref: str = ""):
    """Link-preview page (Open Graph) for WhatsApp; humans are redirected to the deal."""
    p = await db.products.find_one({"status": {"$in": ["live", "paused"]}}) or \
        await db.products.find_one({}, sort=[("closed_at", DESCENDING)])
    backend_origin = backend_public_url(request)
    frontend_origin = (os.environ.get("FRONTEND_URL") or "").strip().rstrip("/")
    ref_q = f"?ref={html.escape(re.sub(r'[^A-Za-z0-9]', '', ref))}" if ref else ""
    target = (frontend_origin + "/" + ref_q) if frontend_origin else ("/" + ref_q)
    title, desc, image = "Dealwills — Timely delivery always", "One product. One price. Limited opportunity.", ""
    if p:
        d = public_product(p)
        title = f"{d['name']} at ₹{d['current_price']:,.0f} ({d['discount_percent']}% OFF) — Dealwills"
        desc = f"Only {d['remaining']} of {d['total_qty']} units left at the special Dealwills price. Was ₹{d['original_price']:,.0f}."
        image = (d["images"] or [""])[0]
        if image.startswith("/") and backend_origin:
            image = backend_origin + image
    e = html.escape
    page = f"""<!doctype html><html><head><meta charset="utf-8"><title>{e(title)}</title>
<meta property="og:type" content="product"><meta property="og:site_name" content="Dealwills">
<meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(desc)}">
<meta property="og:image" content="{e(image)}"><meta property="og:url" content="{e(target)}">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0;url={e(target)}"></head>
<body><a href="{e(target)}">View today's Dealwills deal</a></body></html>"""
    return HTMLResponse(page, headers={"Cache-Control": "public, max-age=60"})


@api.get("/")
async def root():
    return {"app": "Dealwills", "ok": True}


# ---------------- Seed ----------------
UNSPLASH = "?crop=entropy&cs=srgb&fm=jpg&q=85&w=1400"
SEED = [
    {"name": "Acoustic One — Premium Wireless ANC Headphones", "category": "Premium Audio",
     "description": "Studio-tuned 40mm drivers, adaptive active noise cancellation and 40-hour battery life in a "
                    "featherlight matte finish. Built for long flights, deep work and late-night listening.",
     "images": ["https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb" + UNSPLASH,
                "https://images.unsplash.com/photo-1641048930621-ab5d225ae5b0" + UNSPLASH,
                "https://images.pexels.com/photos/9371408/pexels-photo-9371408.jpeg?auto=compress&cs=tinysrgb&w=1200"],
     "specs": [{"label": "Driver", "value": "40mm dynamic"}, {"label": "Battery", "value": "40 hours (ANC on)"},
               {"label": "Charging", "value": "USB-C fast charge, 10 min = 5 hrs"},
               {"label": "Connectivity", "value": "Bluetooth 5.3, multipoint"}, {"label": "Weight", "value": "248 g"},
               {"label": "Warranty", "value": "1 year"}],
     "original_price": 5000, "slabs": [{"qty": 100, "price": 2999}], "min_qty": 1, "max_qty": 2, "status": "live"},
    {"name": "Chrono-X Smart Watch", "category": "Wearables",
     "description": "AMOLED always-on display, heart-rate and SpO2 tracking, 14-day battery and a sapphire-coated lens.",
     "images": ["https://images.pexels.com/photos/12915491/pexels-photo-12915491.jpeg?auto=compress&cs=tinysrgb&w=1200"],
     "specs": [{"label": "Display", "value": "1.43\" AMOLED"}, {"label": "Battery", "value": "14 days"},
               {"label": "Water resistance", "value": "5 ATM"}],
     "original_price": 8000, "slabs": [{"qty": 100, "price": 3999}, {"qty": 150, "price": 4499}],
     "min_qty": 1, "max_qty": 3, "status": "queued"},
    {"name": "Titan EDC Minimalist Set", "category": "Everyday Carry",
     "description": "Titanium pen, slim card wallet and keyring — machined to last a lifetime.",
     "images": ["https://images.unsplash.com/photo-1504610926078-a1611febcad3" + UNSPLASH],
     "specs": [{"label": "Material", "value": "Grade 5 titanium"}],
     "original_price": 3500, "slabs": [{"qty": 75, "price": 1799}], "min_qty": 1, "max_qty": 2, "status": "queued"},
]


async def seed():
    if await db.settings.find_one({"key": "seeded"}):
        return
    await db.settings.update_one({"key": "seeded"}, {"$set": {"key": "seeded", "at": now()}}, upsert=True)
    if await db.products.count_documents({}) == 0:
        for i, s in enumerate(SEED):
            d = {**s, "id": new_id(), "total_qty": total_qty(s["slabs"]), "sold": 0, "reserved": 0,
                 "queue_position": i + 1, "start_at": None, "end_at": None, "created_at": now(),
                 "drop_number": 1 if s["status"] == "live" else 0,
                 "activated_at": now() if s["status"] == "live" else None}
            if i == 1:
                d["start_at"] = now() + timedelta(hours=6)
            await db.products.insert_one(d)
    if await db.coupons.count_documents({}) == 0:
        await db.coupons.insert_one({"id": new_id(), "code": "WELCOME10", "kind": "percent", "value": 10,
                                     "max_uses": 500, "used_count": 0, "min_order": 0, "expires_at": None,
                                     "active": True, "created_at": now()})


app.include_router(api)
app.include_router(clerk_router)

_cors_origins = [o.strip().rstrip("/") for o in os.environ.get("CORS_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_cors_origins or ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await ensure_indexes()
    await seed()
    for old, new in RETIRED_ROLES.items():
        await db.users.update_many({"role": old}, {"$set": {"role": new}})
    app.state.sweeper = asyncio.create_task(sweeper())
    with suppress(Exception):
        await run_in_threadpool(storage.init_storage)


@app.on_event("shutdown")
async def shutdown():
    app.state.sweeper.cancel()
    with suppress(asyncio.CancelledError):
        await app.state.sweeper
    client.close()
