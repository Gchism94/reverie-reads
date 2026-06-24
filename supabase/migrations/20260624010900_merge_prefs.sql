-- A3 — auto-merge preference + remembered duplicate verdicts.
-- The Settings toggle controls whether STRONG (ISBN / title+author) matches fold in silently
-- on import; fuzzy near-matches always go to review regardless. Verdicts persist a per-pair
-- decision so a "keep both" / dismissed pair isn't re-flagged on every future import, and an
-- "always merge" pair folds in automatically next time.

alter table public.profiles
  add column auto_merge_duplicates boolean not null default true;

-- One row per (existing book, incoming identity) the user has ruled on.
--   incoming_key = normalized identity of the imported record (isbn:<13> or <title>|<author>).
--   verdict      = 'keep_separate' (not a duplicate — stop asking)
--                | 'always_merge'  (same book — fold in without asking next time).
create table public.merge_verdicts (
  owner_id uuid not null references public.profiles (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  incoming_key text not null,
  verdict text not null check (verdict in ('keep_separate', 'always_merge')),
  created_at timestamptz not null default now(),
  primary key (owner_id, book_id, incoming_key)
);

alter table public.merge_verdicts enable row level security;

create policy "merge_verdicts: select own" on public.merge_verdicts
  for select using (owner_id = (select auth.uid()));
create policy "merge_verdicts: insert own" on public.merge_verdicts
  for insert with check (owner_id = (select auth.uid()));
create policy "merge_verdicts: update own" on public.merge_verdicts
  for update using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "merge_verdicts: delete own" on public.merge_verdicts
  for delete using (owner_id = (select auth.uid()));

-- Lookup by (owner, incoming_key) when matching an import row against prior verdicts.
create index merge_verdicts_owner_key on public.merge_verdicts (owner_id, incoming_key);

grant select, insert, update, delete on public.merge_verdicts to authenticated;
