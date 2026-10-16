# ކޭސްލޯ އެމްވީ (CaseLaw MV)

A Dhivehi (RTL) static website for Maldivian court decisions, hosted on GitHub Pages.

## Pages
| File | Section |
|---|---|
| `index.html` | Home |
| `higher-courts.html` | މަތީ މަރުޙަލާގެ ކޯޓުތަކުގެ ނިންމުންތައް |
| `recent.html` | ފަހުގެ ނިންމުންތައް |
| `principles.html` | ޤާނޫނީ އުސޫލުތައް |
| `view.html` | Single decision / article page |
| `admin.html` | Admin panel |

Content lives in `data/higher.json`, `data/recent.json` and `data/principles.json`. PDFs go in `uploads/`.

## Using the admin panel
1. Create a fine-grained token at GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens.
   - Repository access: **Only select repositories → Caselawmv**
   - Permissions: **Contents → Read and write**
2. Open `/admin.html` on the site, paste the token, and log in. The token is stored only in that browser.
3. Choose a section, fill in the form, and publish. Each save is a commit to this repo; the live site updates within 1–2 minutes.

Anyone can open `admin.html`, but nothing can be changed without a token that has write access to this repository.
