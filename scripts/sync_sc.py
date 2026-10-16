"""Sync the Supreme Court of Maldives judgment list into data/sc-judgments.json.

Reads only the public listing pages at https://www.supremecourt.mv/case-registry/judgments
(respecting robots.txt), politely, with a delay between requests.

Usage:
  python scripts/sync_sc.py            # daily mode: stop at the first page with nothing new
  python scripts/sync_sc.py --full     # walk every page
"""
import json, re, sys, time, urllib.robotparser
from pathlib import Path
import requests
from bs4 import BeautifulSoup

BASE = "https://www.supremecourt.mv"
LIST = f"{BASE}/case-registry/judgments"
OUT = Path(__file__).resolve().parent.parent / "data" / "sc-judgments.json"
UA = "CaseLawMV-sync/1.0 (+https://github.com/Malsaalim/Caselawmv)"
DELAY = 2.0

session = requests.Session()
session.headers["User-Agent"] = UA

robots = urllib.robotparser.RobotFileParser(f"{BASE}/robots.txt")
try:
    robots.read()
except Exception:
    robots = None


def allowed(url):
    return robots is None or robots.can_fetch(UA, url)


def text(el):
    return el.get_text(" ", strip=True) if el else ""


def parse_page(html):
    soup = BeautifulSoup(html, "html.parser")
    out = []
    seen = set()
    for link in soup.select('h3 a[href^="/case-registry/judgments/"]'):
        m = re.search(r"/case-registry/judgments/([0-9a-f-]{36})", link["href"])
        if not m or m.group(1) in seen:
            continue
        uid = m.group(1)
        seen.add(uid)
        art = link.find_parent("article") or link.find_parent("li")
        cite = art.select_one("span.dv-case-number")
        t = art.select_one("time[datetime]")
        cases = [text(a) for a in art.select('a[href^="/case-registry/cases/"]')]
        pdf = art.select_one('a[href$=".pdf"], a[href*=".pdf?"]')
        cat = None
        for p in art.find_all("p"):
            if p.select_one("span.lang-dv"):
                cat = p
        out.append({
            "id": uid,
            "citation": text(cite),
            "caseNo": ", ".join(c for c in cases if c),
            "date": t["datetime"][:10] if t else "",
            "titleEn": text(link.select_one(".lang-en")),
            "title": text(link.select_one(".lang-dv")) or text(link),
            "category": text(cat.select_one(".lang-dv")) if cat else "",
            "categoryEn": text(cat.select_one(".lang-en")) if cat else "",
            "court": "ސުޕްރީމް ކޯޓު",
            "url": f"{BASE}/case-registry/judgments/{uid}",
            "pdf": pdf["href"] if pdf else "",
        })
    return out


def main():
    full = "--full" in sys.argv
    existing = json.loads(OUT.read_text("utf-8")) if OUT.exists() else []
    by_id = {e["id"]: e for e in existing}
    added = updated = 0
    page = 1
    while page <= 200:
        url = LIST if page == 1 else f"{LIST}?page={page}"
        if not allowed(url):
            print(f"robots.txt disallows {url}; stopping")
            break
        r = session.get(url, timeout=60)
        r.raise_for_status()
        items = parse_page(r.text)
        print(f"page {page}: {len(items)} items")
        if not items:
            break
        new_here = 0
        for it in items:
            old = by_id.get(it["id"])
            if old is None:
                by_id[it["id"]] = it
                added += 1
                new_here += 1
            else:
                merged = {**old, **{k: v for k, v in it.items() if v}}
                if merged != old:
                    by_id[it["id"]] = merged
                    updated += 1
        if not full and new_here == 0:
            break
        page += 1
        time.sleep(DELAY)

    data = sorted(by_id.values(), key=lambda e: (e.get("date", ""), e.get("citation", "")), reverse=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", "utf-8")
    print(f"total {len(data)}, added {added}, updated {updated}")
    if not data:
        sys.exit("No judgments parsed — page layout may have changed.")


if __name__ == "__main__":
    main()
