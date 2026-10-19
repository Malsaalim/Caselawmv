"""Build a right-to-left .docx from a page-by-page transcription (used for accurate conversion of scanned PDFs).

Usage:
  python scripts/make_docx.py SPEC.json OUT.docx [--pages DIR]

SPEC.json:
{
 "pages": [
  {"size": [595, 842],                  # page width, height in points (optional; default A4)
   "margins": [54, 54, 40, 54],          # top, right, bottom, left in points (optional)
   "blocks": [
     {"text": "…", "align": "justify", "size": 14, "bold": false, "underline": false,
      "indent": 0, "before": 6},          # one paragraph; "\n" inside text = the PDF's own line break
     {"image": [0.40, 0.03, 0.60, 0.12], "width": 90},   # crop of the page image (x0, y0, x1, y1 as fractions),
                                                          # e.g. a logo, seal or signature; width in points
     {"table": [["cell", "cell"], ["…", "…"]], "size": 12, "widths": [200, 300]}
   ]}
 ]
}
Inline marks inside text: **bold**, __underline__, ^^superscript^^.
align: justify | right | center | left (for Dhivehi, "right" is the start side).
--pages DIR: folder with the page images page-01.png, page-02.png, … (needed for "image" blocks).
"""
import json, re, sys
from pathlib import Path
from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt

THAANA = re.compile(r"[ހ-޿]")
ALIGN = {"justify": WD_ALIGN_PARAGRAPH.JUSTIFY, "right": WD_ALIGN_PARAGRAPH.RIGHT,
         "center": WD_ALIGN_PARAGRAPH.CENTER, "left": WD_ALIGN_PARAGRAPH.LEFT}
MARKS = re.compile(r"(\*\*.+?\*\*|__.+?__|\^\^.+?\^\^)")
LATIN = re.compile(r"([A-Za-z0-9][A-Za-z0-9/\-.,:()\[\]%+&@ ]*[A-Za-z0-9)\]]|[A-Za-z0-9]|[\[\]{}]+)")


def set_bidi(p, on):
    ppr = p._p.get_or_add_pPr()
    if on:
        ppr.insert(0, OxmlElement("w:bidi"))


def set_align(p, align, rtl):
    # In right-to-left paragraphs "left"/"right" are read differently by Word versions; start/end are not.
    if rtl and align in ("right", "left"):
        jc = OxmlElement("w:jc"); jc.set(qn("w:val"), "start" if align == "right" else "end")
        p._p.get_or_add_pPr().append(jc)
    else:
        p.alignment = ALIGN.get(align)


def style_run(run, text, size, bold, underline, sup, rtl):
    run.text = text
    rpr = run._r.get_or_add_rPr()
    fonts = OxmlElement("w:rFonts")
    for k in ("w:ascii", "w:hAnsi"):
        fonts.set(qn(k), "Times New Roman")
    # Neutral characters in a right-to-left paragraph use the complex-script font, so left-to-right runs
    # (Latin, numbers, brackets) get Times New Roman there too.
    fonts.set(qn("w:cs"), "Faruma" if rtl or THAANA.search(text) else "Times New Roman")
    rpr.append(fonts)
    if bold:
        rpr.append(OxmlElement("w:b")); rpr.append(OxmlElement("w:bCs"))
    if underline:
        u = OxmlElement("w:u"); u.set(qn("w:val"), "single"); rpr.append(u)
    if sup:
        v = OxmlElement("w:vertAlign"); v.set(qn("w:val"), "superscript"); rpr.append(v)
    for tag in ("w:sz", "w:szCs"):
        e = OxmlElement(tag); e.set(qn("w:val"), str(round(size * 2))); rpr.append(e)
    if rtl:
        rpr.append(OxmlElement("w:rtl"))


def add_text(p, text, size, bold, underline, rtl_para):
    lines = text.split("\n")
    for i, line in enumerate(lines):
        if i:
            p.add_run().add_break(WD_BREAK.LINE)
        for seg in MARKS.split(line):
            if not seg:
                continue
            b, u, sup = bold, underline, False
            while True:   # marks may be nested, e.g. **__heading__**
                if seg.startswith("**") and seg.endswith("**") and len(seg) > 4: seg, b = seg[2:-2], True
                elif seg.startswith("__") and seg.endswith("__") and len(seg) > 4: seg, u = seg[2:-2], True
                elif seg.startswith("^^") and seg.endswith("^^") and len(seg) > 4: seg, sup = seg[2:-2], True
                else: break
            # Latin, numbers and brackets go in left-to-right runs (Faruma draws [ ] { } as other shapes).
            for part in LATIN.split(seg):
                if part:
                    ltr = bool(LATIN.fullmatch(part))
                    style_run(p.add_run(), part, size, b, u, sup, rtl_para and not ltr)


def page_image(pages_dir, n):
    for name in (f"page-{n:02d}.png", f"page-{n}.png", f"p-{n:02d}.png"):
        f = Path(pages_dir) / name
        if f.exists():
            return f
    raise SystemExit(f"page image for page {n} not found in {pages_dir}")


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    spec = json.loads(Path(sys.argv[1]).read_text("utf-8"))
    out = Path(sys.argv[2])
    pages_dir = sys.argv[sys.argv.index("--pages") + 1] if "--pages" in sys.argv else None
    doc = Document()
    for n, page in enumerate(spec["pages"], 1):
        sec = doc.sections[0] if n == 1 else doc.add_section(WD_SECTION.NEW_PAGE)
        w, h = page.get("size", [595, 842])
        top, right, bottom, left = page.get("margins", [54, 54, 40, 54])
        sec.page_width, sec.page_height = Pt(w), Pt(h)
        sec.top_margin, sec.right_margin, sec.bottom_margin, sec.left_margin = Pt(top), Pt(right), Pt(bottom), Pt(left)
        sec.header_distance = sec.footer_distance = Pt(10)
        for blk in page.get("blocks", []):
            if "image" in blk:
                from PIL import Image
                x0, y0, x1, y1 = blk["image"]
                img = Image.open(page_image(pages_dir, n))
                W, H = img.size
                crop = img.crop((int(x0 * W), int(y0 * H), int(x1 * W), int(y1 * H)))
                tmp = out.with_suffix(f".p{n}.{len(doc.paragraphs)}.png")
                crop.save(tmp)
                p = doc.add_paragraph()
                p.alignment = ALIGN.get(blk.get("align", "center"))
                p.add_run().add_picture(str(tmp), width=Pt(blk.get("width", (x1 - x0) * w)))
                tmp.unlink()
                continue
            if "table" in blk:
                rows = blk["table"]
                t = doc.add_table(rows=len(rows), cols=max(len(r) for r in rows))
                t.style = "Table Grid"
                rtl = any(THAANA.search(c) for r in rows for c in r)
                if rtl:
                    tpr = t._tbl.tblPr
                    bv = OxmlElement("w:bidiVisual"); tpr.append(bv)
                for i, r in enumerate(rows):
                    for j, c in enumerate(r):
                        cell = t.cell(i, j)
                        if blk.get("widths"):
                            cell.width = Pt(blk["widths"][j])
                        p = cell.paragraphs[0]
                        set_bidi(p, bool(THAANA.search(c)))
                        set_align(p, "right" if THAANA.search(c) else "left", bool(THAANA.search(c)))
                        add_text(p, c, blk.get("size", 12), blk.get("bold", False), False, bool(THAANA.search(c)))
                continue
            text = blk.get("text", "")
            rtl = bool(THAANA.search(text))
            p = doc.add_paragraph()
            set_bidi(p, rtl)
            set_align(p, blk.get("align", "justify" if rtl else "left"), rtl)
            fmt = p.paragraph_format
            fmt.space_before, fmt.space_after = Pt(blk.get("before", 0)), Pt(blk.get("after", 4))
            if blk.get("indent"):
                # For a right-to-left paragraph the start (right) side is indented.
                if rtl: fmt.right_indent = Pt(blk["indent"])
                else: fmt.left_indent = Pt(blk["indent"])
            if blk.get("line"):
                fmt.line_spacing = Pt(blk["line"])
            add_text(p, text, blk.get("size", 14), blk.get("bold", False), blk.get("underline", False), rtl)
    doc.save(out)
    print(out)


if __name__ == "__main__":
    main()
