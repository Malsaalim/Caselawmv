# Daily task: legal principles from uploaded Supreme Court judgments

Repository: https://github.com/Malsaalim/Caselawmv (branch `main`).
Judgment PDFs are uploaded by the site owner through the admin panel into the Supabase Storage bucket `inbox`, and new Supreme Court judgments
are sent there automatically by `tools/court-fetcher/fetch_sc.py`, which runs on the owner's computer at 05:15 (the court's
PDF server blocks cloud servers). Those files keep the court's own PDF file name, so step 3.1 matches them to `data/sc-judgments.json`.
The environment must provide `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; never print or commit the key.
Your job each run: turn every PDF in the inbox into a legal-principles entry, publish it, and clear the inbox.

## Steps

1. Clone the repo (shallow is fine) and set the commit identity to `Claude <noreply@anthropic.com>`.
2. Run `python scripts/supabase_inbox.py download /tmp/inbox` to fetch the waiting PDFs. If there are none, stop: report "nothing to process" and make no commit.
3. For each PDF:
   1. **Match it to a judgment.** Compare the file name (lower-case) with the last path segment of `pdf`
      in `data/sc-judgments.json`. A match gives you `id`, `citation`, `caseNo`, `title`, `titleEn`,
      `date`, `category`, `url`, `pdf`. If there is no match, take case number, parties and date from the
      PDF itself and use `"id": "upload-<file name without .pdf>"`, `"url": ""`, `"pdf": ""`.
   2. **Read the whole judgment.** Try `pdftotext -layout`. If the Thaana text comes out empty, garbled
      or in a legacy (non-Unicode) font, render pages with `pdftoppm -r 110 -png` and read the page images.
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
4. Validate: `data/sc-principles.json` parses as JSON, every `body` has at most 20 lines and every line of it
   starts with a number, and every entry has `facts` and a `precedents` list.
5. Commit once ("Add legal principles: <citations>"), `git pull --rebase origin main`, push to `main`.
6. Report which cases were published and any failures.
