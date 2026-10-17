"""Sync recent Civil Court decisions into data/civil-judgments.json.

Reads the public decision list behind https://civilcourt.gov.mv/5/ (its DataTables feed), politely.
Each record is marked "eligible" when the daily legal-principles task should write it up:
a final judgment (ޤަޟިއްޔާ ނިމުނުގޮތް) that is not one of the routine debt-enforcement, banking or
hire-purchase claims, which make up most of the court's output and rarely decide a point of law.

Usage:
  python scripts/sync_civil.py
"""
import json, re, sys, time
from pathlib import Path
from urllib.parse import urljoin
import requests

FEED = "https://civilcourt.gov.mv/5/scripts/server_processing_all.php"
PAGE = "https://civilcourt.gov.mv/5/"
OUT = Path(__file__).resolve().parent.parent / "data" / "civil-judgments.json"
UA = "CaseLawMV-sync/1.0 (+https://github.com/Malsaalim/Caselawmv)"
SINCE = "2026-10-15"   # keep decisions from this date on (the queue starts here)
BATCH = 100
ROUTINE = re.compile(r"ތަންފީ|ބޭންކިންގ|ހަޔަރ|ފައިނޭންސް ލީސިންގ|ފައިނޭންސިންގ ފެސިލިޓީ")

session = requests.Session()
session.headers["User-Agent"] = UA


def clean(s):
    return re.sub(r"\s+", " ", (s or "").replace("\r", " ")).strip()


def parse(row):
    case, kind, link, plaintiff, defendant, subject, date = (row + [""] * 7)[:7]
    m = re.search(r'href="([^"]+)"', link or "")
    pdf = urljoin(PAGE, m.group(1).strip()).replace(" ", "%20") if m else ""
    case = clean(case)
    kind, subject = clean(kind), clean(subject)
    return {
        "id": "civil-" + re.sub(r"[^0-9A-Za-z-]+", "-", case).strip("-"),
        "caseNo": case,
        "kind": kind,
        "plaintiff": clean(plaintiff),
        "defendant": clean(defendant),
        "subject": subject,
        "date": clean(date)[:10],
        "court": "ސިވިލް ކޯޓު",
        "pdf": pdf,
        "eligible": bool(pdf) and kind == "ޤަޟިއްޔާ ނިމުނުގޮތް" and subject not in ("", "-") and not ROUTINE.search(subject),
    }


def main():
    existing = json.loads(OUT.read_text("utf-8")) if OUT.exists() else []
    by_id = {e["id"]: e for e in existing}
    added = 0
    start = 0
    while start < 5000:
        r = session.get(FEED, params={"draw": 1, "start": start, "length": BATCH}, timeout=60)
        r.raise_for_status()
        rows = r.json().get("data") or []
        if not rows:
            break
        items = [parse(x) for x in rows]
        for it in items:
            if it["date"] < SINCE:
                continue
            old = by_id.get(it["id"], {})
            if not old:
                added += 1
            it["eligible"] = it["eligible"] and not old.get("skip")  # "skip": set by the daily task for unreadable PDFs
            by_id[it["id"]] = {**old, **it}
        print(f"rows {start}-{start + len(rows)}: oldest {items[-1]['date']}")
        if items[-1]["date"] < SINCE:
            break
        start += BATCH
        time.sleep(2)

    data = sorted(by_id.values(), key=lambda e: (e["date"], e["caseNo"]), reverse=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", "utf-8")
    print(f"total {len(data)}, added {added}, eligible {sum(e['eligible'] for e in data)}")
    if not data:
        sys.exit("No decisions parsed — the feed may have changed.")


if __name__ == "__main__":
    main()
