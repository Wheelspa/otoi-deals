# OTOI Early Access (subscriber 5-min head start) + Drop Hall of Fame (/api/drops/past) tests.
# NOTE: disrupts the live seed deal; restore afterwards with tests/restore_after_early_access.py
import json
import os
import subprocess
import sys
import tempfile
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv
from pymongo import MongoClient

from conftest import API
from test_otoi_core import checkout_body

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
DB = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
STATE = {"products": [], "alert_phones": []}
TOK = str(Path(tempfile.gettempdir()) / "ea_toks.json")
EA_USERS = ["ea1", "ea2", "ea3", "admin"]
SUB_PHONE = "9000000201"   # ea1 subscribes; profile phone stored with +91 prefix
NONSUB_PHONE = "9000000202"  # ea2 profile phone, not subscribed
SUB2_PHONE = "9000000203"  # subscribes later for the auto-advance drop


@pytest.fixture(scope="module")
def S():
    if not os.path.exists(TOK) or time.time() - os.path.getmtime(TOK) > 3000:
        out = subprocess.check_output([sys.executable, str(Path(__file__).resolve().parent / "clerk_tokens.py"),
                                       *[f"{e}+clerk_test@otoi.in" for e in EA_USERS]])
        open(TOK, "w").write(out.decode())
    data = json.load(open(TOK))
    out = {}
    for k, v in data.items():
        s = requests.Session()
        s.headers["Authorization"] = f"Bearer {v['token']}"
        s.get(f"{API}/me")
        out[k.split("+")[0]] = s
    return out


def prod(name, qty, max_qty=2):
    return {"name": f"TEST_EA_{name}_{uuid.uuid4().hex[:4]}", "category": "TEST", "description": "TEST product",
            "images": [], "specs": [{"label": "k", "value": "v"}], "original_price": 200,
            "slabs": [{"qty": qty, "price": 100}], "min_qty": 1, "max_qty": max_qty}


def create(S, name, qty, max_qty=2):
    r = S["admin"].post(f"{API}/admin/products", json=prod(name, qty, max_qty))
    assert r.status_code == 200, r.text
    STATE["products"].append(r.json()["id"])
    return r.json()["id"]


def act(S, pid, a):
    return S["admin"].post(f"{API}/admin/products/{pid}/action", json={"action": a})


def deal():
    return requests.get(f"{API}/deal/current").json()["deal"]


def buy_paid(s, pid, qty=1, phone="9000000201"):
    r = s.post(f"{API}/orders/reserve", json={"product_id": pid, "qty": qty})
    assert r.status_code == 200, r.text
    oid = r.json()["id"]
    assert s.post(f"{API}/orders/{oid}/checkout", json=checkout_body(phone=phone)).status_code == 200
    r = s.post(f"{API}/payments/simulate/{oid}", json={"outcome": "success"})
    assert r.status_code == 200, r.text
    return oid


class TestEarlyAccessAndHall:
    def test_00_setup_profiles(self, S):
        assert DB.drop_alerts.count_documents({"active": True}) == 0, "precondition: no active subscribers"
        assert S["ea1"].put(f"{API}/me", json={"name": "TEST_EA1", "phone": "+91 " + SUB_PHONE}).status_code == 200
        assert S["ea2"].put(f"{API}/me", json={"name": "TEST_EA2", "phone": NONSUB_PHONE}).status_code == 200
        # ea3 = signed-in user with no phone (PUT /me rejects empty phone with 422, so reset in DB)
        DB.users.update_one({"email": "ea3+clerk_test@otoi.in"}, {"$set": {"phone": ""}})
        assert S["ea3"].get(f"{API}/me").json().get("phone", "") == ""

    def test_01_no_subscribers_no_early_window(self, S):
        pid = create(S, "NOSUB", 3)
        STATE["nosub"] = pid
        r = act(S, pid, "activate_now")
        assert r.status_code == 200 and r.json()["status"] == "live", r.text
        assert r.json().get("early_access_until") is None
        d = deal()
        assert d["id"] == pid and d["display_status"] == "LIVE_DEAL" and d["early_access_until"] is None
        ea = S["ea2"].get(f"{API}/deal/early-access").json()
        assert ea["active"] is False and ea["eligible"] is True
        # non-subscriber can reserve; then cancel
        r = S["ea2"].post(f"{API}/orders/reserve", json={"product_id": pid, "qty": 1})
        assert r.status_code == 200, r.text
        S["ea2"].post(f"{API}/orders/{r.json()['id']}/cancel")

    def test_02_subscribe(self):
        r = requests.post(f"{API}/alerts", json={"phone": "+91-" + SUB_PHONE})
        assert r.status_code == 200 and r.json() == {"ok": True, "already": False}, r.text
        STATE["alert_phones"].append(SUB_PHONE)
        r = requests.post(f"{API}/alerts", json={"phone": SUB_PHONE})
        assert r.json()["already"] is True
        assert requests.post(f"{API}/alerts", json={"phone": "12345"}).status_code in (400, 422)
        assert DB.drop_alerts.find_one({"phone": SUB_PHONE, "active": True})

    def test_03_admin_activate_starts_early_window(self, S):
        pid = create(S, "EARLY", 3)
        STATE["early"] = pid
        r = act(S, pid, "activate_now")
        assert r.status_code == 200 and r.json()["status"] == "live", r.text
        p = DB.products.find_one({"id": pid})
        assert p["early_access_until"] is not None
        delta = (p["early_access_until"] - p["activated_at"]).total_seconds()
        assert abs(delta - 300) < 2, delta
        d = deal()
        assert d["id"] == pid and d["display_status"] == "EARLY_ACCESS" and d["early_access_until"]
        a = DB.drop_alerts.find_one({"phone": SUB_PHONE})
        assert a["early_product_id"] == pid
        # nosub product (stopped) must appear in hall of fame
        past = requests.get(f"{API}/drops/past").json()
        assert any(x["id"] == STATE["nosub"] and x["display_status"] == "OFFER_EXPIRED" for x in past["drops"])

    def test_04_sms_mentions_early_access(self):
        time.sleep(2)
        a = DB.drop_alerts.find_one({"phone": SUB_PHONE, "notified_product_id": STATE["early"]})
        assert a and a["sms_status"] == "mocked" and a["active"] is False
        log = subprocess.run(f"grep 'SMS MOCKED' /var/log/supervisor/backend.err.log | grep {SUB_PHONE} | tail -1",
                             shell=True, capture_output=True, text=True).stdout
        assert "early access is ON" in log, log

    def test_05_early_access_status_endpoint(self, S):
        e1 = S["ea1"].get(f"{API}/deal/early-access").json()
        e2 = S["ea2"].get(f"{API}/deal/early-access").json()
        e3 = S["ea3"].get(f"{API}/deal/early-access").json()
        assert e1["active"] and e1["eligible"] is True and e1["has_phone"] is True and e1["until"]
        assert e2["active"] and e2["eligible"] is False and e2["has_phone"] is True
        assert e3["active"] and e3["eligible"] is False and e3["has_phone"] is False
        assert requests.get(f"{API}/deal/early-access").status_code in (401, 403)

    def test_06_reserve_gate(self, S):
        pid = STATE["early"]
        assert S["ea2"].post(f"{API}/orders/reserve", json={"product_id": pid, "qty": 1}).status_code == 403
        assert S["ea3"].post(f"{API}/orders/reserve", json={"product_id": pid, "qty": 1}).status_code == 403
        STATE["ea1_order"] = buy_paid(S["ea1"], pid, 1)
        p = DB.products.find_one({"id": pid})
        assert p["sold"] == 1

    def test_07_window_passes_everyone_can_buy(self, S):
        pid = STATE["early"]
        DB.products.update_one({"id": pid}, {"$set": {"early_access_until": datetime.utcnow() - timedelta(seconds=5)}})
        d = deal()
        assert d["display_status"] in ("LIVE_DEAL", "LIMITED_STOCK", "ALMOST_SOLD_OUT") and d["early_access_until"] is None
        assert S["ea2"].get(f"{API}/deal/early-access").json()["active"] is False
        # queue an auto-advance candidate ahead of seeds, and a new subscriber
        nxt = create(S, "AUTO", 5)
        STATE["auto"] = nxt
        assert act(S, nxt, "make_next").status_code == 200
        assert requests.post(f"{API}/alerts", json={"phone": SUB2_PHONE}).json()["already"] is False
        STATE["alert_phones"].append(SUB2_PHONE)
        # ea1 can re-subscribe after being notified (partial unique index)
        r = requests.post(f"{API}/alerts", json={"phone": SUB_PHONE})
        assert r.status_code == 200 and r.json()["already"] is False, r.text
        buy_paid(S["ea2"], pid, 2, phone=NONSUB_PHONE)  # sells out (1 + 2 = 3)

    def test_08_sold_out_auto_advance_starts_early(self, S):
        time.sleep(1)
        p = DB.products.find_one({"id": STATE["early"]})
        assert p["status"] == "sold_out"
        d = deal()
        assert d["id"] == STATE["auto"], d["name"]
        assert d["display_status"] == "EARLY_ACCESS"
        a = DB.drop_alerts.find_one({"phone": SUB2_PHONE})
        assert a["early_product_id"] == STATE["auto"]
        assert S["ea1"].get(f"{API}/deal/early-access").json()["eligible"] is True  # re-subscribed
        assert S["ea2"].post(f"{API}/orders/reserve", json={"product_id": STATE["auto"], "qty": 1}).status_code == 403

    def test_09_hall_of_fame(self):
        r = requests.get(f"{API}/drops/past")
        assert r.status_code == 200
        data = r.json()
        e = next(x for x in data["drops"] if x["id"] == STATE["early"])
        assert e["display_status"] == "SOLD_OUT" and isinstance(e["sold_in_seconds"], int) and e["sold_in_seconds"] >= 0
        assert e["best_price"] == 100 and e["discount_percent"] == 50 and e["sold"] == 3 and e["drop_number"] > 0
        st = data["stats"]
        assert st["completed"] == len(data["drops"]) and st["sold_out"] >= 1
        assert st["fastest_seconds"] is not None and st["fastest_seconds"] <= e["sold_in_seconds"]
        assert st["units_sold"] == sum(x["sold"] for x in data["drops"])
        assert st["customer_savings"] >= 300  # 3 units * (200-100)
        assert all(x["drop_number"] > 0 for x in data["drops"])
        assert not any(x["id"] == STATE["auto"] for x in data["drops"])  # live one excluded
        print("HALL", json.dumps(st))
