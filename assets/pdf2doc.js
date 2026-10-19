// PDF to Doc Scan: converts a PDF into a .docx in the browser, keeping the PDF's text and layout.
//
// Text pages are read glyph by glyph from the PDF drawing instructions (not pdf.js's text layer, which
// scrambles Thaana vowel signs): each glyph's position, font size, bold (incl. Word's fill+stroke "fake
// bold"), colour and underline are recovered, then Thaana is rebuilt in logical order. Lines become
// paragraphs with the PDF's alignment, indents and line spacing, on a page of the PDF's size and margins,
// and embedded images (logos, seals) are placed at their PDF positions.
// Scanned pages go through OCR; when OCR is unreliable the page image is used instead.
const PDFJS_LIB = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const TESSERACT_LIB = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
const THAANA = /[ހ-޿]/;
const MARK = /[ަ-ްً-ٰٟ]/;        // vowel signs drawn over/under a letter
const LTR_CHAR = /[A-Za-z0-9À-ɏ]/;
const OCR_MIN_CONFIDENCE = 70;
// Word writes Symbol/Wingdings bullets as private-use characters; give them their real form.
const SYMBOL_PUA = { "\uF0B7": "•", "\uF0A7": "▪", "\uF0D8": "➢", "\uF076": "❖", "\uF0FC": "✓", "\uF06E": "■", "\uF0A8": "○", "\uF0E8": "➔" };

function initPdfToDoc() {
  const input = document.getElementById("pdfFile"), btn = document.getElementById("convertBtn");
  input.addEventListener("change", () => {
    const f = input.files[0];
    document.getElementById("fileName").textContent = f ? f.name : "";
    btn.disabled = !f;
  });
  btn.addEventListener("click", async () => {
    const f = input.files[0];
    if (!f) return pdfStatus("PDF ފައިލެއް އަޕްލޯޑް ކުރައްވާ.", "err");
    btn.disabled = true;
    try { await convertPdfToDoc(f, document.getElementById("forceOcr").checked); }
    catch (e) { console.error(e); pdfStatus("ބަދަލުކުރެވުނީ ނޫން: " + e.message, "err"); }
    finally { btn.disabled = false; document.getElementById("progress").hidden = true; }
  });
}

function pdfStatus(msg, kind = "info") {
  const s = document.getElementById("status");
  s.textContent = msg; s.className = `status show ${kind}`;
}
function pdfProgress(done, total) {
  const p = document.getElementById("progress");
  p.hidden = false; p.max = total; p.value = done;
}

async function convertPdfToDoc(file, forceOcr) {
  pdfStatus("ލޯޑުވަނީ…");
  if (!window.pdfjsLib) await loadScript(PDFJS_LIB);
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  if (!window.docx) await loadScript(DOCX_LIB);
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  let ocr = null, ocrPages = 0, imagePages = 0;
  try {
    for (let n = 1; n <= pdf.numPages; n++) {
      pdfProgress(n - 1, pdf.numPages);
      const page = await pdf.getPage(n);
      const [, , W, H] = page.view;
      const scan = forceOcr ? null : await readPage(page);
      if (scan && scan.glyphCount >= 20) {
        pdfStatus(`ޞަފްޙާ ${n} / ${pdf.numPages}: ލިޔުން ނަގަނީ…`);
        pages.push({ W, H, page, ...scan });
        continue;
      }
      pdfStatus(`ޞަފްޙާ ${n} / ${pdf.numPages}: OCR ކުރަނީ…`);
      ocr = ocr || await startOcr();
      const r = await ocrPage(ocr, page);
      // Low-confidence OCR (e.g. italic Thaana scans) is unusable; keep the page image instead.
      if (r.confidence >= OCR_MIN_CONFIDENCE) { pages.push({ W, H, ocrParas: r.paras }); ocrPages++; }
      else { pages.push({ W, H, pageImage: r.image }); imagePages++; }
    }
  } finally { if (ocr) await ocr.terminate(); }
  const fixed = await fixBrokenDigits(pages.filter(p => p.glyphs));
  const broken = brokenTextFonts(pages.filter(p => p.glyphs));
  for (const p of pages) if (p.glyphs) {
    p.lines = buildLines(p.glyphs, p.rects);
    await imageBrokenLines(p, broken);
    delete p.glyphs; delete p.page;
  }
  pdfProgress(pdf.numPages, pdf.numPages);
  const name = file.name.replace(/\.pdf$/i, "") + ".docx";
  await saveDocx(pages, name);
  pdfStatus(`ނިމިއްޖެ: ${name} ޑައުންލޯޑް ކުރެވިއްޖެ (${pdf.numPages} ޞަފްޙާ` +
    (ocrPages ? `، ${ocrPages} ޞަފްޙާ OCR އިން` : "") +
    (imagePages ? `، ${imagePages} ޞަފްޙާ ސްކޭން ކޮށްފައިވާ ފޮޓޯއެއް ކަމުން ފޮޓޯގެ ގޮތުގައި` : "") +
    (fixed ? `، PDF ގައި ނަންބަރުތައް އޮޅިފައިވާތީ ${fixed} ނަންބަރު ޞަފްޙާގެ ފޮޓޯއިން ކިޔުނު` : "") +
    `). ބޭނުންކުރުމުގެ ކުރިން PDF އާ އަޅާކިޔައި ބައްލަވާ.`, "ok");
}

// ---- Reading a page glyph by glyph ----

const mul = (m, n) => [m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3], m[2] * n[0] + m[3] * n[2],
  m[2] * n[1] + m[3] * n[3], m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5]];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

async function readPage(page) {
  const OPS = pdfjsLib.OPS;
  const ops = await page.getOperatorList();
  const glyphs = [], rects = [], images = [];
  let gs = { ctm: [1, 0, 0, 1, 0, 0], font: null, size: 0, tc: 0, tw: 0, th: 1, tl: 0, rise: 0, mode: 0, color: "000000" };
  const stack = [];
  let tm = [1, 0, 0, 1, 0, 0], tlm = tm, x = 0, path = [];
  const fontCache = {};
  const fontOf = id => fontCache[id] || (fontCache[id] = (() => { try { return page.commonObjs.get(id); } catch { return null; } })());
  const hex = (r, g, b) => [r, g, b].map(v => Math.round(v).toString(16).padStart(2, "0")).join("");
  const nextLine = () => { tlm = mul([1, 0, 0, 1, 0, -gs.tl], tlm); tm = tlm; x = 0; };

  const show = list => {
    const f = gs.font, fm = (f && f.fontMatrix) || [0.001, 0, 0, 0.001, 0, 0];
    const name = (f && (f.name || f.loadedName)) || "";
    const bold = /bold|black|heavy|semibold/i.test(name) || gs.mode === 2;
    const italic = /italic|oblique/i.test(name);
    const m = mul(tm, gs.ctm);
    const scale = Math.hypot(m[2], m[3]);   // vertical scale → rendered font size
    list.forEach((g, k) => {
      if (typeof g === "number") { x -= g / 1000 * gs.size * gs.th; return; }
      const adv = (g.width * fm[0] * gs.size + gs.tc + (g.isSpace ? gs.tw : 0)) * gs.th;
      const [x0, y] = apply(m, x, gs.rise), [x1] = apply(m, x + adv, gs.rise);
      // Word starts many runs with a space that the next kerning value cancels; it is not a real space.
      const next = list[k + 1], cancel = typeof next === "number" ? next / 1000 * gs.size * gs.th : 0;
      const phantom = (/^\s$/.test(g.unicode) && adv - cancel < adv * 0.3) ||
        g.isInFont === false;   // placeholder for a glyph the font does not have (nothing visible is drawn)
      if (g.unicode && gs.mode !== 3 && !phantom) glyphs.push({ u: SYMBOL_PUA[g.unicode] || g.unicode, fk: f && f.loadedName, fc: g.fontChar, x0: Math.min(x0, x1), x1: Math.max(x0, x1), y,
        size: gs.size * scale, bold, italic, color: gs.color, font: name, space: !!g.isSpace || /^\s$/.test(g.unicode) });
      x += adv;
    });
  };

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i], a = ops.argsArray[i];
    switch (fn) {
      case OPS.save: stack.push({ ...gs }); break;
      case OPS.restore: if (stack.length) gs = stack.pop(); break;
      case OPS.transform: gs.ctm = mul(a, gs.ctm); break;
      case OPS.paintFormXObjectBegin: stack.push({ ...gs }); if (a[0]) gs.ctm = mul(a[0], gs.ctm); break;
      case OPS.paintFormXObjectEnd: if (stack.length) gs = stack.pop(); break;
      case OPS.beginText: tm = tlm = [1, 0, 0, 1, 0, 0]; x = 0; break;
      case OPS.setFont: gs.font = fontOf(a[0]); gs.size = a[1]; break;
      case OPS.setCharSpacing: gs.tc = a[0]; break;
      case OPS.setWordSpacing: gs.tw = a[0]; break;
      case OPS.setHScale: gs.th = a[0] / 100; break;
      case OPS.setLeading: gs.tl = a[0]; break;
      case OPS.setTextRise: gs.rise = a[0]; break;
      case OPS.setTextRenderingMode: gs.mode = a[0]; break;
      case OPS.setFillRGBColor: gs.color = hex(a[0], a[1], a[2]); break;
      case OPS.setFillGray: gs.color = hex(a[0] * 255, a[0] * 255, a[0] * 255); break;
      case OPS.setTextMatrix: tm = tlm = a.slice(0, 6); x = 0; break;
      case OPS.moveText: tlm = mul([1, 0, 0, 1, a[0], a[1]], tlm); tm = tlm; x = 0; break;
      case OPS.setLeadingMoveText: gs.tl = -a[1]; tlm = mul([1, 0, 0, 1, a[0], a[1]], tlm); tm = tlm; x = 0; break;
      case OPS.nextLine: nextLine(); break;
      case OPS.showText: case OPS.showSpacedText: show(a[0]); break;
      case OPS.nextLineShowText: nextLine(); show(a[0]); break;
      case OPS.nextLineSetSpacingShowText: gs.tw = a[0]; gs.tc = a[1]; nextLine(); show(a[2]); break;
      case OPS.constructPath: path.push({ ops: a[0], args: a[1], ctm: gs.ctm }); break;
      case OPS.fill: case OPS.eoFill: case OPS.fillStroke: case OPS.eoFillStroke:
        for (const p of path) collectRects(p, rects); path = []; break;
      case OPS.endPath: case OPS.stroke: case OPS.closeStroke: path = []; break;
      case OPS.paintImageXObject: case OPS.paintInlineImageXObject: case OPS.paintJpegXObject: {
        const img = await imageToPng(page, fn === OPS.paintInlineImageXObject ? a[0] : a[0]);
        if (img) {
          const p = [apply(gs.ctm, 0, 0), apply(gs.ctm, 1, 0), apply(gs.ctm, 0, 1), apply(gs.ctm, 1, 1)];
          const xs = p.map(q => q[0]), ys = p.map(q => q[1]);
          images.push({ ...img, x: Math.min(...xs), y: Math.max(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) });
        }
        break;
      }
    }
  }
  return { glyphCount: glyphs.filter(g => !g.space).length, glyphs, rects, images };
}

// Thin filled rectangles under text are Word's underlines.
function collectRects(p, out) {
  const OPS = pdfjsLib.OPS;
  let k = 0;
  for (const op of p.ops) {
    if (op === OPS.rectangle) {
      const [rx, ry, rw, rh] = p.args.slice(k, k + 4);
      const a = apply(p.ctm, rx, ry), b = apply(p.ctm, rx + rw, ry + rh);
      const r = { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), y0: Math.min(a[1], b[1]), y1: Math.max(a[1], b[1]) };
      if (r.y1 - r.y0 < 2 && r.x1 - r.x0 > 3) out.push(r);
      k += 4;
    } else if (op === OPS.moveTo || op === OPS.lineTo) k += 2;
    else if (op === OPS.curveTo) k += 6;
    else if (op === OPS.curveTo2 || op === OPS.curveTo3) k += 4;
  }
}

async function imageToPng(page, id) {
  try {
    // Some image objects are never delivered; give up on them after a few seconds.
    const obj = typeof id === "string"
      ? await Promise.race([new Promise(res => page.objs.get(id, res)), new Promise(res => setTimeout(() => res(null), 4000))])
      : id;
    if (!obj || obj.width < 8 || obj.height < 8) return null;
    const c = document.createElement("canvas");
    c.width = obj.width; c.height = obj.height;
    const ctx = c.getContext("2d");
    if (obj.bitmap) ctx.drawImage(obj.bitmap, 0, 0);
    else if (obj.data) {
      const n = obj.width * obj.height, rgba = new Uint8ClampedArray(n * 4), d = obj.data;
      if (obj.kind === 3) rgba.set(d.subarray(0, n * 4));
      else if (obj.kind === 2) for (let i = 0; i < n; i++) { rgba[i * 4] = d[i * 3]; rgba[i * 4 + 1] = d[i * 3 + 1]; rgba[i * 4 + 2] = d[i * 3 + 2]; rgba[i * 4 + 3] = 255; }
      else if (obj.kind === 1) {
        const row = (obj.width + 7) >> 3;
        for (let yy = 0; yy < obj.height; yy++) for (let xx = 0; xx < obj.width; xx++) {
          const v = (d[yy * row + (xx >> 3)] >> (7 - (xx & 7))) & 1 ? 255 : 0, o = (yy * obj.width + xx) * 4;
          rgba[o] = rgba[o + 1] = rgba[o + 2] = v; rgba[o + 3] = 255;
        }
      } else return null;
      ctx.putImageData(new ImageData(rgba, obj.width, obj.height), 0, 0);
    } else return null;
    const blob = await new Promise(r => c.toBlob(r, "image/png"));
    return { data: new Uint8Array(await blob.arrayBuffer()), pw: obj.width, ph: obj.height };
  } catch { return null; }
}

// Glyphs → lines of logically ordered text runs.
function buildLines(glyphs, rects) {
  const rows = [];
  for (const g of glyphs) {
    let r = rows.find(r => Math.abs(r.y - g.y) < Math.max(r.size, g.size) * 0.45);
    if (!r) rows.push(r = { y: g.y, size: g.size, gs: [] });
    r.gs.push(g); if (!g.space) r.size = Math.max(r.size, g.size);
  }
  rows.sort((a, b) => b.y - a.y);
  // A row that is one glyph repeated (e.g. a hidden text copy behind a title image) carries no text.
  const junk = r => { const ink = r.gs.filter(g => !g.space); return ink.length >= 5 && ink.every(g => g.fc === ink[0].fc && g.u === ink[0].u); };
  return rows.filter(r => !junk(r)).map(r => {
    // Glyphs arrive in drawing order; a mark always precedes its letter in that order (PDF visual order).
    const clusters = [];
    let marks = [];
    for (const g of r.gs) {
      if (MARK.test(g.u) && g.x1 - g.x0 < 0.05 * g.size) { marks.push(g.u); continue; }
      clusters.push({ ...g, u: g.u + marks.join("") }); marks = [];
    }
    if (marks.length && clusters.length) clusters[clusters.length - 1].u += marks.join("");
    clusters.sort((a, b) => a.x0 - b.x0);
    // Insert spaces for visible gaps that have no space glyph.
    const vis = [];
    for (const c of clusters) {
      const prev = vis[vis.length - 1];
      // Wide gaps (form-like layouts) become several spaces so the columns stay apart.
      const gap = prev ? c.x0 - prev.x1 : 0;
      if (prev && !prev.space && !c.space && gap > c.size * 0.2)
        vis.push({ ...c, u: " ".repeat(gap > c.size * 2 ? Math.round(gap / (c.size * 0.25)) : 1), space: true, x0: prev.x1, x1: c.x0 });
      vis.push(c);
    }
    for (const c of vis) c.sup = !c.space && c.size < r.size * 0.8 && c.y > r.y + r.size * 0.2;
    for (const c of vis) c.underline = rects.some(q => q.x0 <= (c.x0 + c.x1) / 2 && q.x1 >= (c.x0 + c.x1) / 2 && q.y1 < c.y + 1 && q.y1 > c.y - c.size * 0.45);
    const rtl = vis.some(c => THAANA.test(c.u));
    const logical = rtl ? visualToLogical(vis) : vis;
    const ink = vis.filter(c => !c.space);
    return {
      y: r.y, size: r.size, rtl,
      x0: ink.length ? Math.min(...ink.map(c => c.x0)) : 0,
      x1: ink.length ? Math.max(...ink.map(c => c.x1)) : 0,
      maxGap: Math.max(0, ...vis.filter(c => c.space).map(c => c.x1 - c.x0)) / r.size,
      fonts: ink.map(c => c.fk),
      runs: mergeRuns(logical)
    };
  }).filter(l => l.runs.some(r => r.text.trim()));
}

// Right-to-left line: reverse the visual order, keeping embedded Latin/number runs (and the
// punctuation between their characters) left-to-right.
function visualToLogical(vis) {
  const isL = c => LTR_CHAR.test(c.u);
  const weak = c => /^[\/\-.,:%+&@_]$/.test(c.u);
  const out = [];
  let i = vis.length - 1;
  while (i >= 0) {
    if (isL(vis[i])) {
      let j = i;
      while (j - 1 >= 0 && (isL(vis[j - 1]) || (weak(vis[j - 1]) && j - 2 >= 0 && isL(vis[j - 2])) ||
        (vis[j - 1].space && j - 2 >= 0 && /[A-Za-z]/.test(vis[j].u) && /[A-Za-z]/.test(vis[j - 2].u)))) j--;
      for (let k = j; k <= i; k++) out.push({ ...vis[k], ltr: true });
      i = j - 1;
    } else {
      out.push(vis[i]);   // bracket glyphs already carry their logical character
      i--;
    }
  }
  return out;
}

function mergeRuns(cs) {
  const runs = [];
  for (const c of cs) {
    const key = [c.bold, c.italic, c.underline, c.sup, c.color, Math.round(c.size * 2), !!c.ltr || (!THAANA.test(c.u) && LTR_CHAR.test(c.u))].join("|");
    const last = runs[runs.length - 1];
    if (last && (last.key === key || (c.space && !c.underline))) last.text += c.u;
    else runs.push({ key, text: c.u, bold: c.bold, italic: c.italic, underline: c.underline, sup: c.sup, color: c.color,
      size: c.size, ltr: !!c.ltr || (!THAANA.test(c.u) && LTR_CHAR.test(c.u)), font: c.font });
  }
  return runs;
}

// ---- Fonts whose digits carry the wrong character codes ----
// Some PDFs (old non-Unicode Faruma subsets) give several different digit shapes the same code, so the
// numbers come out wrong. Such a font is recognised when, across the document, one digit code is drawn
// with different glyphs or one glyph is given different digit codes. Those digits are then read from the
// page image with number-only OCR, which is reliable for printed digits.
async function fixBrokenDigits(pages) {
  const byFont = {};
  for (const p of pages) for (const g of p.glyphs) if (/^[0-9]$/.test(g.u) && g.fk && g.fc) {
    const f = byFont[g.fk] || (byFont[g.fk] = { u2c: {}, c2u: {} });
    (f.u2c[g.u] = f.u2c[g.u] || new Set()).add(g.fc);
    (f.c2u[g.fc] = f.c2u[g.fc] || new Set()).add(g.u);
  }
  const bad = new Set(Object.entries(byFont).filter(([, f]) =>
    Object.values(f.u2c).some(s => s.size > 1) || Object.values(f.c2u).some(s => s.size > 1)).map(([k]) => k));
  if (!bad.size) return 0;
  pdfStatus("PDF ގައި ނަންބަރުތައް އޮޅިފައި ހުރުމުން، ނަންބަރުތައް ޞަފްޙާގެ ފޮޓޯއިން ކިޔަނީ…");
  if (!window.Tesseract) await loadScript(TESSERACT_LIB);
  const worker = await Tesseract.createWorker("eng");
  await worker.setParameters({ tessedit_char_whitelist: "0123456789", tessedit_pageseg_mode: "7" });
  const votes = {};   // one glyph shape is always the same digit: vote across all its occurrences
  try {
    for (const p of pages) {
      // Runs of adjacent digit glyphs from a broken font.
      const runs = [];
      for (const g of p.glyphs) {
        if (!(bad.has(g.fk) && /^[0-9]$/.test(g.u))) continue;
        const r = runs[runs.length - 1];
        if (r && Math.abs(r.y - g.y) < g.size * 0.3 && Math.abs(g.x0 - r.x1) < g.size * 0.35) { r.gs.push(g); r.x1 = Math.max(r.x1, g.x1); r.x0 = Math.min(r.x0, g.x0); }
        else runs.push({ y: g.y, size: g.size, x0: g.x0, x1: g.x1, gs: [g] });
      }
      if (!runs.length) continue;
      const vp = p.page.getViewport({ scale: 300 / 72 });
      const canvas = document.createElement("canvas");
      canvas.width = vp.width; canvas.height = vp.height;
      await p.page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
      for (const r of runs) {
        const [ax, ay] = vp.convertToViewportPoint(r.x0 - r.size * 0.15, r.y + r.size * 0.95);
        const [bx, by] = vp.convertToViewportPoint(r.x1 + r.size * 0.15, r.y - r.size * 0.3);
        const rect = { left: Math.max(0, Math.floor(Math.min(ax, bx))), top: Math.max(0, Math.floor(Math.min(ay, by))),
          width: Math.ceil(Math.abs(bx - ax)), height: Math.ceil(Math.abs(by - ay)) };
        // Recognise a small crop (scaled up, with a white border) rather than the whole page.
        const crop = document.createElement("canvas"), pad = 12;
        crop.width = rect.width + pad * 2; crop.height = rect.height + pad * 2;
        const cx = crop.getContext("2d");
        cx.fillStyle = "#fff"; cx.fillRect(0, 0, crop.width, crop.height);
        cx.drawImage(canvas, rect.left, rect.top, rect.width, rect.height, pad, pad, rect.width, rect.height);
        const { data } = await worker.recognize(crop);
        const digits = (data.text || "").replace(/[^0-9]/g, "");
        if (digits.length !== r.gs.length) continue;
        // OCR reads left to right; glyphs are matched by position.
        [...r.gs].sort((a, b) => a.x0 - b.x0).forEach((g, k) => {
          const v = votes[g.fk + "|" + g.fc] || (votes[g.fk + "|" + g.fc] = {});
          v[digits[k]] = (v[digits[k]] || 0) + 1;
        });
      }
    }
  } finally { await worker.terminate(); }
  let fixed = 0;
  for (const p of pages) for (const g of p.glyphs) {
    const v = bad.has(g.fk) && /^[0-9]$/.test(g.u) && votes[g.fk + "|" + g.fc];
    if (!v) continue;
    g.u = Object.entries(v).sort((a, b) => b[1] - a[1])[0][0];
    fixed++;
  }
  return fixed;
}

// ---- Fonts with no usable character codes (e.g. decorative titles where every letter reads as one character) ----
function brokenTextFonts(pages) {
  const byFont = {};
  for (const p of pages) for (const g of p.glyphs) if (THAANA.test(g.u) && !MARK.test(g.u) && g.fk && g.fc) {
    const f = byFont[g.fk] || (byFont[g.fk] = {});
    (f[g.u] = f[g.u] || new Set()).add(g.fc);
  }
  // A real font draws each letter with one glyph; many different glyphs behind one letter means the codes are lost.
  return new Set(Object.entries(byFont).filter(([, f]) => Object.values(f).some(s => s.size > 3)).map(([k]) => k));
}

// Lines drawn mostly in such a font are kept as an exact picture of the line.
async function imageBrokenLines(p, broken) {
  const hit = p.lines.filter(l => l.fonts && l.fonts.filter(k => broken.has(k)).length > l.fonts.length / 2);
  if (!hit.length) return;
  const vp = p.page.getViewport({ scale: 200 / 72 });
  const canvas = document.createElement("canvas");
  canvas.width = vp.width; canvas.height = vp.height;
  await p.page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
  for (const l of hit) {
    const x0 = l.x0 - l.size * 0.2, x1 = l.x1 + l.size * 0.2, yt = l.y + l.size * 1.1, yb = l.y - l.size * 0.45;
    const [ax, ay] = vp.convertToViewportPoint(x0, yt), [bx, by] = vp.convertToViewportPoint(x1, yb);
    const c = document.createElement("canvas");
    c.width = Math.ceil(Math.abs(bx - ax)); c.height = Math.ceil(Math.abs(by - ay));
    c.getContext("2d").drawImage(canvas, Math.min(ax, bx), Math.min(ay, by), c.width, c.height, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, "image/png"));
    l.image = { data: new Uint8Array(await blob.arrayBuffer()), w: x1 - x0, h: yt - yb };
  }
}

// ---- OCR for scanned pages ----

async function startOcr() {
  pdfStatus("OCR (ދިވެހި + English) ތައްޔާރުކުރަނީ… ފުރަތަމަ ފަހަރު ކުޑަކޮށް ލަސްވެދާނެ.");
  if (!window.Tesseract) await loadScript(TESSERACT_LIB);
  return Tesseract.createWorker(["div", "eng"]);
}

async function ocrPage(worker, page) {
  const viewport = page.getViewport({ scale: 200 / 72 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width; canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  const { data } = await worker.recognize(canvas);
  const jpeg = await new Promise(r => canvas.toBlob(r, "image/jpeg", 0.85));
  return {
    confidence: data.confidence || 0,
    paras: (data.paragraphs || []).map(p => p.text.replace(/\s+/g, " ").trim()).filter(Boolean),
    image: { data: new Uint8Array(await jpeg.arrayBuffer()), width: canvas.width, height: canvas.height }
  };
}

// ---- Writing the .docx ----

const TW = pt => Math.round(pt * 20);           // points → twips
const EMU = pt => Math.round(pt * 12700);       // points → EMU

async function saveDocx(pages, name) {
  const D = window.docx;
  const first = pages[0];
  const textPages = pages.filter(p => p.lines && p.lines.length);
  // Margins from the text block across all text pages.
  const all = textPages.flatMap(p => p.lines.map(l => ({ ...l, W: p.W, H: p.H })));
  // A few points of slack so Word's font metrics never push a PDF line onto two lines.
  const left = all.length ? Math.max(12, Math.min(...all.map(l => l.x0)) - 4) : 72;
  const right = all.length ? Math.max(12, Math.min(...all.map(l => l.W - l.x1)) - 4) : 72;
  const top = all.length ? Math.max(14, Math.min(...all.map(l => l.H - l.y - l.size))) : 72;
  const bottom = 14;
  const sections = [];
  pages.forEach((p, i) => {
    const children = [];
    if (p.pageImage) {
      const w = p.W - 2;
      children.push(new D.Paragraph({ children: [new D.ImageRun({ type: "jpg", data: p.pageImage.data,
        transformation: { width: Math.round(w * 96 / 72), height: Math.round(w * p.pageImage.height / p.pageImage.width * 96 / 72) } })] }));
      sections.push({ properties: { page: { size: { width: TW(p.W), height: TW(p.H) }, margin: { top: 0, bottom: 0, left: 0, right: 0, header: 0, footer: 0 } } }, children });
      return;
    }
    if (p.ocrParas) for (const s of p.ocrParas) children.push(plainPara(D, s));
    else children.push(...layoutPage(D, p, { left, right, top }));
    if (!children.length) children.push(new D.Paragraph({}));
    sections.push({ properties: { page: { size: { width: TW(p.W), height: TW(p.H) },
      margin: { top: TW(top), bottom: TW(bottom), left: TW(left), right: TW(right), header: TW(10), footer: TW(10) } } }, children });
  });
  if (!sections.length) sections.push({ children: [new D.Paragraph({})] });
  const blob = await D.Packer.toBlob(new D.Document({ styles: { default: { document: { run: { font: "Faruma" } } } }, sections }));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

function plainPara(D, s) {
  return new D.Paragraph({ bidirectional: THAANA.test(s), alignment: D.AlignmentType.BOTH,
    children: [new D.TextRun({ text: s, font: "Faruma", size: 24, rightToLeft: THAANA.test(s) })] });
}

function layoutPage(D, p, m) {
  const L = m.left, R = p.W - m.right, width = R - L;
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  // Group lines into paragraphs.
  const paras = [];
  for (const l of p.lines) {
    const cur = paras[paras.length - 1], prev = cur && cur.lines[cur.lines.length - 1];
    const gap = prev ? prev.y - l.y : 0;
    // Only a line that runs (almost) to the far margin and spans most of the width continues into the next.
    const prevFull = prev && prev.x1 - prev.x0 > width * 0.6 && (prev.rtl ? prev.x0 <= L + width * 0.06 : prev.x1 >= R - width * 0.06);
    // A continuation line starts where the previous one did, or (after an indented first line) at the margin.
    const sameStart = prev && (l.rtl ? near(l.x1, prev.x1, l.size * 1.5) || (l.x1 > prev.x1 && near(l.x1, R, l.size * 1.5))
                                     : near(l.x0, prev.x0, l.size * 1.5) || (l.x0 < prev.x0 && near(l.x0, L, l.size * 1.5)));
    const join = prev && prev.rtl === l.rtl && near(prev.size, l.size, 0.6) && gap > 0 && gap < l.size * 2.6 &&
      prevFull && sameStart && prev.maxGap < 2 && l.maxGap < 2 && !(cur.lineGap && !near(gap, cur.lineGap, l.size * 0.35));
    if (join) { cur.lines.push(l); cur.lineGap = cur.lineGap || gap; }
    else paras.push({ lines: [l], lineGap: 0, gapBefore: prev ? gap : null });
  }
  const out = [];
  let lastY = null;
  for (const para of paras) {
    const ls = para.lines, l0 = ls[0], rtl = l0.rtl, size = l0.size;
    const lineGap = para.lineGap || size * 1.5;
    const x0 = Math.min(...ls.map(l => l.x0)), x1 = Math.max(...ls.map(l => l.x1));
    const center = (l0.x0 + l0.x1) / 2;
    let alignment, indStart = 0, indEnd = 0, first = 0;
    const startEdge = l => rtl ? R - l.x1 : l.x0 - L;
    if (ls.length > 1) {
      alignment = D.AlignmentType.BOTH;
      const body = ls.slice(1);
      indStart = Math.max(0, Math.min(...body.map(startEdge)));
      indEnd = Math.max(0, rtl ? Math.min(...ls.slice(0, -1).map(l => l.x0 - L)) : Math.min(...ls.slice(0, -1).map(l => R - l.x1)));
      first = startEdge(l0) - indStart;
    } else if (near(center, (L + R) / 2, width * 0.04) && x1 - x0 < width * 0.85 && startEdge(l0) > size) {
      alignment = D.AlignmentType.CENTER;
    } else if (x1 - x0 < width * 0.5 && (rtl ? x0 - L < size && R - x1 > width * 0.3 : R - x1 < size && x0 - L > width * 0.3)) {
      alignment = rtl ? D.AlignmentType.LEFT : D.AlignmentType.RIGHT;     // short text on the far (end) side, e.g. signatures
    } else if (rtl ? x0 - L < width * 0.06 : R - x1 < width * 0.06) {
      alignment = D.AlignmentType.BOTH;                                    // a full line, possibly with a first-line indent
      indStart = Math.max(0, startEdge(l0));
    } else {
      alignment = rtl ? D.AlignmentType.RIGHT : D.AlignmentType.LEFT;
      indStart = Math.max(0, startEdge(l0));
    }
    const before = lastY === null ? Math.max(0, p.H - m.top - l0.y - size) : Math.max(0, (lastY - l0.y) - lineGap);
    lastY = ls[ls.length - 1].y;
    const children = [];
    let leader = false;
    ls.forEach((l, k) => {
      // Keep the PDF's own line breaks so every line holds exactly the same words (and pages do not overflow).
      if (k) children.push(new D.TextRun({ break: 1, font: "Faruma", size: Math.round(size * 2), rightToLeft: rtl }));
      if (l.image) { children.push(new D.ImageRun({ type: "png", data: l.image.data,
        transformation: { width: Math.round(l.image.w * 96 / 72), height: Math.round(l.image.h * 96 / 72) } })); return; }
      l.runs.forEach((r, j) => {
        // Drop the line's own leading/trailing spaces at line breaks.
        // Dot leaders (contents pages) become a tab with a dotted leader, so they always fit the line.
        let text = r.text.replace(/ *\.{6,} */g, () => { leader = true; return "\t"; });
        if (j === 0 && k) text = text.replace(/^ +/, "");
        if (j === l.runs.length - 1 && k < ls.length - 1) text = text.replace(/ +$/, "");
        if (!text) return;
        const base = { size: Math.round(r.size * 2), bold: r.bold || undefined, italics: r.italic || undefined,
          underline: r.underline ? {} : undefined, superScript: r.sup || undefined, color: r.color && r.color !== "000000" ? r.color : undefined };
        if (r.ltr) children.push(new D.TextRun({ ...base, text: "‎" + text + "‎", font: /times|palatino|georgia|cambria/i.test(r.font) ? "Times New Roman" : "Calibri" }));
        else for (const part of text.split(/([\[\]{}]+)/)) if (part) children.push(new D.TextRun({ ...base, text: part,
          // Faruma draws square and curly brackets as other shapes; they are set in Times New Roman.
          font: /^[\[\]{}]+$/.test(part) ? "Times New Roman" : "Faruma", rightToLeft: rtl }));
      });
    });
    out.push(new D.Paragraph({
      bidirectional: rtl, alignment, children,
      tabStops: leader ? [{ type: D.TabStopType.END, position: TW(width - indStart - indEnd - 2), leader: "dot" }] : undefined,
      indent: { start: TW(indStart), end: TW(indEnd), firstLine: first > 0 ? TW(first) : undefined, hanging: first < 0 ? TW(-first) : undefined },
      spacing: { before: TW(before), after: 0, line: TW(lineGap), lineRule: D.LineRuleType.EXACT }
    }));
  }
  // Images (logos, seals, signatures) at their PDF positions.
  if (p.images.length) {
    const runs = p.images.map(im => new D.ImageRun({ type: "png", data: im.data,
      transformation: { width: Math.round(im.w * 96 / 72), height: Math.round(im.h * 96 / 72) },
      floating: { horizontalPosition: { relative: D.HorizontalPositionRelativeFrom.PAGE, offset: EMU(im.x) },
        verticalPosition: { relative: D.VerticalPositionRelativeFrom.PAGE, offset: EMU(p.H - im.y) },
        allowOverlap: true, behindDocument: true, wrap: { type: D.TextWrappingType.NONE } } }));
    // Anchor them in a 1pt-high paragraph so they do not move the text.
    out.unshift(new D.Paragraph({ children: runs, spacing: { before: 0, after: 0, line: 20, lineRule: D.LineRuleType.EXACT } }));
  }
  return out;
}

// ---- Accurate conversion: scanned PDFs queued for the daily task, which reads every page and writes the .docx ----
// Storage bucket "convert" (admins only): queue/<name>.pdf → done/<name>.docx (or failed/<name>.pdf).

async function initAccurateConversion() {
  const panel = document.getElementById("accuratePanel");
  if (typeof sb === "undefined" || !sb) { panel.hidden = true; return; }
  const { data } = await sb.auth.getSession();
  if (!data.session) { document.getElementById("accSignedOut").hidden = false; return; }
  document.getElementById("accSignedIn").hidden = false;
  const input = document.getElementById("accFile"), btn = document.getElementById("accSendBtn");
  input.addEventListener("change", () => {
    const f = input.files[0];
    document.getElementById("accFileName").textContent = f ? f.name : "";
    btn.disabled = !f;
  });
  btn.addEventListener("click", async () => {
    const f = input.files[0];
    if (!f) return;
    btn.disabled = true;
    const status = document.getElementById("accStatus");
    const say = (msg, kind) => { status.textContent = msg; status.className = `status show ${kind}`; };
    try {
      if (f.size > 50 * 1024 * 1024) throw new Error("50MB އަށްވުރެ ބޮޑު");
      const base = f.name.toLowerCase().replace(/\.pdf$/, "").replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "document";
      const name = `${base}-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}.pdf`;
      say("ފޮނުވަނީ…", "info");
      const { error } = await sb.storage.from("convert").upload(`queue/${name}`, f, { contentType: "application/pdf", upsert: false });
      if (error) throw error;
      say("ފޮނުވިއްޖެ. މާދަމާ ހެނދުނު ނިމިގެން ތިރީގައިވާ ލިސްޓުގައި ފެންނާނެ.", "ok");
      input.value = ""; document.getElementById("accFileName").textContent = "";
      loadAccurateList();
    } catch (e) { say("ނުފޮނުވުނު: " + e.message, "err"); btn.disabled = false; }
  });
  loadAccurateList();
}

async function loadAccurateList() {
  const box = document.getElementById("accList");
  const list = async folder => {
    const { data, error } = await sb.storage.from("convert").list(folder, { limit: 200, sortBy: { column: "created_at", order: "desc" } });
    if (error) throw error;
    return (data || []).filter(f => f.id).map(f => ({ ...f, folder }));
  };
  try {
    const [done, queue, failed] = await Promise.all([list("done"), list("queue"), list("failed")]);
    const row = (f, label, kind) => `<li class="acc-row"><span dir="ltr">${esc(f.name)}</span>
      <span class="hint">${label}</span>
      ${kind === "done" ? `<button class="btn" data-get="${esc(f.name)}" type="button">⬇ Download</button>` : ""}
      ${kind !== "queue" ? `<button class="btn btn-outline" data-del="${esc(f.folder + "/" + f.name)}" type="button">ފޮހެލާ</button>` : ""}</li>`;
    const items = [
      ...done.map(f => row(f, "ނިމިފައި", "done")),
      ...queue.map(f => row(f, "ބަދަލުކުރުމަށް އިންތިޒާރުގައި (މާދަމާ ހެނދުނު)", "queue")),
      ...failed.map(f => row(f, "ކިޔޭނެ ގޮތެއް ނުވި", "failed"))
    ];
    box.innerHTML = items.length ? `<ul class="acc-list">${items.join("")}</ul>` : `<p class="hint">އަދި އެއްވެސް ފައިލެއް ނެތް.</p>`;
    box.querySelectorAll("[data-get]").forEach(b => b.onclick = async () => {
      const { data, error } = await sb.storage.from("convert").download("done/" + b.dataset.get);
      if (error) return alert(error.message);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(data); a.download = b.dataset.get;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    });
    box.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => {
      if (!confirm("މި ފައިލް ފޮހެލަންތަ؟")) return;
      const { error } = await sb.storage.from("convert").remove([b.dataset.del]);
      if (error) return alert(error.message);
      loadAccurateList();
    });
  } catch (e) { box.innerHTML = `<p class="status show err">${esc(e.message)}</p>`; }
}
