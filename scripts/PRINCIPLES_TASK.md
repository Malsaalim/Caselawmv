# Daily task: legal principles from uploaded Supreme Court judgments

Repository: https://github.com/Malsaalim/Caselawmv (branch `main`).
Judgment PDFs are uploaded by the site owner through the admin panel into `inbox/`.
Your job each run: turn every PDF in `inbox/` into a legal-principles entry, publish it, and clear the inbox.

## Steps

1. Clone the repo (shallow is fine) and set the commit identity to `Claude <noreply@anthropic.com>`.
2. List `inbox/*.pdf`. If there are none, stop: report "nothing to process" and make no commit.
3. For each PDF:
   1. **Match it to a judgment.** Compare the file name (lower-case) with the last path segment of `pdf`
      in `data/sc-judgments.json`. A match gives you `id`, `citation`, `caseNo`, `title`, `titleEn`,
      `date`, `category`, `url`, `pdf`. If there is no match, take case number, parties and date from the
      PDF itself and use `"id": "upload-<file name without .pdf>"`, `"url": ""`, `"pdf": ""`.
   2. **Read the whole judgment.** Try `pdftotext -layout`. If the Thaana text comes out empty, garbled
      or in a legacy (non-Unicode) font, render pages with `pdftoppm -r 110 -png` and read the page images.
      Read every page — the holding is usually near the end.
   3. **Write the legal principles in Dhivehi (Thaana script)**:
      - `body`: the legal principles only, as numbered lines (`1. …`), **no more than 20 lines in total**.
        Each line states a rule of law, interpretation, standard or test that the Court laid down or applied
        (ratio decidendi), naming the Article / Act / section where the judgment does
        (e.g. ޤާނޫނުއަސާސީގެ 42 ވަނަ މާއްދާ).
      - Leave out narrative facts, party histories, procedural history and names unless a principle cannot
        be understood without them. No quotations longer than a short phrase.
      - The last line may state the outcome briefly (e.g. އިސްތިއުނާފު ބާޠިލުކުރެވުނު / ޤަބޫލުކުރެވުނު).
      - `summary`: one sentence giving the core holding.
      - Never invent a principle, article number or holding. If part of the text is unreadable, write only
        what you can verify.
   4. **Add the entry** to `data/sc-principles.json` (a JSON array; keep UTF-8, `ensure_ascii=False`,
      indent 1). Replace any existing entry with the same `id`. Shape:

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
       "body": "1. …\n2. …",
       "processed": "<YYYY-MM-DD>"
      }
      ```
   5. Remove the PDF from `inbox/` (`git rm`). If a PDF truly cannot be read, move it to `inbox/failed/`
      instead and say why in the commit message.
4. Validate: `data/sc-principles.json` parses as JSON, and every `body` has at most 20 lines.
5. Commit once ("Add legal principles: <citations>"), `git pull --rebase origin main`, push to `main`.
6. Report which cases were published and any failures.
