"""Send new Supreme Court judgment PDFs to the CaseLaw MV inbox. Runs on the site owner's own computer.

The court's PDF server (old.supremecourt.mv) blocks cloud servers, so the download has to happen on a
normal home or office connection. Each run:
  1. reads the judgment list the website already keeps (data/sc-judgments.json) and the cases that already
     have legal principles (data/sc-principles.json);
  2. picks judgments dated on or after "start_date" that have no principles yet and were not sent before;
  3. downloads each PDF (directly, or through Chrome/Edge when the court asks for a browser check);
  4. uploads it to the Supabase "inbox" bucket with the admin account. The daily task then writes and
     publishes the legal principles.

Usage:
  python fetch_sc.py            # normal run
  python fetch_sc.py --dry-run  # only list what would be sent
"""
import json, re, sys, time
from datetime import datetime
from pathlib import Path
import requests

HERE = Path(__file__).resolve().parent
CONFIG = HERE / "config.json"
STATE = HERE / "sent.json"
LOG = HERE / "fetch_sc.log"
REPO_RAW = "https://raw.githubusercontent.com/Malsaalim/Caselawmv/main/data"
SUPABASE_URL = "https://letpxzcksvbmnyhjulpq.supabase.co"
SUPABASE_KEY = "sb_publishable_eRCAsOrL0d7p4ZlquXgvYw_Yzg5rTKg"  # public (browser) key
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"


def log(msg):
    line = f"{datetime.now():%Y-%m-%d %H:%M:%S}  {msg}"
    print(line)
    with LOG.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def load_json(path, default):
    try:
        return json.loads(path.read_text("utf-8"))
    except FileNotFoundError:
        return default


def inbox_name(pdf_url):
    # Same naming as the admin panel's upload box, so the daily task can match the file to its judgment.
    return re.sub(r"[^a-z0-9._-]+", "-", pdf_url.rsplit("/", 1)[-1].split("?")[0].lower())


def login(cfg):
    r = requests.post(f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
                      headers={"apikey": SUPABASE_KEY}, json={"email": cfg["email"], "password": cfg["password"]}, timeout=60)
    if r.status_code != 200:
        sys.exit(f"Login failed ({r.status_code}). Check email and password in config.json.")
    return r.json()["access_token"]


def storage(token):
    s = requests.Session()
    s.headers.update({"apikey": SUPABASE_KEY, "Authorization": f"Bearer {token}"})
    return s


def inbox_files(s):
    names = set()
    for prefix in ("", "failed/"):
        r = s.post(f"{SUPABASE_URL}/storage/v1/object/list/inbox", json={"prefix": prefix, "limit": 1000}, timeout=60)
        r.raise_for_status()
        names |= {f["name"] for f in r.json() if f.get("id")}
    return names


def is_pdf(data):
    return data[:5] == b"%PDF-"


class Browser:
    """Chrome or Edge, started only if the court's server asks for a browser check."""

    def __init__(self):
        self.pw = self.ctx = None

    def get(self, url):
        if self.ctx is None:
            from playwright.sync_api import sync_playwright
            self.pw = sync_playwright().start()
            last = None
            for channel in ("chrome", "msedge"):
                try:
                    self.ctx = self.pw.chromium.launch_persistent_context(
                        str(HERE / "browser-profile"), channel=channel, headless=False,
                        args=["--start-minimized", "--disable-blink-features=AutomationControlled"])
                    break
                except Exception as e:
                    last = e
            if self.ctx is None:
                raise RuntimeError(f"Could not start Chrome or Edge: {last}")
            page = self.ctx.new_page()
            page.goto("https://old.supremecourt.mv/", wait_until="domcontentloaded", timeout=90000)
            for _ in range(60):  # wait up to a minute for the browser check to clear
                if "just a moment" not in page.title().lower():
                    break
                page.wait_for_timeout(1000)
        r = self.ctx.request.get(url, timeout=120000)
        return r.body() if r.ok else b""

    def close(self):
        if self.ctx:
            self.ctx.close()
        if self.pw:
            self.pw.stop()


def download(url, browser):
    try:
        r = requests.get(url, headers={"User-Agent": UA}, timeout=120)
        if r.ok and is_pdf(r.content):
            return r.content
    except requests.RequestException:
        pass
    data = browser.get(url)
    return data if is_pdf(data) else None


def main():
    dry = "--dry-run" in sys.argv
    cfg = load_json(CONFIG, None)
    if not cfg:
        sys.exit("config.json is missing. Copy config.example.json to config.json and fill it in.")
    start = cfg.get("start_date", "2026-10-01")
    limit = int(cfg.get("max_per_run", 5))

    judgments = requests.get(f"{REPO_RAW}/sc-judgments.json", timeout=60).json()
    done = {str(e["id"]) for e in requests.get(f"{REPO_RAW}/sc-principles.json", timeout=60).json()}
    sent = load_json(STATE, {})

    todo = [j for j in judgments if j.get("pdf") and (j.get("date") or "") >= start
            and str(j["id"]) not in done and str(j["id"]) not in sent]
    todo.sort(key=lambda j: (j.get("date", ""), j.get("citation", "")))  # oldest first
    if not todo:
        log("Nothing new to send.")
        return

    s = storage(login(cfg))
    waiting = inbox_files(s)
    browser = Browser()
    sent_now = 0
    try:
        for j in todo:
            if sent_now >= limit:
                break
            name = inbox_name(j["pdf"])
            label = f'{j.get("citation") or j.get("caseNo")} ({j.get("date")})'
            if name in waiting:
                sent[str(j["id"])] = {"file": name, "at": datetime.now().isoformat(timespec="seconds"), "note": "already in inbox"}
                continue
            if dry:
                log(f"Would send {label}: {name}")
                sent_now += 1
                continue
            data = download(j["pdf"], browser)
            if not data:
                log(f"Could not download {label}: {j['pdf']}")
                continue
            r = s.post(f"{SUPABASE_URL}/storage/v1/object/inbox/{name}", data=data,
                       headers={"Content-Type": "application/pdf", "x-upsert": "false"}, timeout=120)
            if r.status_code in (200, 201):
                log(f"Sent {label}: {name} ({len(data) // 1024} KB)")
                sent[str(j["id"])] = {"file": name, "at": datetime.now().isoformat(timespec="seconds")}
                sent_now += 1
            else:
                log(f"Upload failed for {label}: {r.status_code} {r.text[:200]}")
            time.sleep(3)
    finally:
        browser.close()
        if not dry:
            STATE.write_text(json.dumps(sent, ensure_ascii=False, indent=1), "utf-8")
    left = len(todo) - sent_now
    log(f"Done: {sent_now} {'would be sent' if dry else 'sent'}" + (f", {left} left for the next runs." if left > 0 else "."))


if __name__ == "__main__":
    main()
