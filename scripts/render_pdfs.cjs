// Render every legal-principles entry to pdf/principles/<id>.pdf with headless Chromium,
// using the site's own page and print stylesheet (Faruma, right-to-left, selectable text).
//
// Usage: node scripts/render_pdfs.cjs            (needs the `playwright` package)
//        CHROMIUM_PATH=/path/to/chrome node ...   (optional: use an existing Chromium)
const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "pdf", "principles");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff", ".png": "image/png" };

function serve() {
  const server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(0, "127.0.0.1", () => r(server)));
}

(async () => {
  const entries = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "sc-principles.json"), "utf8"));
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage();
  const keep = new Set();
  for (const e of entries) {
    if (!e.body) continue;
    await page.goto(`${base}/view.html?cat=principles&id=${encodeURIComponent(e.id)}`, { waitUntil: "networkidle" });
    await page.waitForSelector(".article h1");
    await page.evaluate(() => document.fonts.ready);
    const file = path.join(OUT, `${e.id}.pdf`);
    const label = [e.citation, e.caseNo].filter(Boolean).join("  |  ");
    await page.pdf({
      path: file, format: "A4", printBackground: true,
      margin: { top: "18mm", bottom: "18mm", left: "16mm", right: "16mm" },
      displayHeaderFooter: true, headerTemplate: "<span></span>",
      footerTemplate: `<div style="width:100%;font-size:8px;color:#7b8496;padding:0 16mm;display:flex;justify-content:space-between;font-family:sans-serif">
        <span>CaseLaw MV  |  ${label}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
    });
    keep.add(`${e.id}.pdf`);
    console.log("rendered", e.citation || e.id);
  }
  for (const f of fs.readdirSync(OUT)) if (f.endsWith(".pdf") && !keep.has(f)) fs.unlinkSync(path.join(OUT, f));
  await browser.close();
  server.close();
})().catch(err => { console.error(err); process.exit(1); });
