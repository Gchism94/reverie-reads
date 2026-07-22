-- Mood system (docs/task-mood.md) — a READER-ASSIGNED dimension: how a book LANDED on the reader.
--
-- moods       the vocabulary: canonical rows (owner_id null, seeded below — generated from core
--             SEED_MOODS; a web parity test pins the two together) + personal rows (owner_id set,
--             RLS-scoped) with an optional canonical_id alias link, exactly like tropes.
-- book_moods  the assignment join — reader-assigned only. NO emphasis/weight (mood is felt, not
--             ranked), NO suggestions table (v1 ships pure reader-assignment; a model suggester is
--             deliberately deferred pending the owner's approval — docs/task-mood.md §2).
--
-- THE GOVERNING RULE: mood is NEVER derived. There is deliberately NO backfill here — unlike the
-- trope system (which migrated books.tags → book_tropes), moods start EMPTY for every book. A book
-- with no reader-assigned mood simply has none; absence is a valid, quiet state, never a guess.

create table public.moods (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete cascade,   -- null = canonical
  canonical_id uuid references public.moods (id) on delete set null,
  name text not null,
  created_at timestamptz not null default now()
);
create unique index moods_canonical_name_uidx on public.moods (lower(name)) where owner_id is null;
create unique index moods_personal_name_uidx on public.moods (owner_id, lower(name)) where owner_id is not null;

alter table public.moods enable row level security;
create policy "moods: read canonical or own" on public.moods for select
  using (owner_id is null or owner_id = (select auth.uid()));
create policy "moods: insert own" on public.moods for insert
  with check (owner_id = (select auth.uid()));
create policy "moods: update own" on public.moods for update
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "moods: delete own" on public.moods for delete
  using (owner_id = (select auth.uid()));

create table public.book_moods (
  book_id uuid not null references public.books (id) on delete cascade,
  mood_id uuid not null references public.moods (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (book_id, mood_id)
);
create index book_moods_mood_idx on public.book_moods (mood_id);
create index book_moods_owner_idx on public.book_moods (owner_id);

alter table public.book_moods enable row level security;
create policy "book_moods: select own" on public.book_moods for select using (owner_id = (select auth.uid()));
create policy "book_moods: insert own" on public.book_moods for insert
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.books b where b.id = book_id and b.owner_id = (select auth.uid()))
  );
create policy "book_moods: update own" on public.book_moods for update
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "book_moods: delete own" on public.book_moods for delete using (owner_id = (select auth.uid()));

grant select, insert, update, delete on public.moods to authenticated;
grant select, insert, update, delete on public.book_moods to authenticated;
grant all on public.moods to service_role;
grant all on public.book_moods to service_role;

-- ── canonical seed (generated from packages/core/src/moods.ts SEED_MOODS) ──
insert into public.moods (name)
values
  ('Cozy'),
  ('Tender'),
  ('Hopeful'),
  ('Whimsical'),
  ('Atmospheric'),
  ('Dreamy'),
  ('Melancholy'),
  ('Bittersweet'),
  ('Haunting'),
  ('Unsettling'),
  ('Tense'),
  ('Bleak'),
  ('Propulsive'),
  ('Thought-provoking')
on conflict do nothing;

-- NO book_moods backfill. Moods are reader-assigned only — the reader attaches them because they
-- felt them. Deriving a mood from tags/subgenre/tropes is the one thing this feature refuses.
