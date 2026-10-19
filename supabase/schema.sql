-- CaseLaw MV — Supabase schema.
-- Run once in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Safe to re-run.

-- ---------- Content ----------
create table if not exists public.entries (
  id         text primary key default gen_random_uuid()::text,
  category   text not null check (category in ('higher', 'recent', 'principles')),
  title      text not null,
  title_en   text,
  court      text,
  case_no    text,
  citation   text,
  date       date,
  summary    text,
  body       text,
  pdf        text,          -- public URL of the PDF (Storage bucket "pdfs" or external)
  url        text,          -- link to the official judgment page, if any
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists entries_category_date_idx on public.entries (category, date desc);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists entries_touch on public.entries;
create trigger entries_touch before update on public.entries
  for each row execute function public.touch_updated_at();

-- ---------- Admins ----------
-- Users who may edit content. After creating a user under Authentication → Users, add them with:
--   insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
$$;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------- Row level security ----------
alter table public.entries enable row level security;
alter table public.admins  enable row level security;

drop policy if exists "entries are public"   on public.entries;
drop policy if exists "admins insert entries" on public.entries;
drop policy if exists "admins update entries" on public.entries;
drop policy if exists "admins delete entries" on public.entries;
create policy "entries are public"    on public.entries for select using (true);
create policy "admins insert entries" on public.entries for insert to authenticated with check (public.is_admin());
create policy "admins update entries" on public.entries for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete entries" on public.entries for delete to authenticated using (public.is_admin());
-- admins table: no policies, so it is not readable or writable from the browser.

-- ---------- Storage ----------
-- "pdfs":  public decision PDFs attached to entries.
-- "inbox": private judgment PDFs waiting for the daily legal-principles task.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('pdfs',  'pdfs',  true,  26214400, array['application/pdf']),
  ('inbox', 'inbox', false, 26214400, array['application/pdf'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "pdfs are public"     on storage.objects;
drop policy if exists "admins manage pdfs"  on storage.objects;
drop policy if exists "admins manage inbox" on storage.objects;
create policy "pdfs are public" on storage.objects for select using (bucket_id = 'pdfs');
create policy "admins manage pdfs" on storage.objects for all to authenticated
  using (bucket_id = 'pdfs' and public.is_admin()) with check (bucket_id = 'pdfs' and public.is_admin());
create policy "admins manage inbox" on storage.objects for all to authenticated
  using (bucket_id = 'inbox' and public.is_admin()) with check (bucket_id = 'inbox' and public.is_admin());

-- "convert": private PDFs queued for accurate (human-quality) Dhivehi conversion and the finished .docx files.
--   queue/<name>.pdf  → waiting;  done/<name>.docx → finished;  failed/<name>.pdf → could not be read.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('convert', 'convert', false, 52428800, array['application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "admins manage convert" on storage.objects;
create policy "admins manage convert" on storage.objects for all to authenticated
  using (bucket_id = 'convert' and public.is_admin()) with check (bucket_id = 'convert' and public.is_admin());
