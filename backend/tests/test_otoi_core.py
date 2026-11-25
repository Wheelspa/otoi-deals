# OTOI backend regression tests: auth/roles, deal, reserve/checkout/pay, coupons, webhook, referral, admin
import hashlib
import hmac
import json
import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import requests
from dotenv import load_dotenv

from conftest import API

load_dotenv("/app/backend/.env")
SECRET = os.environ["PAYMENT_WEBHOOK_SECRET"]
ADDR = {"line1": "TEST 12 Street", "line2": "", "city": "Pune", "state": "MH", "pincode": "411001"}


def checkout_body(**kw):
    b = {"customer_name": "TEST_Buyer", "phone": "9000000001", "address": ADDR, "payment_method": "upi"}
    b.update(kw)
    return b


def deal():
    return requests.get(f"{API}/deal/current").json()["deal"]


def reserve(s, pid, qty=1, **kw):
    return s.post(f"{API}/orders/reserve", json={"product_id": pid, "qty": qty, **kw})


def buy(s, pid, qty=1, coupon=None, phone="9000000001"):
    r = reserve(s, pid, qty)
    assert r.status_code == 200, r.text
    o = r.json()
    c = s.post(f"{API}/orders/{o['id']}/checkout", json=checkout_body(coupon_code=coupon, phone=phone))
    assert c.status_code == 200, c.text
    p = s.post(f"{API}/payments/simulate/{o['id']}", json={"outcome": "success"})
    return o, c.json(), p


# ---- Auth & roles
class TestAuth:
    def test_no_token_401(self):
        for path in ["/me", "/admin/products", "/admin/analytics", "/orders/mine"]:
            assert requests.get(API + path).status_code == 401, path

    def test_customer_403_admin(self, users):
        for path in ["/admin/products", "/admin/orders", "/admin/analytics", "/admin/coupons", "/users", "/admin/messages"]:
            assert users["buyer"].get(API + path).status_code == 403, path

    def test_me(self, users, admin):
        me = users["t1"].get(f"{API}/me").json()
        assert me["role"] == "customer" and me["referral_code"].startswith("OT")
        assert admin.get(f"{API}/me").json()["role"] == "admin"


# ---- Deal
class TestDeal:
    def test_current_deal_shape(self):
        d = requests.get(f"{API}/deal/current").json()
        p = d["deal"]
        for k in ["name", "current_price", "original_price", "discount_percent", "percent_sold", "sold", "remaining",
                  "available", "display_status", "total_qty"]:
            assert k in p
        assert p["status"] == "live"
        assert p["current_price"] < p["original_price"]


# ---- Purchase flow on live deal
class TestPurchase:
    def test_paid_order_with_coupon_increments_sold(self, users):
        p0 = deal()
        o, co, pay = buy(users["t1"], p0["id"], 1, coupon="WELCOME10")
        assert pay.status_code == 200, pay.text
        assert co["coupon_discount"] == round(o["subtotal"] * 0.1, 2)
        assert co["total"] == round(o["subtotal"] - co["coupon_discount"], 2)
        assert pay.json()["status"] == "paid"
        p1 = deal()
        assert p1["sold"] == p0["sold"] + 1
        full = users["t1"].get(f"{API}/orders/{o['id']}").json()
        assert full["sms_status"] == "mocked"
        # track
        t = requests.post(f"{API}/track", json={"order_number": o["order_number"], "phone": "+91 90000 00001"})
        assert t.status_code == 200 and t.json()["status"] == "paid"
        assert requests.post(f"{API}/track", json={"order_number": o["order_number"], "phone": "9999999999"}).status_code == 404
        mine = users["t1"].get(f"{API}/orders/mine").json()
        assert any(x["id"] == o["id"] for x in mine)
        # double pay rejected
        assert users["t1"].post(f"{API}/payments/simulate/{o['id']}", json={"outcome": "success"}).status_code == 409

    def test_failure_releases(self, users):
        p0 = deal()
        o = reserve(users["t2"], p0["id"], 1).json()
        assert deal()["reserved"] == p0["reserved"] + 1
        users["t2"].post(f"{API}/orders/{o['id']}/checkout", json=checkout_body())
        r = users["t2"].post(f"{API}/payments/simulate/{o['id']}", json={"outcome": "failure"})
        assert r.status_code == 200 and r.json()["status"] == "failed"
        assert deal()["reserved"] == p0["reserved"]

    def test_cancel_releases(self, users):
        p0 = deal()
        o = reserve(users["t2"], p0["id"], 2).json()
        assert deal()["reserved"] == p0["reserved"] + 2
        assert users["t2"].post(f"{API}/orders/{o['id']}/cancel").status_code == 200
        assert deal()["reserved"] == p0["reserved"]
        assert users["t2"].post(f"{API}/orders/{o['id']}/cancel").status_code == 409

    def test_pay_without_details_400(self, users):
        o = reserve(users["t2"], deal()["id"], 1).json()
        assert users["t2"].post(f"{API}/payments/simulate/{o['id']}", json={"outcome": "success"}).status_code == 400
        users["t2"].post(f"{API}/orders/{o['id']}/cancel")

    def test_max_qty(self, users):
        p = deal()
        assert reserve(users["t3"], p["id"], p["max_qty"] + 1).status_code == 400
        assert reserve(users["t3"], p["id"], 0).status_code == 422
        # buyer already bought max
        r = reserve(users["buyer"], p["id"], 1)
        assert r.status_code == 400 and "Limit" in r.json()["detail"]

    def test_other_users_order_404(self, users):
        o = reserve(users["t3"], deal()["id"], 1).json()
        assert users["t2"].get(f"{API}/orders/{o['id']}").status_code == 404
        assert users["t2"].post(f"{API}/orders/{o['id']}/cancel").status_code == 404
        users["t3"].post(f"{API}/orders/{o['id']}/cancel")


# ---- Coupons
class TestCoupons:
    def test_coupon_rules(self, admin, users):
        code = "TEST" + uuid.uuid4().hex[:6].upper()
        r = admin.post(f"{API}/admin/coupons", json={"code": code, "kind": "flat", "value": 50, "max_uses": 1})
        assert r.status_code == 200
        cid = r.json()["id"]
        assert admin.post(f"{API}/admin/coupons", json={"code": code, "value": 5}).status_code == 409
        assert admin.post(f"{API}/admin/coupons", json={"code": code + "X", "value": 95}).status_code == 400
        exp = "TESTE" + uuid.uuid4().hex[:5].upper()
        admin.post(f"{API}/admin/coupons", json={"code": exp, "value": 5,
                                                  "expires_at": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()})
        s = users["t3"]
        o = reserve(s, deal()["id"], 1).json()
        v = s.post(f"{API}/coupons/validate", json={"code": code.lower(), "order_id": o["id"]})
        assert v.status_code == 200 and v.json()["discount"] == 50
        assert s.post(f"{API}/coupons/validate", json={"code": "NOPE123", "order_id": o["id"]}).status_code == 400
        e = s.post(f"{API}/coupons/validate", json={"code": exp, "order_id": o["id"]})
        assert e.status_code == 400 and "expired" in e.json()["detail"]
        # use once -> limit reached
        s.post(f"{API}/orders/{o['id']}/checkout", json=checkout_body(coupon_code=code))
        assert s.post(f"{API}/payments/simulate/{o['id']}", json={"outcome": "success"}).status_code == 200
        o2 = reserve(users["t6"], deal()["id"], 1).json()
        lim = users["t6"].post(f"{API}/coupons/validate", json={"code": code, "order_id": o2["id"]})
        assert lim.status_code == 400 and "limit" in lim.json()["detail"]
        # toggle inactive
        assert admin.patch(f"{API}/admin/coupons/{cid}", json={"active": False}).status_code == 200
        lst = admin.get(f"{API}/admin/coupons").json()
        assert next(c for c in lst if c["id"] == cid)["active"] is False
        users["t6"].post(f"{API}/orders/{o2['id']}/cancel")


# ---- Webhook
class TestWebhook:
    def test_bad_signature(self):
        r = requests.post(f"{API}/payments/webhook", data=b'{"event":"payment.captured","order_id":"x"}',
                          headers={"X-OTOI-Signature": "deadbeef"})
        assert r.status_code == 401

    def test_valid_signature_failed_event(self, users):
        o = reserve(users["t7"], deal()["id"], 1).json()
        raw = json.dumps({"event": "payment.failed", "order_id": o["id"]}).encode()
        r = requests.post(f"{API}/payments/webhook", data=raw,
                          headers={"X-OTOI-Signature": hmac.new(SECRET.encode(), raw, hashlib.sha256).hexdigest()})
        assert r.status_code == 200 and r.json()["status"] == "failed"


# ---- Referral
class TestReferral:
    def test_referral_credit(self, users):
        code = users["t4"].get(f"{API}/me").json()["referral_code"]
        before = users["t4"].get(f"{API}/me").json()["referral_credit"]
        s = users["t5"]
        r = reserve(s, deal()["id"], 1, ref_code=code)
        assert r.status_code == 200
        o = r.json()
        s.post(f"{API}/orders/{o['id']}/checkout", json=checkout_body())
        assert s.post(f"{API}/payments/simulate/{o['id']}", json={"outcome": "success"}).status_code == 200
        me = users["t4"].get(f"{API}/me").json()
        assert me["referral_credit"] == before + 100
        assert me["referrals_count"] >= 1


# ---- Admin
class TestAdmin:
    def test_analytics(self, admin):
        a = admin.get(f"{API}/admin/analytics").json()
        for k in ["customers", "total_orders", "successful_orders", "units_sold", "revenue", "daily", "products"]:
            assert k in a
        assert a["successful_orders"] >= 1 and a["revenue"] > 0

    def test_orders_filters_and_fulfil(self, admin):
        paid = admin.get(f"{API}/admin/orders", params={"status": "paid"}).json()
        assert paid and all(o["status"] == "paid" for o in paid)
        q = admin.get(f"{API}/admin/orders", params={"q": paid[0]["order_number"]}).json()
        assert len(q) == 1
        assert admin.patch(f"{API}/admin/orders/{paid[0]['id']}", json={"fulfillment": paid[0]["fulfillment"]}).status_code == 200
        failed = admin.get(f"{API}/admin/orders", params={"status": "failed"}).json()
        if failed:
            assert admin.patch(f"{API}/admin/orders/{failed[0]['id']}", json={"fulfillment": "packed"}).status_code == 400

    def test_orders_search_special_chars(self, admin):
        # unescaped regex -> should not 500
        r = admin.get(f"{API}/admin/orders", params={"q": "("})
        assert r.status_code != 500, "admin orders search crashes on regex special chars"

    def test_exports(self, admin):
        c = admin.get(f"{API}/admin/orders/export", params={"fmt": "csv"})
        assert c.status_code == 200 and c.text.startswith("order_number")
        assert "attachment" in c.headers["content-disposition"]
        x = admin.get(f"{API}/admin/orders/export", params={"fmt": "xlsx"})
        assert x.status_code == 200 and x.content[:2] == b"PK"

    def test_users_list(self, admin):
        r = admin.get(f"{API}/users").json()
        assert "admin" in r["roles"] and len(r["users"]) >= 2

    def test_contact(self, admin):
        assert requests.post(f"{API}/contact", json={"name": "TEST_c", "email": "t@example.com",
                                                     "message": "TEST message"}).status_code == 200
        assert any(m["name"] == "TEST_c" for m in admin.get(f"{API}/admin/messages").json())
