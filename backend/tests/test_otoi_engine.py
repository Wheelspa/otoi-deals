# OTOI deal-engine tests: activation, queue actions, concurrency/no-oversell, sold-out auto-advance, pause, expiry, stop
# NOTE: disrupts the live seed deal; restore with /app/backend/tests/restore_seed_state.py afterwards.
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import requests

from conftest import API
from test_otoi_core import checkout_body, reserve

STATE = {}


def prod(name, qty, max_qty=1):
    return {"name": f"TEST_{name}_{uuid.uuid4().hex[:4]}", "category": "TEST", "description": "TEST product",
            "images": [], "specs": [{"label": "k", "value": "v"}], "original_price": 200,
            "slabs": [{"qty": qty, "price": 100}], "min_qty": 1, "max_qty": max_qty}


def lives(admin):
    return [p for p in admin.get(f"{API}/admin/products").json() if p["status"] == "live"]


def act(admin, pid, a):
    return admin.post(f"{API}/admin/products/{pid}/action", json={"action": a})


class TestEngine:
    def test_01_same_user_parallel_reserve(self, users):
        """Probe: same user firing parallel reserves should get ONE pending order (per-customer cap)."""
        d = requests.get(f"{API}/deal/current").json()["deal"]
        s = users["t8"]
        with ThreadPoolExecutor(6) as ex:
            res = list(ex.map(lambda _: reserve(s, d["id"], d["max_qty"]), range(6)))
        ids = {r.json()["id"] for r in res if r.status_code == 200}
        for oid in ids:
            s.post(f"{API}/orders/{oid}/cancel")
        STATE["dup_pending"] = len(ids)
        assert len(ids) == 1, f"same user got {len(ids)} pending reservations in parallel -> max_qty bypass"

    def test_02_create_and_activate(self, admin):
        ids = []
        for name, q in [("A", 3), ("B", 5), ("C", 5)]:
            r = admin.post(f"{API}/admin/products", json=prod(name, q))
            assert r.status_code == 200 and r.json()["status"] == "draft"
            ids.append(r.json()["id"])
        STATE["A"], STATE["B"], STATE["C"] = ids
        r = act(admin, STATE["A"], "activate_now")
        assert r.status_code == 200 and r.json()["status"] == "live", r.text
        L = lives(admin)
        assert len(L) == 1 and L[0]["id"] == STATE["A"]
        assert requests.get(f"{API}/deal/current").json()["deal"]["id"] == STATE["A"]

    def test_03_queue_actions(self, admin):
        assert act(admin, STATE["C"], "queue").json()["status"] == "queued"
        assert act(admin, STATE["B"], "make_next").json()["status"] == "queued"
        nxt = requests.get(f"{API}/deal/current").json()["next"]
        assert nxt["name"].startswith("TEST_B")
        pos0 = act(admin, STATE["C"], "move_up").json()["queue_position"]
        pos1 = act(admin, STATE["C"], "move_down").json()["queue_position"]
        assert pos1 > pos0
        assert act(admin, STATE["A"], "resume").status_code == 400

    def test_04_parallel_reserve_no_oversell(self, users, admin):
        names = ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "buyer"]
        with ThreadPoolExecutor(8) as ex:
            res = list(ex.map(lambda n: (n, reserve(users[n], STATE["A"], 1)), names))
        ok = [(n, r.json()) for n, r in res if r.status_code == 200]
        STATE["A_orders"] = ok
        p = next(x for x in admin.get(f"{API}/admin/products").json() if x["id"] == STATE["A"])
        assert len(ok) == 3 and p["sold"] + p["reserved"] <= 3, (len(ok), p["sold"], p["reserved"])
        assert all(r.status_code in (200, 409) for _, r in res)

    def test_05_edit_cannot_reduce_below_reserved(self, admin):
        body = prod("A", 2)
        r = admin.put(f"{API}/admin/products/{STATE['A']}", json=body)
        assert r.status_code == 400

    def test_06_sold_out_auto_advance(self, users, admin):
        for n, o in STATE["A_orders"]:
            users[n].post(f"{API}/orders/{o['id']}/checkout", json=checkout_body())
            assert users[n].post(f"{API}/payments/simulate/{o['id']}", json={"outcome": "success"}).status_code == 200
        allp = {p["id"]: p for p in admin.get(f"{API}/admin/products").json()}
        assert allp[STATE["A"]]["status"] == "sold_out"
        assert allp[STATE["B"]]["status"] == "live"
        assert len(lives(admin)) == 1
        d = requests.get(f"{API}/deal/current").json()["deal"]
        assert d["id"] == STATE["B"] and d["display_status"] == "LIVE_DEAL"

    def test_07_pause_resume(self, users, admin):
        assert act(admin, STATE["B"], "pause").json()["status"] == "paused"
        d = requests.get(f"{API}/deal/current").json()["deal"]
        assert d["display_status"] == "PAUSED"
        assert reserve(users["t1"], STATE["B"], 1).status_code == 409
        assert act(admin, STATE["B"], "resume").json()["status"] == "live"

    def test_08_expiry_advances(self, admin):
        act(admin, STATE["C"], "make_next")
        body = prod("B", 5)
        body["end_at"] = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
        r = admin.put(f"{API}/admin/products/{STATE['B']}", json=body)
        assert r.status_code == 200, r.text
        allp = {p["id"]: p for p in admin.get(f"{API}/admin/products").json()}
        assert allp[STATE["B"]]["status"] == "expired"
        assert allp[STATE["C"]]["status"] == "live"
        assert len(lives(admin)) == 1

    def test_09_pay_after_stop_probe(self, users, admin):
        """Probe: reservation made before admin STOP should not be payable / increase sold on a stopped deal."""
        s = users["t2"]
        o = reserve(s, STATE["C"], 1).json()
        s.post(f"{API}/orders/{o['id']}/checkout", json=checkout_body())
        assert act(admin, STATE["C"], "stop").json()["status"] == "stopped"
        pay = s.post(f"{API}/payments/simulate/{o['id']}", json={"outcome": "success"})
        STATE["pay_after_stop"] = pay.status_code
        assert pay.status_code != 200, "order paid on a stopped deal"
