// PDF to Doc Scan: converts a PDF into a right-to-left .docx in the browser.
// Pages with a text layer are read directly; scanned pages (or all pages, if asked) go through OCR.
const PDFJS_LIB = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const TESSERACT_LIB = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
const THAANA = /[\u0780-\u07BF]/;
const OCR_MIN_CONFIDENCE = 70;

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
      const paras = forceOcr ? [] : textLayerParagraphs(await page.getTextContent());
      if (forceOcr || paras.join("").replace(/\s/g, "").length < 20) {
        pdfStatus(`ޞަފްޙާ ${n} / ${pdf.numPages}: OCR ކުރަނީ…`);
        ocr = ocr || await startOcr();
        const r = await ocrPage(ocr, page);
        // Low-confidence OCR (e.g. italic Thaana scans) is unusable; keep the page image instead.
        if (r.confidence >= OCR_MIN_CONFIDENCE) { pages.push({ paras: r.paras }); ocrPages++; }
        else { pages.push({ paras: [], image: r.image }); imagePages++; }
      } else {
        pdfStatus(`ޞަފްޙާ ${n} / ${pdf.numPages}: ލިޔުން ނަގަނީ…`);
        pages.push({ paras });
      }
    }
  } finally { if (ocr) await ocr.terminate(); }
  pdfProgress(pdf.numPages, pdf.numPages);
  const name = file.name.replace(/\.pdf$/i, "") + ".docx";
  await saveDocx(pages, name);
  pdfStatus(`ނިމިއްޖެ: ${name} ޑައުންލޯޑް ކުރެވިއްޖެ (${pdf.numPages} ޞަފްޙާ` +
    (ocrPages ? `، ${ocrPages} ޞަފްޙާ OCR އިން` : "") +
    (imagePages ? `، ${imagePages} ޞަފްޙާގެ ލިޔުން OCR އިން ރަނގަޅަށް ނުކިޔުނުތީ ޞަފްޙާގެ ފޮޓޯ` : "") +
    `). ބޭނުންކުރުމުގެ ކުރިން PDF އާ އަޅާކިޔައި ބައްލަވާ.`, "ok");
}

// Group text items into lines by baseline, order each line by reading direction,
// then join lines into paragraphs where the vertical gap is small.
function textLayerParagraphs(content) {
  const items = content.items.filter(i => i.str && i.str.trim());
  const lines = [];
  for (const it of items) {
    const x = it.transform[4], y = it.transform[5], h = Math.abs(it.transform[3]) || it.height || 10;
    let line = lines.find(l => Math.abs(l.y - y) < h * 0.5);
    if (!line) lines.push(line = { y, h, parts: [] });
    line.parts.push({ x, w: it.width, s: it.str });
  }
  lines.sort((a, b) => b.y - a.y);
  const text = lines.map(l => {
    const rtl = l.parts.some(p => THAANA.test(p.s));
    l.parts.sort((a, b) => rtl ? (b.x + b.w) - (a.x + a.w) : a.x - b.x);
    // Inside a right-to-left line, keep runs of Latin/number pieces (case numbers etc.) left-to-right.
    if (rtl) for (let i = 0; i < l.parts.length; i++) {
      let j = i;
      while (j < l.parts.length && !THAANA.test(l.parts[j].s) && /[0-9A-Za-z\/\-.,()\[\]]/.test(l.parts[j].s)) j++;
      if (j - i > 1) l.parts.splice(i, j - i, ...l.parts.slice(i, j).sort((a, b) => a.x - b.x));
      i = Math.max(i, j - 1);
    }
    let out = "", prev = null;
    for (const p of l.parts) {
      if (prev) {
        const gap = rtl ? prev.x - (p.x + p.w) : p.x - (prev.x + prev.w);
        // Thaana vowel signs (fili) often come as separate items; never split them from their letter.
        if (gap > l.h * 0.15 && !/\s$/.test(out) && !/^[\s\u07A6-\u07B0]/.test(p.s)) out += " ";
      }
      out += p.s; prev = p;
    }
    // A vowel sign never starts a word: re-attach any that ended up after a space.
    out = out.replace(/\s+/g, " ").replace(/([\u0780-\u07A5]) ([\u07A6-\u07B0])/g, "$1$2");
    return { y: l.y, h: l.h, s: out.trim() };
  }).filter(l => l.s);
  const paras = [];
  let cur = null;
  for (const l of text) {
    if (cur && cur.lastY - l.y < l.h * 2.6 && !/^(\d+[\.\-]|•|-\s)/.test(l.s)) { cur.s += " " + l.s; cur.lastY = l.y; }
    else { cur = { s: l.s, lastY: l.y }; paras.push(cur); }
  }
  return paras.map(p => p.s);
}

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
  const jpeg = await new Promise(r => canvas.toBlob(r, "image/jpeg", 0.8));
  return {
    confidence: data.confidence || 0,
    paras: (data.paragraphs || []).map(p => p.text.replace(/\s+/g, " ").trim()).filter(Boolean),
    image: { data: new Uint8Array(await jpeg.arrayBuffer()), width: canvas.width, height: canvas.height }
  };
}

async function saveDocx(pages, name) {
  const { Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, PageBreak } = window.docx;
  const LTR_RUN = /[A-Za-z0-9][A-Za-z0-9\/\-.,:()\[\]@&%+]*(?:\s+[A-Za-z0-9][A-Za-z0-9\/\-.,:()\[\]@&%+]*)*/g;
  const runs = s => {
    const out = []; let last = 0;
    for (const m of s.matchAll(LTR_RUN)) {
      if (m.index > last) out.push(new TextRun({ text: s.slice(last, m.index), font: "Faruma", size: 24, rightToLeft: true }));
      out.push(new TextRun({ text: "‎" + m[0] + "‎", font: "Calibri", size: 22 }));
      last = m.index + m[0].length;
    }
    if (last < s.length) out.push(new TextRun({ text: s.slice(last), font: "Faruma", size: 24, rightToLeft: true }));
    return out;
  };
  const children = [];
  pages.forEach(({ paras, image }, i) => {
    const brk = i ? [new PageBreak()] : [];
    if (image) {
      const w = 600;  // fits an A4 page inside the default margins
      children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [...brk,
        new ImageRun({ type: "jpg", data: image.data, transformation: { width: w, height: Math.round(w * image.height / image.width) } })] }));
      return;
    }
    paras.forEach((s, j) => children.push(new Paragraph({
      children: [...(!j ? brk : []), ...runs(s)],
      bidirectional: THAANA.test(s), alignment: AlignmentType.BOTH, spacing: { after: 160, line: 300 }
    })));
    if (!paras.length) children.push(new Paragraph({ children: brk }));
  });
  const blob = await Packer.toBlob(new Document({ sections: [{ children }] }));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
