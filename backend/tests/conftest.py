import json
import os
import subprocess

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split()[0]
BASE_URL = BASE_URL.rstrip("/")
API = BASE_URL + "/api"
TOK_FILE = "/tmp/toks.json"
EMAILS = ["admin", "buyer", "t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8"]


@pytest.fixture(scope="session")
def tokens():
    if not os.path.exists(TOK_FILE):
        out = subprocess.check_output(["python", "/app/backend/tests/clerk_tokens.py",
                                       *[f"{e}+clerk_test@otoi.in" for e in EMAILS]])
        open(TOK_FILE, "w").write(out.decode())
    data = json.load(open(TOK_FILE))
    return {k.split("+")[0]: v["token"] for k, v in data.items()}


def client(token=None):
    s = requests.Session()
    if token:
        s.headers["Authorization"] = f"Bearer {token}"
    return s


@pytest.fixture(scope="session")
def admin(tokens):
    return client(tokens["admin"])


@pytest.fixture(scope="session")
def users(tokens):
    out = {k: client(v) for k, v in tokens.items()}
    for s in out.values():
        s.get(f"{API}/me")  # ensures db record
    return out
