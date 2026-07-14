-- Trope system (docs/task-trope-system.md) — structure, weight, and a reason to tag.
--
-- tropes            the vocabulary: canonical rows (owner_id null, seeded below — generated from
--                   core SEED_TROPES; a web parity test pins the two together) + personal rows
--                   (owner_id set, RLS-scoped) with an optional canonical_id alias link so a
--                   personal coinage still counts toward canonical-keyed features later.
-- book_tropes       the assignment join with EMPHASIS: pinned | present. Pins are soft-capped
--                   at 3 per book in UI copy, deliberately not by constraint violence.
-- trope_suggestions Hardcover community descriptors mapped to canonical tropes — stored as
--                   suggestions, NEVER auto-applied; confirming inserts a book_tropes row,
--                   dismissing flips state. No counts/popularity are ever stored or shown.
--
-- Migration of existing data: every books.tags entry resolves against canonical name/alias;
-- misses become personal tropes (facet 'vibe' — the least-wrong default for free-typed vibes);
-- every tag lands in book_tropes as 'present'. Nothing pinned initially; books.tags is kept
-- (search + rollback), the app reads the join.

create table public.tropes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete cascade,   -- null = canonical
  canonical_id uuid references public.tropes (id) on delete set null,
  name text not null,
  aliases text[] not null default '{}',
  facet text not null check (facet in ('dynamics', 'plot', 'characters', 'setting_world', 'vibe')),
  genre_affinity text[] not null default '{}',                  -- ordering hint, never a gate
  created_at timestamptz not null default now()
);
create unique index tropes_canonical_name_uidx on public.tropes (lower(name)) where owner_id is null;
create unique index tropes_personal_name_uidx on public.tropes (owner_id, lower(name)) where owner_id is not null;

alter table public.tropes enable row level security;
create policy "tropes: read canonical or own" on public.tropes for select
  using (owner_id is null or owner_id = (select auth.uid()));
create policy "tropes: insert own" on public.tropes for insert
  with check (owner_id = (select auth.uid()));
create policy "tropes: update own" on public.tropes for update
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "tropes: delete own" on public.tropes for delete
  using (owner_id = (select auth.uid()));

create table public.book_tropes (
  book_id uuid not null references public.books (id) on delete cascade,
  trope_id uuid not null references public.tropes (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  emphasis text not null default 'present' check (emphasis in ('pinned', 'present')),
  added_at timestamptz not null default now(),
  primary key (book_id, trope_id)
);
create index book_tropes_trope_idx on public.book_tropes (trope_id);
create index book_tropes_owner_idx on public.book_tropes (owner_id);

alter table public.book_tropes enable row level security;
create policy "book_tropes: select own" on public.book_tropes for select using (owner_id = (select auth.uid()));
create policy "book_tropes: insert own" on public.book_tropes for insert
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.books b where b.id = book_id and b.owner_id = (select auth.uid()))
  );
create policy "book_tropes: update own" on public.book_tropes for update
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "book_tropes: delete own" on public.book_tropes for delete using (owner_id = (select auth.uid()));

create table public.trope_suggestions (
  book_id uuid not null references public.books (id) on delete cascade,
  trope_id uuid not null references public.tropes (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  source text not null default 'hardcover',
  state text not null default 'open' check (state in ('open', 'dismissed')),
  created_at timestamptz not null default now(),
  primary key (book_id, trope_id)
);

alter table public.trope_suggestions enable row level security;
create policy "trope_suggestions: all own" on public.trope_suggestions for all
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- suggestion-fetch bookkeeping: one Hardcover lookup per book, ever (re-fetch is manual)
alter table public.books add column if not exists tropes_suggested_at timestamptz;

grant select, insert, update, delete on public.tropes to authenticated;
grant select, insert, update, delete on public.book_tropes to authenticated;
grant select, insert, update, delete on public.trope_suggestions to authenticated;
grant all on public.tropes to service_role;
grant all on public.book_tropes to service_role;
grant all on public.trope_suggestions to service_role;

-- ── canonical seed (generated from packages/core/src/tropes.ts SEED_TROPES) ──
insert into public.tropes (name, facet, genre_affinity, aliases)
values
  ('Enemies to Lovers', 'dynamics', '{}'::text[], '{}'::text[]),
  ('Friends to Lovers', 'dynamics', array['romance']::text[], '{}'::text[]),
  ('Grumpy/Sunshine', 'dynamics', array['romance', 'cozy']::text[], '{}'::text[]),
  ('Opposites Attract', 'dynamics', array['romance']::text[], '{}'::text[]),
  ('Age Gap', 'dynamics', array['romance']::text[], '{}'::text[]),
  ('Love Triangle', 'dynamics', array['romance', 'young adult']::text[], '{}'::text[]),
  ('He Falls First', 'dynamics', array['romance']::text[], '{}'::text[]),
  ('Forced Proximity', 'dynamics', array['romance']::text[], '{}'::text[]),
  ('Only One Bed', 'dynamics', array['romance']::text[], '{}'::text[]),
  ('Forbidden Love', 'dynamics', array['romance']::text[], '{}'::text[]),
  ('Fated Mates', 'dynamics', array['romance', 'fantasy']::text[], array['mates']::text[]),
  ('Bonded Pair', 'dynamics', array['romance', 'fantasy']::text[], '{}'::text[]),
  ('Touch Her and Die', 'dynamics', array['romance']::text[], array['touch her and you die']::text[]),
  ('Captive/Captor', 'dynamics', array['romance']::text[], array['captive captor']::text[]),
  ('Bully Romance', 'dynamics', array['romance']::text[], '{}'::text[]),
  ('Obsessive', 'dynamics', array['romance']::text[], '{}'::text[]),
  ('Possessive', 'dynamics', array['romance']::text[], '{}'::text[]),
  ('Why Choose', 'dynamics', array['romance']::text[], '{}'::text[]),
  ('Reverse Harem', 'dynamics', array['romance']::text[], array['harem']::text[]),
  ('Banter', 'dynamics', '{}'::text[], '{}'::text[]),
  ('Mentor & Student', 'dynamics', array['fantasy']::text[], array['mentor and student']::text[]),
  ('Rivals', 'dynamics', array['fantasy', 'young adult']::text[], array['rivals to lovers']::text[]),
  ('Enemies to Allies', 'dynamics', array['science fiction']::text[], '{}'::text[]),
  ('Found Family', 'dynamics', '{}'::text[], '{}'::text[]),
  ('Found Crew', 'dynamics', array['science fiction']::text[], '{}'::text[]),
  ('Band of Misfits', 'dynamics', array['fantasy']::text[], '{}'::text[]),
  ('Matchmaking', 'dynamics', array['cozy', 'romance']::text[], '{}'::text[]),
  ('First Love', 'dynamics', array['young adult', 'romance']::text[], '{}'::text[]),
  ('Friendship', 'dynamics', array['young adult']::text[], '{}'::text[]),
  ('Cat and Mouse', 'dynamics', array['mystery']::text[], '{}'::text[]),
  ('Marriage in Trouble', 'dynamics', array['literary']::text[], '{}'::text[]),
  ('Villain Romance', 'dynamics', array['romance']::text[], '{}'::text[]),
  ('Second Chance', 'plot', array['romance']::text[], array['second chance romance']::text[]),
  ('Fake Dating', 'plot', array['romance']::text[], '{}'::text[]),
  ('Marriage of Convenience', 'plot', array['romance']::text[], '{}'::text[]),
  ('Forced Marriage', 'plot', array['romance']::text[], '{}'::text[]),
  ('Revenge', 'plot', array['romance']::text[], '{}'::text[]),
  ('Rebellion', 'plot', array['romance', 'fantasy', 'science fiction']::text[], '{}'::text[]),
  ('Quest', 'plot', array['fantasy']::text[], '{}'::text[]),
  ('Heist', 'plot', array['fantasy', 'mystery']::text[], '{}'::text[]),
  ('Political Intrigue', 'plot', array['fantasy']::text[], '{}'::text[]),
  ('Court Intrigue', 'plot', array['romance', 'fantasy']::text[], '{}'::text[]),
  ('War Campaign', 'plot', array['fantasy']::text[], '{}'::text[]),
  ('Tournament Arc', 'plot', array['fantasy', 'young adult']::text[], '{}'::text[]),
  ('Prophecy', 'plot', array['fantasy']::text[], '{}'::text[]),
  ('Time Travel', 'plot', array['science fiction']::text[], '{}'::text[]),
  ('First Contact', 'plot', array['science fiction']::text[], '{}'::text[]),
  ('Twist Ending', 'plot', array['mystery']::text[], '{}'::text[]),
  ('Cold Case', 'plot', array['mystery']::text[], '{}'::text[]),
  ('Locked Room', 'plot', array['mystery']::text[], '{}'::text[]),
  ('Police Procedural', 'plot', array['mystery']::text[], '{}'::text[]),
  ('Coming of Age', 'plot', array['literary', 'young adult']::text[], '{}'::text[]),
  ('Family Saga', 'plot', array['literary']::text[], '{}'::text[]),
  ('Immigrant Story', 'plot', array['literary']::text[], '{}'::text[]),
  ('Family Secrets', 'plot', array['young adult', 'literary']::text[], '{}'::text[]),
  ('Community Project', 'plot', array['cozy']::text[], '{}'::text[]),
  ('Fresh Start', 'plot', array['cozy']::text[], '{}'::text[]),
  ('Second Act', 'plot', array['cozy']::text[], '{}'::text[]),
  ('Road Trip', 'plot', array['young adult']::text[], '{}'::text[]),
  ('Dystopian Rebellion', 'plot', array['young adult', 'science fiction']::text[], '{}'::text[]),
  ('Survival', 'plot', array['science fiction', 'horror']::text[], '{}'::text[]),
  ('Pandemic', 'plot', array['science fiction', 'horror']::text[], '{}'::text[]),
  ('Ritual', 'plot', array['horror']::text[], '{}'::text[]),
  ('Cursed', 'plot', array['romance', 'fantasy']::text[], '{}'::text[]),
  ('Cursed Object', 'plot', array['horror']::text[], '{}'::text[]),
  ('Possession', 'plot', array['horror']::text[], '{}'::text[]),
  ('Slasher', 'plot', array['horror']::text[], '{}'::text[]),
  ('Redemption Arc', 'plot', '{}'::text[], '{}'::text[]),
  ('Secret Identity', 'plot', array['young adult']::text[], '{}'::text[]),
  ('Identity', 'plot', array['young adult']::text[], '{}'::text[]),
  ('Multiple Timelines', 'plot', array['literary']::text[], array['dual timeline']::text[]),
  ('Epistolary', 'plot', array['literary']::text[], '{}'::text[]),
  ('Vignettes', 'plot', array['literary']::text[], '{}'::text[]),
  ('Metafiction', 'plot', array['literary']::text[], '{}'::text[]),
  ('Memoir', 'plot', array['nonfiction']::text[], '{}'::text[]),
  ('Narrative Nonfiction', 'plot', array['nonfiction']::text[], '{}'::text[]),
  ('Investigative', 'plot', array['nonfiction']::text[], '{}'::text[]),
  ('Essays', 'plot', array['nonfiction']::text[], '{}'::text[]),
  ('Biography', 'plot', array['nonfiction']::text[], '{}'::text[]),
  ('Morally Gray MMC', 'characters', array['romance']::text[], '{}'::text[]),
  ('Morally Black MMC', 'characters', array['romance']::text[], '{}'::text[]),
  ('Morally Gray', 'characters', '{}'::text[], '{}'::text[]),
  ('Anti-Hero', 'characters', '{}'::text[], '{}'::text[]),
  ('Serial Killers', 'characters', array['romance', 'mystery']::text[], array['serial killer']::text[]),
  ('Stalker', 'characters', array['romance']::text[], '{}'::text[]),
  ('Billionaire', 'characters', array['romance']::text[], array['billionaire romance']::text[]),
  ('Single Parent', 'characters', array['romance']::text[], '{}'::text[]),
  ('Strong Female Lead', 'characters', '{}'::text[], '{}'::text[]),
  ('Final Girl', 'characters', array['horror']::text[], '{}'::text[]),
  ('Reluctant Hero', 'characters', array['fantasy', 'science fiction']::text[], '{}'::text[]),
  ('Chosen One', 'characters', array['romance', 'fantasy', 'young adult']::text[], array['the chosen one']::text[]),
  ('Vampires', 'characters', array['romance', 'horror']::text[], array['vampire']::text[]),
  ('Ghosts', 'characters', array['horror']::text[], array['ghost']::text[]),
  ('Shifters', 'characters', array['romance']::text[], array['shifter', 'werewolves', 'werewolf']::text[]),
  ('Dragon Riders', 'characters', array['romance', 'fantasy']::text[], '{}'::text[]),
  ('Dragons', 'characters', array['fantasy']::text[], array['dragon']::text[]),
  ('Sentient Ship', 'characters', array['science fiction']::text[], '{}'::text[]),
  ('Talking Animals', 'characters', array['cozy']::text[], '{}'::text[]),
  ('AI & Androids', 'characters', array['science fiction']::text[], array['ai', 'androids', 'artificial intelligence']::text[]),
  ('Amateur Sleuth', 'characters', array['mystery', 'cozy']::text[], '{}'::text[]),
  ('Hardboiled Detective', 'characters', array['mystery']::text[], '{}'::text[]),
  ('Unreliable Narrator', 'characters', '{}'::text[], '{}'::text[]),
  ('Hidden Powers', 'characters', array['romance', 'fantasy']::text[], '{}'::text[]),
  ('Magic Academy', 'setting_world', array['romance', 'fantasy', 'young adult']::text[], '{}'::text[]),
  ('Small Town', 'setting_world', '{}'::text[], array['small-town']::text[]),
  ('Small Town Secrets', 'setting_world', array['horror', 'mystery']::text[], '{}'::text[]),
  ('Holiday', 'setting_world', array['romance', 'cozy']::text[], '{}'::text[]),
  ('Gothic', 'setting_world', array['romance', 'horror']::text[], '{}'::text[]),
  ('Haunted House', 'setting_world', array['horror']::text[], array['haunted']::text[]),
  ('Deep Woods', 'setting_world', array['horror']::text[], '{}'::text[]),
  ('At Sea', 'setting_world', array['horror']::text[], '{}'::text[]),
  ('Asylum', 'setting_world', array['horror']::text[], '{}'::text[]),
  ('Space Opera', 'setting_world', array['science fiction']::text[], '{}'::text[]),
  ('Cyberpunk', 'setting_world', array['science fiction']::text[], '{}'::text[]),
  ('Generation Ship', 'setting_world', array['science fiction']::text[], '{}'::text[]),
  ('Terraforming', 'setting_world', array['science fiction']::text[], '{}'::text[]),
  ('Corporate Overlords', 'setting_world', array['science fiction']::text[], '{}'::text[]),
  ('Dystopia', 'setting_world', array['science fiction']::text[], array['dystopian']::text[]),
  ('Post-Apocalyptic', 'setting_world', array['science fiction']::text[], '{}'::text[]),
  ('Portal Fantasy', 'setting_world', array['fantasy']::text[], '{}'::text[]),
  ('High Magic', 'setting_world', array['fantasy']::text[], '{}'::text[]),
  ('Elemental Magic', 'setting_world', array['fantasy']::text[], '{}'::text[]),
  ('Gods & Pantheons', 'setting_world', array['fantasy']::text[], array['gods and pantheons']::text[]),
  ('Fae', 'setting_world', array['romance', 'fantasy']::text[], array['faerie', 'fey']::text[]),
  ('Mafia', 'setting_world', array['romance']::text[], '{}'::text[]),
  ('Historical', 'setting_world', array['literary']::text[], '{}'::text[]),
  ('Historical Mystery', 'setting_world', array['mystery']::text[], '{}'::text[]),
  ('Courtroom', 'setting_world', array['mystery']::text[], '{}'::text[]),
  ('Campus Novel', 'setting_world', array['literary']::text[], '{}'::text[]),
  ('School Story', 'setting_world', array['young adult']::text[], '{}'::text[]),
  ('City Portrait', 'setting_world', array['literary']::text[], '{}'::text[]),
  ('Sports', 'setting_world', array['romance']::text[], array['sports romance']::text[]),
  ('Culinary', 'setting_world', array['cozy']::text[], '{}'::text[]),
  ('Bookshop & Library', 'setting_world', array['cozy']::text[], array['bookshop', 'library']::text[]),
  ('Seaside', 'setting_world', array['cozy']::text[], '{}'::text[]),
  ('Garden & Farm', 'setting_world', array['cozy']::text[], array['cottagecore']::text[]),
  ('Tea & Coffee', 'setting_world', array['cozy']::text[], '{}'::text[]),
  ('Science', 'setting_world', array['nonfiction']::text[], '{}'::text[]),
  ('History', 'setting_world', array['nonfiction']::text[], '{}'::text[]),
  ('True Crime', 'setting_world', array['nonfiction', 'mystery']::text[], array['true-crime']::text[]),
  ('Nature', 'setting_world', array['nonfiction']::text[], '{}'::text[]),
  ('Psychology', 'setting_world', array['nonfiction']::text[], '{}'::text[]),
  ('Food', 'setting_world', array['nonfiction']::text[], '{}'::text[]),
  ('Slow Burn', 'vibe', '{}'::text[], '{}'::text[]),
  ('Spicy', 'vibe', array['romance']::text[], array['spice']::text[]),
  ('Touch-Starved', 'vibe', array['romance']::text[], array['touch starved']::text[]),
  ('Isolation', 'vibe', array['horror']::text[], '{}'::text[]),
  ('Descent into Madness', 'vibe', array['horror']::text[], '{}'::text[]),
  ('Cosmic Horror', 'vibe', array['horror']::text[], '{}'::text[]),
  ('Body Horror', 'vibe', array['horror']::text[], '{}'::text[]),
  ('Folk Horror', 'vibe', array['horror']::text[], '{}'::text[]),
  ('Noir', 'vibe', array['mystery']::text[], '{}'::text[]),
  ('Cozy Mystery', 'vibe', array['mystery', 'cozy']::text[], array['cosy mystery']::text[]),
  ('Magical Realism', 'vibe', array['cozy', 'literary']::text[], '{}'::text[]),
  ('Low Stakes', 'vibe', array['cozy']::text[], '{}'::text[]),
  ('Slice of Life', 'vibe', array['cozy']::text[], '{}'::text[]),
  ('Stream of Consciousness', 'vibe', array['literary']::text[], '{}'::text[]),
  ('Grief & Memory', 'vibe', array['literary']::text[], array['grief and memory']::text[]),
  ('Class & Money', 'vibe', array['literary']::text[], array['class and money']::text[]),
  ('Funny', 'vibe', array['nonfiction']::text[], array['humor', 'humour']::text[]),
  ('Moving', 'vibe', array['nonfiction']::text[], '{}'::text[]),
  ('Practical', 'vibe', array['nonfiction']::text[], '{}'::text[]),
  ('Everyone''s a Suspect', 'plot', array['mystery']::text[], '{}'::text[])
on conflict do nothing;

-- ── migrate existing tags → the join ──
-- 1) tags with no canonical match become PERSONAL tropes ('vibe' default facet)
insert into public.tropes (owner_id, name, facet)
select distinct b.owner_id, tag.value, 'vibe'
from public.books b
cross join lateral unnest(b.tags) as tag(value)
where btrim(tag.value) <> ''
  and not exists (
    select 1 from public.tropes t
    where t.owner_id is null
      and (lower(t.name) = lower(tag.value) or lower(tag.value) in (select lower(a) from unnest(t.aliases) a))
  )
on conflict do nothing;

-- 2) every tag lands as a 'present' assignment (canonical match wins over personal)
insert into public.book_tropes (book_id, trope_id, owner_id, emphasis)
select distinct on (b.id, resolved.id) b.id, resolved.id, b.owner_id, 'present'
from public.books b
cross join lateral unnest(b.tags) as tag(value)
cross join lateral (
  select t.id, (t.owner_id is null) as is_canonical
  from public.tropes t
  where (t.owner_id is null or t.owner_id = b.owner_id)
    and (lower(t.name) = lower(tag.value) or lower(tag.value) in (select lower(a) from unnest(t.aliases) a))
  order by t.owner_id is null desc
  limit 1
) resolved
where btrim(tag.value) <> ''
on conflict do nothing;
