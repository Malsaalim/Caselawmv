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

The site's own entries live in **Supabase** (table `entries`, PDFs in the Storage bucket `pdfs`). Until Supabase is configured the pages fall back to `data/higher.json`, `data/recent.json` and `data/principles.json`. The Supreme Court judgment list (`data/sc-judgments.json`) and its legal principles (`data/sc-principles.json`) are still committed to this repo by the daily sync.

## Connecting Supabase
1. Create a project at [supabase.com](https://supabase.com).
2. In the dashboard open **SQL Editor**, paste [`supabase/schema.sql`](supabase/schema.sql) and run it. It creates the `entries` and `admins` tables, the row-level security policies, and the `pdfs` (public) and `inbox` (private) storage buckets.
3. Open **Project Settings → API** and copy the Project URL and the `anon` public key into [`assets/supabase-config.js`](assets/supabase-config.js). The anon key is meant to be public; never put the `service_role` key in the site.
4. Under **Authentication → Users**, add a user with an email and password. Then make that user an admin in the SQL Editor:
   ```sql
   insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';
   ```
5. Under **Authentication → Sign In / Providers**, turn off "Allow new users to sign up" (only admins need accounts).

## Using the admin panel
Open `/admin.html` on the site and log in with the admin email and password. Entries are saved straight to Supabase and appear on the site immediately.

The "judgment PDF" tab uploads PDFs to the private `inbox` bucket. The daily legal-principles task (`scripts/PRINCIPLES_TASK.md`) reads them with `scripts/supabase_inbox.py`, which needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set in the task's environment.

Anyone can open `admin.html`, but only users listed in `public.admins` can change anything.
