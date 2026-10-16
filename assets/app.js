// Shared site logic for CaseLaw MV (RTL, Dhivehi)
const CATEGORIES = {
  higher: {
    title: "މަތީ މަރުޙަލާގެ ކޯޓުތަކުގެ ނިންމުންތައް",
    desc: "ސުޕްރީމް ކޯޓާއި ހައިކޯޓުން ނިންމާފައިވާ މުހިންމު މައްސަލަތައް",
    page: "higher-courts.html",
    file: "data/higher.json"
  },
  recent: {
    title: "ފަހުގެ ނިންމުންތައް",
    desc: "ކޯޓުތަކުން އެންމެ ފަހުން ނިންމާފައިވާ ނިންމުންތައް",
    page: "recent.html",
    file: "data/recent.json"
  },
  principles: {
    title: "ޤާނޫނީ އުސޫލުތައް",
    desc: "ކޯޓުތަކުގެ ނިންމުންތަކުން ކަނޑައެޅިފައިވާ ޤާނޫނީ އުސޫލުތަކާއި ލިޔުންތައް",
    page: "principles.html",
    file: "data/principles.json"
  }
};

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

function paragraphs(text) {
  return String(text || "").split(/\n\s*\n/).map(p => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
}

async function loadCategory(key) {
  const res = await fetch(`${CATEGORIES[key].file}?v=${Date.now()}`);
  if (!res.ok) return [];
  const data = await res.json();
  return (Array.isArray(data) ? data : []).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
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
      <a href="admin.html">އެޑްމިން</a>
    </div></footer>`;
}

function entryCard(key, e) {
  const meta = [
    e.court ? `<span class="chip">${esc(e.court)}</span>` : "",
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
      (!q || [i.title, i.summary, i.caseNo, i.court, i.body].join(" ").toLowerCase().includes(q)));
    listEl.innerHTML = shown.length
      ? shown.map(e => entryCard(key, e)).join("")
      : `<div class="empty">${items.length ? "ހޯދި އެއްޗެއް ނުފެނުނު" : "އަދި އެއްވެސް ލިޔުމެއް ޝާއިޢު ކޮށްފައެއް ނުވޭ"}</div>`;
  }
  search.addEventListener("input", draw);
  courtSel.addEventListener("change", draw);
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
  root.innerHTML = `<article class="article">
    <h1>${esc(e.title)}</h1>
    <div class="meta">
      ${e.court ? `<span class="chip">${esc(e.court)}</span>` : ""}
      ${e.caseNo ? `<span>މައްސަލަ ނަންބަރު: <span class="ltr">${esc(e.caseNo)}</span></span>` : ""}
      ${e.date ? `<span>${fmtDate(e.date)}</span>` : ""}
    </div>
    ${e.summary ? `<div class="summary">${esc(e.summary)}</div>` : ""}
    <div class="body">${paragraphs(e.body)}</div>
    ${e.pdf ? `<p><a class="btn" href="${esc(e.pdf)}" target="_blank" rel="noopener">ނިންމުމުގެ ފުރިހަމަ ލިޔުން (PDF)</a></p>` : ""}
  </article>`;
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
