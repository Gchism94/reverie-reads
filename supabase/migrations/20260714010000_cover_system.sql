-- Cover system — the cover is the door (docs/task-cover-system.md).
--
-- Provenance + tint columns on books, and user-scoped write policies on the covers bucket so the
-- ingest pipeline's per-user paths (u/{auth.uid()}/{book_id}/{rev}.webp) are RLS-consistent.
-- The existing bucket stays public-read (covers are not secrets; grids hotlink nothing external).

-- Where the current cover came from: 'hardcover' | 'google' | 'openlibrary' | 'upload' | 'camera' | 'url'.
-- Plain text (like cover_confidence) — the client validates; a new source never needs a migration.
alter table public.books add column if not exists cover_source text;

-- The external URL the stored asset was ingested from (re-fetch / provenance), where applicable.
alter table public.books add column if not exists cover_source_url text;

-- ~300px stored thumbnail (grids/spines/shelves consume this; detail uses cover_url).
alter table public.books add column if not exists cover_thumb_url text;

-- The reader chose this cover (any cover-sheet path). Enrichment NEVER overwrites a user-chosen
-- cover — the same non-overwrite principle as series data. Lazy backfill keeps this false.
alter table public.books add column if not exists cover_user_chosen boolean not null default false;

-- Dominant cover colour (hex '#rrggbb'), extracted at ingest — the per-book spine tint input.
alter table public.books add column if not exists cover_color text;

-- User-scoped Storage writes on the covers bucket: authenticated users may manage ONLY objects
-- under their own u/{uid}/ prefix. The ingest Edge Function writes with the service role (bypasses
-- RLS) to the same paths; these policies make the layout enforceable for any future client-direct
-- write and document the ownership convention. Public read comes from the bucket's public flag.
drop policy if exists "covers user-scoped insert" on storage.objects;
create policy "covers user-scoped insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'covers' and name like 'u/' || auth.uid()::text || '/%');

drop policy if exists "covers user-scoped update" on storage.objects;
create policy "covers user-scoped update" on storage.objects
  for update to authenticated
  using (bucket_id = 'covers' and name like 'u/' || auth.uid()::text || '/%')
  with check (bucket_id = 'covers' and name like 'u/' || auth.uid()::text || '/%');

drop policy if exists "covers user-scoped delete" on storage.objects;
create policy "covers user-scoped delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'covers' and name like 'u/' || auth.uid()::text || '/%');
