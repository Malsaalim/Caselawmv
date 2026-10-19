"""Manage the Supabase Storage "convert" bucket: PDFs queued for accurate conversion to .docx.

Layout: queue/<name>.pdf (waiting), done/<name>.docx (finished), failed/<name>.pdf (could not be read).
Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment (never print or commit the key).

Usage:
  python scripts/supabase_convert.py list                 # PDFs waiting in queue/
  python scripts/supabase_convert.py download DIR         # download every queued PDF into DIR
  python scripts/supabase_convert.py done NAME FILE.docx  # upload done/<NAME without .pdf>.docx, remove queue/NAME
  python scripts/supabase_convert.py fail NAME            # move queue/NAME to failed/NAME
"""
import json, os, sys, urllib.parse, urllib.request
from pathlib import Path

URL = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
BUCKET = "convert"
DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def call(method, path, body=None, raw=None, ctype="application/json", extra=None):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(f"{URL}/storage/v1/{path}", data=data, method=method, headers={
        "Authorization": f"Bearer {KEY}", "apikey": KEY, "Content-Type": ctype, **(extra or {})})
    with urllib.request.urlopen(req) as res:
        return res.read()


def names():
    files = json.loads(call("POST", f"object/list/{BUCKET}", {"prefix": "queue/", "limit": 1000}))
    return [f["name"] for f in files if f.get("id") and f["name"].lower().endswith(".pdf")]


def main():
    cmd, args = (sys.argv[1:2] or ["list"])[0], sys.argv[2:]
    if cmd == "list":
        print("\n".join(names()))
    elif cmd == "download":
        out = Path(args[0]); out.mkdir(parents=True, exist_ok=True)
        for n in names():
            (out / n).write_bytes(call("GET", f"object/{BUCKET}/queue/{urllib.parse.quote(n)}"))
            print(out / n)
    elif cmd == "done":
        name, docx = args[0], Path(args[1])
        target = "done/" + urllib.parse.quote(name[:-4] + ".docx")
        call("POST", f"object/{BUCKET}/{target}", raw=docx.read_bytes(), ctype=DOCX, extra={"x-upsert": "true"})
        call("DELETE", f"object/{BUCKET}", {"prefixes": [f"queue/{name}"]})
    elif cmd == "fail":
        call("POST", "object/move", {"bucketId": BUCKET, "sourceKey": f"queue/{args[0]}", "destinationKey": f"failed/{args[0]}"})
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
