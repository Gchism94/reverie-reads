-- De-romance the taxonomy: remove the derived "boyfriend"/archetype vibe, and broaden the
-- subgenre + trope vocabularies beyond romance (docs/task-taxonomy-neutral.md).
--
-- Three parts: (1) drop the derived boyfriend column — it was DERIVED (tags + subgenre), so the
-- drop is lossless; the merge_books RPC is recreated first so it stops referencing the column.
-- (2) backfill primary-genre for the NEW single-genre subgenres (mirrors core SUBGENRE_PRIMARY_GENRE
-- — parity-tested). (3) seed the NEW canonical tropes (mirrors core SEED_TROPES — parity-tested).

-- ── 1. Remove the boyfriend/archetype vibe ───────────────────────────────────────────────────────
-- Recreate merge_books WITHOUT the boyfriend field first, so no live function references the column
-- once it is dropped. (Body identical to 20260626170000_contributors.sql minus the boyfriend line.)
create or replace function public.merge_books(p_primary uuid, p_loser uuid, p_fields jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := (select auth.uid());
begin
  if p_primary = p_loser then
    raise exception 'cannot merge a book into itself';
  end if;
  if not exists (select 1 from public.books where id = p_primary and owner_id = uid) then
    raise exception 'not owner of primary book';
  end if;
  if not exists (select 1 from public.books where id = p_loser and owner_id = uid) then
    raise exception 'not owner of loser book';
  end if;

  -- 1. Carry the loser's reads onto the primary (dedup by date). Undated reads always move.
  insert into public.reads (book_id, owner_id, read_on, format, rating, notes)
  select p_primary, uid, r.read_on, r.format, r.rating, r.notes
  from public.reads r
  where r.book_id = p_loser
    and (
      r.read_on is null
      or not exists (select 1 from public.reads p where p.book_id = p_primary and p.read_on = r.read_on)
    );

  -- 2. Carry the loser's list memberships onto the primary.
  insert into public.list_items (list_id, book_id, owner_id, position)
  select li.list_id, p_primary, uid, li.position
  from public.list_items li
  where li.book_id = p_loser
  on conflict (list_id, book_id) do nothing;

  -- 3. Union the loser's contributors onto the primary (append after primary's; dedupe by
  --    author+role), then renumber positions in order.
  insert into public.book_authors (book_id, author_id, owner_id, position, role)
  select p_primary, ba.author_id, uid, ba.position + 1000, ba.role
  from public.book_authors ba
  where ba.book_id = p_loser
  on conflict (book_id, author_id, role) do nothing;

  with ranked as (
    select author_id, role, (row_number() over (order by position) - 1) as rn
    from public.book_authors where book_id = p_primary
  )
  update public.book_authors ba set position = r.rn
  from ranked r
  where ba.book_id = p_primary and ba.author_id = r.author_id and ba.role = r.role;

  -- 4. Apply the merged scalar/array fields to the primary.
  update public.books set
    title           = coalesce(p_fields ->> 'title', title),
    author_first    = coalesce(p_fields ->> 'author_first', author_first),
    author_last     = coalesce(p_fields ->> 'author_last', author_last),
    series          = coalesce(p_fields ->> 'series', series),
    position        = coalesce((p_fields ->> 'position')::numeric, position),
    series_count    = coalesce((p_fields ->> 'series_count')::smallint, series_count),
    status          = coalesce(p_fields ->> 'status', status),
    genre           = coalesce(p_fields ->> 'genre', genre),
    subgenre        = coalesce(p_fields ->> 'subgenre', subgenre),
    genres          = case when p_fields ? 'genres' then array(select jsonb_array_elements_text(p_fields -> 'genres')) else genres end,
    tags            = case when p_fields ? 'tags' then array(select jsonb_array_elements_text(p_fields -> 'tags')) else tags end,
    intensity       = coalesce((p_fields ->> 'intensity')::smallint, intensity),
    cover_url       = coalesce(p_fields ->> 'cover_url', cover_url),
    isbn            = coalesce(p_fields ->> 'isbn', isbn),
    fave            = coalesce((p_fields ->> 'fave')::boolean, fave),
    owned_physical  = case when p_fields ? 'owned_physical' then nullif(p_fields ->> 'owned_physical', '') else owned_physical end,
    owned_ebook     = coalesce((p_fields ->> 'owned_ebook')::boolean, owned_ebook),
    owned_audiobook = coalesce((p_fields ->> 'owned_audiobook')::boolean, owned_audiobook),
    format          = coalesce(p_fields ->> 'format', format),
    rating          = coalesce((p_fields ->> 'rating')::numeric, rating),
    read_status     = coalesce(p_fields ->> 'read_status', read_status),
    source          = coalesce(p_fields ->> 'source', source),
    pub_y           = coalesce((p_fields ->> 'pub_y')::smallint, pub_y),
    pub_m           = coalesce((p_fields ->> 'pub_m')::smallint, pub_m),
    pub_d           = coalesce((p_fields ->> 'pub_d')::smallint, pub_d),
    plan_date       = case when p_fields ? 'plan_date' then (p_fields ->> 'plan_date')::date else plan_date end,
    progress        = coalesce((p_fields ->> 'progress')::smallint, progress)
  where id = p_primary;

  -- 5. Refresh the denormalized byline cache from the reconciled author/co-author names.
  update public.books set authors_display = (
    select string_agg(a.name, ', ' order by ba.position)
    from public.book_authors ba join public.authors a on a.id = ba.author_id
    where ba.book_id = p_primary and ba.role in ('author', 'co_author')
  ) where id = p_primary;

  -- 6. Delete the loser (cascade clears its reads + list_items + book_authors).
  delete from public.books where id = p_loser;
end;
$$;
grant execute on function public.merge_books(uuid, uuid, jsonb) to authenticated;

-- Now drop the derived column. Lossless: boyfriend was computed from tags + subgenre.
alter table public.books drop column if exists boyfriend;

-- ── 2. Primary-genre backfill for the NEW single-genre subgenres ─────────────────────────────────
-- Mirrors the additions to core's SUBGENRE_PRIMARY_GENRE (genreTaxonomy.test.ts unions this block
-- with the book_editing block and pins the union to the TS map). No current book carries these yet,
-- so it is a no-op on existing data — it keeps the SQL⇄TS invariant honest for future imports.
update public.books b
set genre = m.genre
from (values
  ('historical romance', 'romance'),
  ('paranormal romance', 'romance'),
  ('romantic comedy', 'romance'),
  ('urban fantasy', 'fantasy'),
  ('grimdark', 'fantasy'),
  ('fairytale retelling', 'fantasy'),
  ('post-apocalyptic', 'science fiction'),
  ('military sf', 'science fiction'),
  ('climate fiction', 'science fiction'),
  ('folk horror', 'horror'),
  ('body horror', 'horror'),
  ('splatterpunk', 'horror'),
  ('police procedural', 'mystery'),
  ('legal thriller', 'mystery'),
  ('historical mystery', 'mystery'),
  ('satire', 'literary'),
  ('speculative fiction', 'literary'),
  ('autofiction', 'literary'),
  ('epistolary', 'literary'),
  ('cozy crime', 'cozy'),
  ('cottagecore', 'cozy'),
  ('bookshop cozy', 'cozy'),
  ('cozy paranormal', 'cozy'),
  ('true crime', 'nonfiction'),
  ('travel', 'nonfiction'),
  ('philosophy', 'nonfiction'),
  ('ya horror', 'young adult'),
  ('ya mystery', 'young adult'),
  ('ya sci-fi', 'young adult'),
  ('ya thriller', 'young adult')
) as m(subgenre, genre)
where coalesce(b.genre, '') = '' and lower(coalesce(b.subgenre, '')) = m.subgenre;

-- ── 3. New canonical tropes (generated from packages/core/src/tropes.ts SEED_TROPES additions) ────
-- tropeSeedParity.test.ts unions this INSERT with the trope_system block and pins the total to
-- SEED_TROPES. The ON CONFLICT clause below makes the seed idempotent and never clobbers edits.
insert into public.tropes (name, facet, genre_affinity, aliases)
values
  ('Red Herring', 'plot', array['mystery']::text[], '{}'::text[]),
  ('Whodunit', 'plot', array['mystery']::text[], '{}'::text[]),
  ('Closed Circle', 'setting_world', array['mystery']::text[], array['closed circle mystery']::text[]),
  ('Chase Sequence', 'plot', array['mystery']::text[], '{}'::text[]),
  ('Demonic Possession', 'plot', array['horror']::text[], '{}'::text[]),
  ('Creature Feature', 'characters', array['horror']::text[], '{}'::text[]),
  ('Occult Ritual', 'plot', array['horror']::text[], array['occult']::text[]),
  ('Slow-Burn Dread', 'vibe', array['horror']::text[], '{}'::text[]),
  ('Time Loop', 'plot', array['science fiction']::text[], '{}'::text[]),
  ('Uploaded Minds', 'characters', array['science fiction']::text[], '{}'::text[]),
  ('Colony World', 'setting_world', array['science fiction']::text[], '{}'::text[]),
  ('Character Study', 'vibe', array['literary']::text[], '{}'::text[]),
  ('Intergenerational Saga', 'plot', array['literary']::text[], '{}'::text[]),
  ('Quiet Prose', 'vibe', array['literary']::text[], '{}'::text[]),
  ('Deep Dive', 'plot', array['nonfiction']::text[], '{}'::text[]),
  ('Reportage', 'plot', array['nonfiction']::text[], array['journalism']::text[]),
  ('Field Notes', 'setting_world', array['nonfiction']::text[], '{}'::text[]),
  ('Village Life', 'setting_world', array['cozy']::text[], '{}'::text[]),
  ('Baking & Recipes', 'setting_world', array['cozy']::text[], array['baking and recipes']::text[]),
  ('Community Fair', 'setting_world', array['cozy']::text[], '{}'::text[]),
  ('First Heartbreak', 'plot', array['young adult']::text[], '{}'::text[]),
  ('Boarding School', 'setting_world', array['young adult']::text[], '{}'::text[]),
  ('Coming Out', 'plot', array['young adult']::text[], '{}'::text[]),
  ('Hidden Magic', 'plot', array['fantasy']::text[], '{}'::text[]),
  ('Portal World', 'setting_world', array['fantasy']::text[], '{}'::text[])
on conflict do nothing;
