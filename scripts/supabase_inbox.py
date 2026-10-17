"""Manage the Supabase Storage "inbox" bucket for the daily legal-principles task.

Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment (service role key: keep it secret,
never commit it).

Usage:
  python scripts/supabase_inbox.py list               # print the PDF names waiting in the inbox
  python scripts/supabase_inbox.py download DIR       # download every inbox PDF into DIR
  python scripts/supabase_inbox.py remove NAME        # delete a processed PDF
  python scripts/supabase_inbox.py fail NAME          # move an unreadable PDF to failed/NAME
"""
import json, os, sys, urllib.parse, urllib.request
from pathlib import Path

URL = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
BUCKET = "inbox"


def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{URL}/storage/v1/{path}", data=data, method=method, headers={
        "Authorization": f"Bearer {KEY}", "apikey": KEY, "Content-Type": "application/json"})
    with urllib.request.urlopen(req) as res:
        return res.read()


def names():
    files = json.loads(call("POST", f"object/list/{BUCKET}", {"prefix": "", "limit": 1000}))
    return [f["name"] for f in files if f["name"].lower().endswith(".pdf")]


def main():
    cmd, args = (sys.argv[1:2] or ["list"])[0], sys.argv[2:]
    if cmd == "list":
        print("\n".join(names()))
    elif cmd == "download":
        out = Path(args[0]); out.mkdir(parents=True, exist_ok=True)
        for n in names():
            (out / n).write_bytes(call("GET", f"object/{BUCKET}/{urllib.parse.quote(n)}"))
            print(out / n)
    elif cmd == "remove":
        call("DELETE", f"object/{BUCKET}", {"prefixes": [args[0]]})
    elif cmd == "fail":
        call("POST", "object/move", {"bucketId": BUCKET, "sourceKey": args[0], "destinationKey": f"failed/{args[0]}"})
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
