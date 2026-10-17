// Shared site logic for CaseLaw MV (RTL, Dhivehi)
const CATEGORIES = {
  higher: {
    title: "މަތީ މަރުޙަލާގެ ކޯޓުތަކުގެ ނިންމުންތައް",
    desc: "ސުޕްރީމް ކޯޓާއި ހައިކޯޓުން ނިންމާފައިވާ މުހިންމު މައްސަލަތައް",
    page: "higher-courts.html",
    file: "data/higher.json",
    sync: { file: "data/sc-judgments.json" }
  },
  recent: {
    title: "ފަހުގެ ނިންމުންތައް",
    desc: "ކޯޓުތަކުން އެންމެ ފަހުން ނިންމާފައިވާ ނިންމުންތައް",
    page: "recent.html",
    file: "data/recent.json",
    sync: { file: "data/sc-judgments.json", limit: 30 }
  },
  principles: {
    title: "ޤާނޫނީ އުސޫލުތައް",
    desc: "ކޯޓުތަކުގެ ނިންމުންތަކުން ކަނޑައެޅިފައިވާ ޤާނޫނީ އުސޫލުތަކާއި ލިޔުންތައް",
    page: "principles.html",
    file: "data/principles.json",
    sync: { file: "data/sc-principles.json" }
  }
};

const SC_REGISTRY = "https://www.supremecourt.mv/case-registry/judgments";

// Supabase client (null until assets/supabase-config.js is filled in).
const sb = (() => {
  const url = window.SUPABASE_URL || "", key = window.SUPABASE_ANON_KEY || "";
  if (!window.supabase || !url || /YOUR-/.test(url + key)) return null;
  return window.supabase.createClient(url, key);
})();

const fromRow = r => ({
  id: r.id, title: r.title, titleEn: r.title_en, court: r.court, caseNo: r.case_no, citation: r.citation,
  date: r.date, summary: r.summary, body: r.body, pdf: r.pdf, url: r.url
});
const toRow = (category, e) => ({
  id: e.id, category, title: e.title, title_en: e.titleEn || null, court: e.court || null, case_no: e.caseNo || null,
  citation: e.citation || null, date: e.date || null, summary: e.summary || null, body: e.body || null,
  pdf: e.pdf || null, url: e.url || null
});

// The site's own entries: from Supabase when configured, otherwise from the JSON file.
async function loadOwn(key) {
  if (sb) {
    const { data, error } = await sb.from("entries").select("*").eq("category", key);
    if (!error) return data.map(fromRow);
    console.warn("Supabase:", error.message);
  }
  return fetchJson(CATEGORIES[key].file);
}

const MONTHS = ["ޖަނަވަރީ", "ފެބުރުއަރީ", "މާރިޗު", "އޭޕްރީލު", "މެއި", "ޖޫން",
  "ޖުލައި", "އޯގަސްޓު", "ސެޕްޓެމްބަރު", "އޮކްޓޫބަރު", "ނޮވެމްބަރު", "ޑިސެމްބަރު"];

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return esc(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// Numbered lines ("1. …") become a list; anything else becomes paragraphs.
function points(text) {
  const lines = String(text || "").split("\n").map(l => l.trim()).filter(Boolean);
  if (!lines.length || !lines.every(l => /^\d+[.)]\s/.test(l))) return paragraphs(text);
  return `<ol class="points">${lines.map(l => `<li>${ltrRuns(esc(l.replace(/^\d+[.)]\s+/, "")))}</li>`).join("")}</ol>`;
}

function precedentsHtml(list) {
  if (!Array.isArray(list) || !list.length) return "";
  return `<h2>މި ނިންމުމުގައި ހަވާލާދީފައިވާ ޤަޟިއްޔާތައް</h2>` + list.map(p => `
    <section class="precedent">
      <h3>${ltrRuns(esc(p.name))}</h3>
      <div class="meta">
        ${p.reference ? `<span>${ltrRuns(esc(p.reference))}</span>` : `
        ${p.citation ? `<span class="ltr">${esc(p.citation)}</span>` : ""}
        ${p.caseNo ? `<span>ޤަޟިއްޔާ ނަންބަރު: <span class="ltr">${esc(p.caseNo)}</span></span>` : ""}`}
        ${p.court ? `<span class="chip">${esc(p.court)}</span>` : ""}
      </div>
      ${p.parties ? `<p><strong>ފަރާތްތައް:</strong> ${esc(p.parties)}</p>` : ""}
      ${p.principles ? `<p><strong>ކަނޑައަޅާފައިވާ ޤާނޫނީ އުސޫލުތައް:</strong></p>${points(p.principles)}` : ""}
    </section>`).join("");
}

// Keep case numbers (2019/SC-L/87) and citations ([2021] SC 51) left-to-right inside Thaana text.
const CASE_NO = /\[\d{4}\]\s+[A-Z]+\s+\d+|[0-9A-Za-z]+(?:[-\/()][0-9A-Za-z]+)*\/(?:[0-9A-Za-z()]+[-\/]?)+/g;
const ltrRuns = html => html.replace(CASE_NO, m => `<bdi dir="ltr">${m}</bdi>`);

// Paragraphs; a paragraph starting with "### " is a sub-heading, one made of numbered lines is a list.
function paragraphs(text) {
  return String(text || "").split(/\n\s*\n/).map(p => {
    if (/^###\s/.test(p)) return `<h3>${ltrRuns(esc(p.replace(/^###\s+/, "")))}</h3>`;
    const lines = p.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length > 1 && lines.every(l => /^\d+[.)]\s/.test(l))) return points(p);
    return `<p>${ltrRuns(esc(p)).replace(/\n/g, "<br>")}</p>`;
  }).join("");
}

async function fetchJson(file) {
  try {
    const res = await fetch(`${file}?v=${Date.now()}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

const byDate = (a, b) => (b.date || "").localeCompare(a.date || "") || (b.citation || "").localeCompare(a.citation || "");

function normalizeSynced(e) {
  const out = { ...e, source: "sc" };
  if (!out.caseNo && /SC-/.test(out.title || "")) out.caseNo = out.title;
  if (!out.title || out.title === out.caseNo) out.title = `ޤަޟިއްޔާ ނަންބަރު ${out.caseNo || ""}`.trim();
  return out;
}

async function loadCategory(key) {
  const cat = CATEGORIES[key];
  const own = (await loadOwn(key)).sort(byDate);
  if (!cat.sync) return own;
  let synced = (await fetchJson(cat.sync.file)).map(normalizeSynced).sort(byDate);
  if (cat.sync.limit) synced = synced.slice(0, cat.sync.limit);
  const ownIds = new Set(own.map(e => String(e.id)));
  return [...own, ...synced.filter(e => !ownIds.has(String(e.id)))].sort(byDate);
}

function renderChrome(active) {
  const nav = Object.entries(CATEGORIES)
    .map(([k, c]) => `<a href="${c.page}" class="${active === k ? "active" : ""}">${c.title}</a>`).join("");
  document.getElementById("header").innerHTML = `
    <header class="site-header"><div class="wrap">
      <a class="logo" href="index.html">
        <span class="logo-mark">ޤ</span>
        <span class="logo-text"><strong>ކޭސްލޯ އެމްވީ</strong><small>ދިވެހިރާއްޖޭގެ ކޯޓުތަކުގެ ނިންމުންތައް</small></span>
      </a>
      <nav class="nav">
        <a href="index.html" class="${active === "home" ? "active" : ""}">މައި ޞަފްޙާ</a>${nav}
      </nav>
    </div></header>`;
  document.getElementById("footer").innerHTML = `
    <footer class="site-footer"><div class="wrap">
      <span>© ${new Date().getFullYear()} ކޭސްލޯ އެމްވީ</span>
      <span style="display:flex;gap:16px;flex-wrap:wrap">
        <a href="${SC_REGISTRY}" target="_blank" rel="noopener">ސުޕްރީމް ކޯޓުގެ ނިންމުންތައް ↗</a>
        <a href="admin.html">އެޑްމިން</a>
      </span>
    </div></footer>`;
}

function entryCard(key, e) {
  const meta = [
    e.court ? `<span class="chip">${esc(e.court)}</span>` : "",
    e.citation ? `<span class="ltr">${esc(e.citation)}</span>` : "",
    e.category ? `<span>${esc(e.category)}</span>` : "",
    e.caseNo ? `<span>މައްސަލަ ނަންބަރު: <span class="ltr">${esc(e.caseNo)}</span></span>` : "",
    e.date ? `<span>${fmtDate(e.date)}</span>` : ""
  ].join("");
  return `<article class="entry">
    <h3><a href="view.html?cat=${key}&id=${encodeURIComponent(e.id)}">${esc(e.title)}</a></h3>
    <div class="meta">${meta}</div>
    ${e.summary ? `<p>${esc(e.summary)}</p>` : ""}
  </article>`;
}

async function initListPage(key) {
  renderChrome(key);
  const cat = CATEGORIES[key];
  document.title = `${cat.title} | ކޭސްލޯ އެމްވީ`;
  document.getElementById("title").textContent = cat.title;
  document.getElementById("desc").textContent = cat.desc;
  const listEl = document.getElementById("list");
  const search = document.getElementById("search");
  const courtSel = document.getElementById("court");
  let items = [];
  try { items = await loadCategory(key); } catch { items = []; }

  const courts = [...new Set(items.map(i => i.court).filter(Boolean))];
  courtSel.innerHTML = `<option value="">ހުރިހާ ކޯޓެއް</option>` +
    courts.map(c => `<option>${esc(c)}</option>`).join("");
  if (!courts.length) courtSel.style.display = "none";

  function draw() {
    const q = search.value.trim().toLowerCase();
    const c = courtSel.value;
    const shown = items.filter(i =>
      (!c || i.court === c) &&
      (!q || [i.title, i.titleEn, i.citation, i.summary, i.caseNo, i.court, i.category, i.body, i.facts].join(" ").toLowerCase().includes(q)));
    if (!shown.length) {
      listEl.innerHTML = `<div class="empty">${items.length ? "ހޯދި އެއްޗެއް ނުފެނުނު" : "އަދި އެއްވެސް ލިޔުމެއް ޝާއިޢު ކޮށްފައެއް ނުވޭ"}</div>`;
      return;
    }
    const page = shown.slice(0, limit);
    listEl.innerHTML = `<p class="hint">ޖުމްލަ ${shown.length} ލިޔުން</p>` + page.map(e => entryCard(key, e)).join("") +
      (shown.length > limit ? `<button class="btn secondary" id="more" style="justify-self:center">އިތުރަށް ދައްކާ</button>` : "");
    const more = document.getElementById("more");
    if (more) more.onclick = () => { limit += PAGE; draw(); };
  }
  const PAGE = 30;
  let limit = PAGE;
  search.addEventListener("input", () => { limit = PAGE; draw(); });
  courtSel.addEventListener("change", () => { limit = PAGE; draw(); });
  draw();
}

async function initViewPage() {
  const params = new URLSearchParams(location.search);
  const key = params.get("cat");
  const id = params.get("id");
  const root = document.getElementById("article");
  if (!CATEGORIES[key]) { renderChrome(""); root.innerHTML = `<div class="empty">ޞަފްޙާ ނުފެނުނު</div>`; return; }
  renderChrome(key);
  const cat = CATEGORIES[key];
  document.getElementById("back").href = cat.page;
  document.getElementById("back").textContent = `→ ${cat.title}`;
  const items = await loadCategory(key).catch(() => []);
  const e = items.find(i => String(i.id) === id);
  if (!e) { root.innerHTML = `<div class="empty">މި ލިޔުން ނުފެނުނު</div>`; return; }
  document.title = `${e.title} | ކޭސްލޯ އެމްވީ`;
  let principlesLink = "";
  if (key !== "principles" && e.source === "sc") {
    const pr = (await fetchJson("data/sc-principles.json")).find(p => String(p.id) === String(e.id));
    if (pr) principlesLink = `<a class="btn" style="background:var(--accent)" href="view.html?cat=principles&id=${encodeURIComponent(e.id)}">މި މައްސަލައިގެ ޤާނޫނީ އުސޫލުތައް</a>`;
  }
  root.innerHTML = `<article class="article">
    <h1>${esc(e.title)}</h1>
    <div class="meta">
      ${e.court ? `<span class="chip">${esc(e.court)}</span>` : ""}
      ${e.citation ? `<span class="ltr">${esc(e.citation)}</span>` : ""}
      ${e.caseNo ? `<span>މައްސަލަ ނަންބަރު: <span class="ltr">${esc(e.caseNo)}</span></span>` : ""}
      ${e.category ? `<span>${esc(e.category)}</span>` : ""}
      ${e.date ? `<span>${fmtDate(e.date)}</span>` : ""}
    </div>
    ${e.titleEn ? `<p class="ltr" style="display:block;color:var(--muted);margin:8px 0 0">${esc(e.titleEn)}</p>` : ""}
    ${key === "principles" && e.body ? `<p class="no-print" style="margin:16px 0 0;display:flex;flex-direction:column;align-items:flex-start;gap:8px">
      <button class="btn" id="docxBtn" type="button">⬇ Download the word file</button>
      <button class="btn" id="pdfBtn" type="button">⬇ Download the pdf file</button></p>` : ""}
    ${e.summary ? `<div class="summary">${esc(e.summary)}</div>` : ""}
    ${e.facts ? `<h2>މައްސަލައިގެ ޚުލާޞާ</h2><div class="body">${paragraphs(e.facts)}</div>` : ""}
    ${e.body ? `<div class="body">${e.facts ? "<h2>ޤާނޫނީ އުސޫލުތައް</h2><p class=\"hint\">ނިންމުމަށް ފަނޑިޔާރުން ބިނާކުރެއްވި ޤާނޫނީ އުސޫލުތަކާއި މަތީ ކޯޓުތަކުގެ ޤަޟިއްޔާތައް</p>" : ""}${points(e.body)}</div>${precedentsHtml(e.precedents)}` :
      (e.source === "sc" && key !== "principles" ? `<p class="hint" style="margin-top:20px">މި ނިންމުމުގެ ފުރިހަމަ ލިޔުން ސުޕްރީމް ކޯޓުގެ ވެބްސައިޓުން ކިޔުއްވޭނެ.</p>` : "")}
    <p class="no-print" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:20px">
      ${principlesLink}
      ${e.pdf ? `<a class="btn" href="${esc(e.pdf)}" target="_blank" rel="noopener">ނިންމުމުގެ ފުރިހަމަ ލިޔުން (PDF)</a>` : ""}
      ${e.url ? `<a class="btn secondary" href="${esc(e.url)}" target="_blank" rel="noopener">ސުޕްރީމް ކޯޓުގެ ވެބްސައިޓުގައި ބަލާ ↗</a>` : ""}
    </p>
  </article>`;
  const docxBtn = document.getElementById("docxBtn");
  if (docxBtn) docxBtn.onclick = async () => {
    const label = docxBtn.textContent;
    docxBtn.disabled = true; docxBtn.textContent = "ތައްޔާރުކުރަނީ…";
    try { await downloadDocx(e); }
    catch (err) { alert(`Word ފައިލް ތައްޔާރު ނުކުރެވުނު: ${err.message}`); }
    finally { docxBtn.disabled = false; docxBtn.textContent = label; }
  };
  const pdfBtn = document.getElementById("pdfBtn");
  if (pdfBtn) pdfBtn.onclick = async () => {
    pdfBtn.disabled = true;
    try { await downloadPdf(e); } finally { pdfBtn.disabled = false; }
  };
}

// ---- PDF export: files are pre-rendered by scripts/render_pdfs.mjs (GitHub Actions) ----
const pdfFileName = e => `${(e.citation || e.caseNo || e.id).replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "")}-legal-principles.pdf`;

async function downloadPdf(e) {
  const url = `pdf/principles/${encodeURIComponent(e.id)}.pdf`;
  const res = await fetch(`${url}?v=${Date.now()}`).catch(() => null);
  if (!res || !res.ok) {
    // Not rendered yet (a just-added case): fall back to the browser's own "Save as PDF".
    alert("PDF ފައިލް އަދި ތައްޔާރުވެފައެއް ނުވެއެވެ. ޕްރިންޓް ކުރާ ސްކްރީނުން \"Save as PDF\" ހޮއްވަވާ.");
    window.print();
    return;
  }
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(await res.blob()), download: pdfFileName(e) });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// ---- Word (.docx) export of a legal-principles entry ----
const DOCX_LIB = "https://cdn.jsdelivr.net/npm/docx@9.0.2/build/index.umd.js";
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src; s.onload = res; s.onerror = () => rej(new Error("docx library failed to load"));
    document.head.appendChild(s);
  });
}

async function downloadDocx(e) {
  if (!window.docx) await loadScript(DOCX_LIB);
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = window.docx;
  const font = { ascii: "Calibri", hAnsi: "Calibri", cs: "Faruma" };
  const latin = { ascii: "Calibri", hAnsi: "Calibri", cs: "Calibri" };
  // Thaana goes in right-to-left Faruma runs; citations, case numbers, numbers and English in left-to-right
  // Calibri runs (Faruma draws [ ] and Latin as other glyphs).
  const LTR = /(\[\d{4}\]\s+[A-Z]+\s+\d+|[0-9A-Za-z]+(?:[-\/()][0-9A-Za-z]+)*\/(?:[0-9A-Za-z()]+[-\/]?)+|[A-Za-z][A-Za-z0-9 .,'’()&:\/-]*[A-Za-z0-9.)]|[A-Za-z]|\d[\d,.\/-]*\d|\d)/;
  const runs = (text, o = {}) => String(text).split(LTR).filter(Boolean).map((t, i) => {
    const ltr = LTR.test(t) && !/[\u0780-\u07BF]/.test(t);
    return new TextRun({ text: ltr ? `\u200E${t}\u200E` : t, font: ltr ? latin : font, rightToLeft: !ltr, size: o.size || 26, sizeComplexScript: o.size || 26,
      bold: o.bold, boldComplexScript: o.bold, color: o.color });
  });
  const para = (text, o = {}) => new Paragraph({ bidirectional: /[\u0780-\u07BF]/.test(text), alignment: o.align || AlignmentType.BOTH,
    spacing: { after: o.after ?? 120, line: 340 }, indent: o.indent ? { right: o.indent } : undefined,
    heading: o.heading, children: runs(text, o) });
  const heading = (text, size = 32) => para(text, { bold: true, size, color: "0E2E49", after: 160, heading: HeadingLevel.HEADING_2 });
  const sub = text => para(text, { bold: true, size: 28, color: "123B5D", after: 80, heading: HeadingLevel.HEADING_3 });
  const lines = text => String(text || "").split("\n").map(l => l.trim()).filter(Boolean);
  const block = text => String(text || "").split(/\n\s*\n/).flatMap(p =>
    /^###\s/.test(p) ? [sub(p.replace(/^###\s+/, ""))] :
    lines(p).every(l => /^\d+[.)]\s/.test(l)) ? lines(p).map(l => para(l, { indent: 360 })) : [para(p.replace(/\n/g, " "))]);

  const children = [
    para(e.title, { bold: true, size: 36, color: "0E2E49", align: AlignmentType.CENTER, after: 60 }),
    para([e.citation, e.caseNo, e.court, e.date && fmtDate(e.date)].filter(Boolean).join("  |  "), { size: 22, color: "7B8496", align: AlignmentType.CENTER, after: 60 }),
  ];
  if (e.titleEn) children.push(para(e.titleEn, { size: 22, color: "7B8496", align: AlignmentType.CENTER, after: 240 }));
  if (e.summary) children.push(para(e.summary, { bold: true, after: 240 }));
  if (e.facts) children.push(heading("މައްސަލައިގެ ޚުލާޞާ"), ...block(e.facts));
  children.push(heading("ޤާނޫނީ އުސޫލުތައް"), ...lines(e.body).map(l => para(l, { indent: 360 })));
  if (Array.isArray(e.precedents) && e.precedents.length) {
    children.push(heading("މި ނިންމުމުގައި ހަވާލާދީފައިވާ ޤަޟިއްޔާތައް"));
    for (const p of e.precedents) {
      children.push(sub(p.name));
      const ref = p.reference || [p.citation, p.caseNo].filter(Boolean).join(" ");
      if (ref) children.push(para(ref, { size: 22, color: "7B8496", after: 60 }));
      if (p.parties) children.push(para(`ފަރާތްތައް: ${p.parties}`));
      if (p.principles) children.push(para("ކަނޑައަޅާފައިވާ ޤާނޫނީ އުސޫލުތައް:", { bold: true, after: 60 }), ...lines(p.principles).map(l => para(l, { indent: 360 })));
    }
  }
  children.push(para(`ކޭސްލޯ އެމްވީ — ${location.href}`, { size: 18, color: "7B8496", align: AlignmentType.CENTER }));

  const doc = new Document({
    creator: "CaseLaw MV", title: e.title,
    styles: { default: { document: { run: { font, rightToLeft: true } } } },
    sections: [{ properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } }, children }]
  });
  const blob = await Packer.toBlob(doc);
  const name = `${(e.citation || e.caseNo || e.id).replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "")}-legal-principles.docx`;
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

async function initHome() {
  renderChrome("home");
  const grid = document.getElementById("tabs");
  const keys = Object.keys(CATEGORIES);
  grid.innerHTML = keys.map((k, i) => `
    <a class="tab-card" href="${CATEGORIES[k].page}">
      <span class="num">${i + 1}</span>
      <h2>${CATEGORIES[k].title}</h2>
      <p>${CATEGORIES[k].desc}</p>
      <span class="count" id="count-${k}"></span>
    </a>`).join("");
  for (const k of keys) {
    loadCategory(k).then(items => {
      document.getElementById(`count-${k}`).textContent = `ލިޔުންތައް: ${items.length}`;
    }).catch(() => {});
  }
}
