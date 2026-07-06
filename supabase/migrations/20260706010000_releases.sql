-- Releases / author-following (owner-approved run): "coming soon from your authors".
-- Two pieces:
--   releases_cache   the GLOBAL cached external-data layer (enrichment_cache's sibling) — one
--                    upstream lookup serves every reader; the releases fn owns it via service
--                    role, clients never touch it directly. Also backs Discover's genre shelves.
--   author_follows   per-reader overrides on the DERIVED "your authors" set (the library decides
--                    the baseline; a row here pins an author in — 'followed' — or out — 'muted').

create table public.releases_cache (
  cache_key text primary key,          -- e.g. author:<norm-name> | discover:<genre>
  payload jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table public.releases_cache enable row level security;
-- no policies on purpose: only the service role (which bypasses RLS) reads/writes the cache
grant all on public.releases_cache to service_role;

create table public.author_follows (
  user_id uuid not null references public.profiles (id) on delete cascade,
  author_name text not null,           -- the app's author identity is the display name
  state text not null check (state in ('followed', 'muted')),
  at timestamptz not null default now(),
  primary key (user_id, author_name)
);

alter table public.author_follows enable row level security;

create policy "author_follows: own rows" on public.author_follows
  for all using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- RLS decides WHICH rows; the role still needs base privileges (house rule, grants migration).
grant select, insert, update, delete on public.author_follows to authenticated;
grant all on public.author_follows to service_role;
