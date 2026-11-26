import os, json, urllib.request, sys
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[1] / ".env")
SK = os.environ["CLERK_SECRET_KEY"]


def bapi(path, body=None, method="POST"):
    req = urllib.request.Request("https://api.clerk.com/v1" + path, data=json.dumps(body).encode() if body is not None else None,
                                 method=method, headers={"Authorization": "Bearer " + SK, "Content-Type": "application/json",
                                                         "User-Agent": "emergent-test"})
    return json.load(urllib.request.urlopen(req))


def get_user(email):
    users = bapi(f"/users?email_address={urllib.parse.quote(email)}", method="GET")
    if users:
        return users[0]
    return bapi("/users", {"email_address": [email], "password": "Test-pass-12345!", "skip_password_checks": True})


import urllib.parse
out = {}
for email in sys.argv[1:]:
    u = get_user(email)
    s = bapi("/sessions", {"user_id": u["id"]})
    tok = bapi(f"/sessions/{s['id']}/tokens", {"expires_in_seconds": 3600})["jwt"]
    ticket = bapi("/sign_in_tokens", {"user_id": u["id"], "expires_in_seconds": 3600})["token"]
    out[email] = {"user_id": u["id"], "token": tok, "ticket": ticket}
print(json.dumps(out))
