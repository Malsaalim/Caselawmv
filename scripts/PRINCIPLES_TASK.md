# Daily task: legal principles from court judgments

Repository: https://github.com/Malsaalim/Caselawmv (branch `main`).
Judgment PDFs are uploaded by the site owner through the admin panel into the Supabase Storage bucket `inbox`, and new Supreme Court judgments
are sent there automatically by `tools/court-fetcher/fetch_sc.py`, which runs on the owner's computer at 05:15 (the court's
PDF server blocks cloud servers). Those files keep the court's own PDF file name, so step 3.1 matches them to `data/sc-judgments.json`.
New Civil Court decisions are listed daily in `data/civil-judgments.json` by `scripts/sync_civil.py` (a GitHub Actions
workflow, 04:31 Maldives time); entries with `"eligible": true` are final judgments that are not routine debt-enforcement,
banking or hire-purchase claims. Their PDFs download directly from civilcourt.gov.mv.
The environment must provide `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for the inbox; never print or commit the key.
Your job each run: turn every PDF in the inbox, and the waiting Civil Court decisions, into legal-principles entries,
publish them, and clear the inbox.

## Steps

1. Clone the repo (shallow is fine) and set the commit identity to `Claude <noreply@anthropic.com>`.
2. Collect the PDFs to process:
   1. **Inbox.** Run `python scripts/supabase_inbox.py download /tmp/inbox`. If `SUPABASE_URL` or
      `SUPABASE_SERVICE_ROLE_KEY` is missing, skip the inbox, say so in the report, and carry on.
   2. **Civil Court.** From `data/civil-judgments.json` take the entries with `"eligible": true` whose `id` is not yet in
      `data/sc-principles.json`, newest first. Download each `pdf` with `curl -sSL -o /tmp/civil/<id>.pdf "<pdf>"` and
      check the file starts with `%PDF`.
   If there is nothing in either, stop: report "nothing to process" and make no commit.

   **Priority.** Supreme Court and High Court judgments come first, always:
   - Process every inbox PDF before any Civil Court decision, in this order: Supreme Court judgments, then High Court
     judgments, then any other inbox PDF. Never leave a Supreme Court or High Court judgment for a later run to make
     room for Civil Court work.
   - Civil Court decisions only fill what is left of the run: at most `10 − (number of inbox PDFs processed)`, and none
     when 10 or more inbox PDFs were processed. The rest wait for the next run.
3. For each PDF:
   1. **Match it to a judgment.** Compare the file name (lower-case) with the last path segment of `pdf`
      in `data/sc-judgments.json`. A match gives you `id`, `citation`, `caseNo`, `title`, `titleEn`,
      `date`, `category`, `url`, `pdf`. If there is no match, take case number, parties and date from the
      PDF itself and use `"id": "upload-<file name without .pdf>"`, `"url": ""`, `"pdf": ""`.
      **Civil Court files** come with their entry from `data/civil-judgments.json`: use its `id`, `date` and `pdf`;
      `"court": "ސިވިލް ކޯޓު"` (this puts it in the Civil Court tab); `"citation": ""`; `"url": ""`;
      `caseNo` exactly as the judgment itself writes it (e.g. `2933/Cv-C/2025`); `title` = the parties as the
      judgment names them (`<plaintiff> ވ. <defendant>`); `titleEn` = the same in English letters; `category` = the
      entry's `subject`. A Civil Court decision is not an appeal, so `facts` ends with the Civil Court's decision.
   2. **Read the whole judgment.** Try `pdftotext -layout`. If the Thaana text comes out empty, garbled
      or in a legacy (non-Unicode) font, render pages with `pdftoppm -r 110 -png` and read the page images.
      **Scanned PDFs** (no text layer — all Civil Court decisions; `pdffonts` lists no fonts): render at
      `pdftoppm -r 200 -png`, cut each page into top and bottom halves, and read the images yourself, page by page.
      Do not use OCR tools (Tesseract and similar garble this italic Thaana). If a word is genuinely illegible, leave
      it out rather than guess; skip the decision only if its holding cannot be read.
      Read every page — the holding is usually near the end.
   3. **Write the entry in Dhivehi (Thaana script)**, in three parts:
      - `facts`: a short summary of the case, court by court. Paragraphs are separated by a blank line; a paragraph
        starting with `### ` is a sub-heading; a paragraph of numbered lines (`1. …`) shows as a list. In order:
        1. `### މައްސަލައިގެ ޙަޤީޤަތްތައް`: who the parties are and what happened between them (short).
        2. One sub-heading per lower court, with its case number (e.g. `### ސިވިލް ކޯޓު (2293/Cv-C/2017)`):
           magistrate, Civil, Criminal, Family, Juvenile, Drug court or tribunal: what was claimed/charged and what it decided.
        3. `### ހައިކޯޓު (<case no>)` if the High Court heard it: who appealed, the grounds of appeal and the
           High Court's decision on them. If the judgment does not set out the High Court grounds, say so; do not guess.
        4. `### ސުޕްރީމް ކޯޓު (<case no>)` if this is a Supreme Court decision: each ground of appeal as a numbered
           point followed by the Court's decision on that ground, then a closing line with the bench and the result.
        If the case was not an appeal, stop at the court that decided it.
      - `body`: the legal principles the judges relied on to decide the case, as points, one per line, numbered
        (`1. …`), **no more than 20 lines**. Include the principles the Court laid down or applied (ratio decidendi),
        naming the Article / Act / section where the judgment does (e.g. ޤާނޫނުއަސާސީގެ 42 ވަނަ މާއްދާ), **and** the
        principles taken from binding decisions of higher courts that the judges relied on, naming each case and its
        number in the point (e.g. `… ޢަބްދުލް މަޖީދު ވ. މާލޭ ސިޓީ ކައުންސިލް (2015/SC-A/08) ގެ މަތިން …`). No facts here.
      - **Language.** Write in correct, formal written Dhivehi (ލިޔުމުގެ ބަސް), in the same style as the uploaded report.
        Wherever the report already states a fact, a ground of appeal, a lower court's reasoning or a principle, reuse the
        report's own sentence (shortened only by dropping clauses), rather than paraphrasing it in your own words.
        Use the report's own terms and spellings for names, places, dates, months, amounts and legal terms
        (e.g. ޑރ. އަލަކާ ސިންގް, އިންޑިޔާ, ތަންފީޒު / ތަންފީޛު as the report has it, 400،000 އެމެރިކާ ޑޮލަރު, ''…'' quotation marks).
        Every sentence must be complete and grammatical, ending with the proper ending (…އެވެ / …ނެވެ / …ކަމަށެވެ);
        no fragments, no "X: Y" shorthand. Lists that mirror the report's lists end each item with `؛` and the last with
        `؛ މިއެވެ.` as the report does. Use `،` as the comma. Re-read every sentence against the page images before saving.
      - **Cite every court decision exactly as the uploaded report writes it** — Supreme Court, High Court or any
        other court, and the case under appeal itself — in `facts`, `body` and `precedents`: copy the report's own
        wording of the case name and its number/citation (main text and footnote), character for character.
        Do not shorten, translate, re-order or re-format it. For example, if the report says
        `ސުޕްރީމް ކޯޓުން ނިންމާފައިވާ ޢަބްދުލް މަޖީދު ވ. މާލޭ ސިޓީ ކައުންސިލް ޤަޟިއްޔާ` with the footnote
        `ސުޕްރީމް ކޯޓުގެ ނަންބަރު 2015/SC-A/08 ޤަޟިއްޔާ`, write exactly that; court sub-headings in `facts` likewise
        (e.g. `### ސިވިލް ކޯޓުގެ ނަންބަރު 2293/Cv-C/2017 ޤަޟިއްޔާ`). Laws are cited the same way
        (e.g. `ޤާނޫނު ނަންބަރު 4/91 (ކޮންޓްރެކްޓާބެހޭ ޤާނޫނު)`). Check spellings against the page images.
      - `precedents`: every earlier court decision the judgment cites (main text and footnotes), one object each:
        `name` (the case name exactly as the report's text gives it), `reference` (the case number/citation exactly
        as the report's footnote or text gives it), `citation` (e.g. `[2021] SC 51`, or `""`), `caseNo`
        (e.g. `2016/SC-A/16`), `court`, `parties` (both parties as named; if the judgment names only one, say so;
        note when the case was cited by a party rather than the Court), and `principles`: the principles that
        case decided, **as stated in this judgment**, numbered one per line. Use `[]` if no case is cited.
        Statutes, books, fatwa bodies and foreign restatements are not precedents; mention them in `body` if relevant.
      - `summary`: one sentence giving the core holding.
      - Never invent a fact, principle, article number, case number, party or holding. If part of the text is
        unreadable, or the judgment does not say something (e.g. the other party's name), write only what you can verify.
   4. **Add the entry** to `data/sc-principles.json` (a JSON array; keep UTF-8, `ensure_ascii=False`,
      indent 1). Insert it at the top of the array, and replace any existing entry with the same `id`.
      The site lists legal principles newest-first by `added` (the UTC time the entry was written). Shape:

      ```json
      {
       "id": "<judgment id>",
       "citation": "[2026] SC 37",
       "caseNo": "2023/SC-A/13",
       "title": "<Dhivehi case title>",
       "titleEn": "<English case title>",
       "date": "2026-10-11",
       "court": "ސުޕްރީމް ކޯޓު",
       "category": "<Dhivehi category>",
       "url": "<official judgment page>",
       "pdf": "<official PDF URL>",
       "summary": "<one Dhivehi sentence>",
       "facts": "<paragraph>\n\n<paragraph>",
       "body": "1. …\n2. …",
       "precedents": [
        {"name": "…", "reference": "…", "citation": "…", "caseNo": "…", "court": "…", "parties": "…", "principles": "1. …\n2. …"}
       ],
       "processed": "<YYYY-MM-DD>",
       "added": "<YYYY-MM-DDTHH:MM:SSZ, current UTC time>"
      }
      ```
   5. After the commit in step 5 is pushed, remove the PDF from the inbox with
      `python scripts/supabase_inbox.py remove <name>`. If a PDF truly cannot be read, run
      `python scripts/supabase_inbox.py fail <name>` instead and say why in the commit message.
      For a Civil Court decision there is nothing to remove; if its PDF truly cannot be read (or is not a judgment),
      add `"skip": "<reason>"` to its entry in `data/civil-judgments.json` so it is not picked again.
4. Validate: `data/sc-principles.json` (and `data/civil-judgments.json` if changed) parses as JSON, every `body` has at most 20 lines and every line of it
   starts with a number, and every entry has `facts` and a `precedents` list.
5. Commit once ("Add legal principles: <citations / case numbers>"), `git pull --rebase origin main`, push to `main`.
6. Report which cases were published and any failures.

## Accurate conversions (scanned PDF → .docx)

The owner can queue PDFs on the "PDF to Doc Scan" page for accurate conversion — usually scanned Dhivehi documents
(e.g. Civil Court decisions) that OCR cannot read. They wait in the Supabase Storage bucket `convert` under `queue/`.
Process them after the inbox and **before** Civil Court decisions; they do not count toward the 10-judgment limit.
At most 40 pages per run (the rest wait for the next run). Needs the same Supabase variables as the inbox.

1. `python scripts/supabase_convert.py download /tmp/convert` (prints each downloaded file).
2. For each PDF `NAME.pdf`: `pdfinfo` for the page size (points), then render
   `pdftoppm -r 200 -png /tmp/convert/NAME.pdf /tmp/convert/NAME/page` (images `page-01.png`, `page-02.png`, … —
   or `page-1.png` for fewer than 10 pages; `scripts/make_docx.py` accepts both).
3. **Read every page yourself**, top half and bottom half separately (crop with PIL), at full resolution. Transcribe the
   text **exactly as printed**: every word, letter, fili, number, date, ID, punctuation mark, quotation mark and bracket,
   in the document's own spelling. Do not correct, translate, summarise, reorder or skip anything; do not guess — if a
   word is truly illegible write `[…]`. Check every number twice against the image.
4. Write `/tmp/convert/NAME.json` in the format described at the top of `scripts/make_docx.py`, one entry per PDF page:
   - `size` from pdfinfo; `margins` from where the text block sits on the page.
   - One block per paragraph, heading or line group, in reading order: `align` as on the page (`justify` for body
     text, `right` for Dhivehi lines starting at the right margin, `center`, `left`), `size` matching the printed size
     (body text is usually 13–14pt, footnotes 9–10pt), `bold`/`underline` for headings, `before` for the vertical gap,
     `indent` for indented paragraphs. Use `**…**`, `__…__`, `^^…^^` for bold, underlined and superscript words inside a line.
   - Keep the page's own line breaks (`\n`) only where the page has a hard break (headings, addresses, list items,
     signature blocks, header/footer lines); let justified body paragraphs wrap on their own.
   - Tables as `table` blocks; logos, seals, stamps and signatures as `image` crops (fractions of the page image).
5. `python scripts/make_docx.py /tmp/convert/NAME.json /tmp/convert/NAME.docx --pages /tmp/convert/NAME`, then render it
   (`soffice --headless --convert-to pdf`) and compare each page with the original image; fix the JSON and rebuild until
   the text matches exactly and every page breaks where the original does.
6. `python scripts/supabase_convert.py done NAME.pdf /tmp/convert/NAME.docx` (uploads `done/NAME.docx` and removes the
   queued PDF). If the PDF truly cannot be read, `python scripts/supabase_convert.py fail NAME.pdf`.
7. Mention each converted file (name and page count) in the report. Conversions make no commit to the repository.
