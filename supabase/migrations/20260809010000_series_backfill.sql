-- Backfill series membership + position out of Goodreads title residue, and clean the titles.
--
-- 449 of 452 books carry `Title (Series, #N)` in their title string — Goodreads' export format,
-- authoritative series data the app has never read. 81% of the library appeared series-less while
-- holding its own series data.
--
-- ── The parser is PORTED, and the port was verified rather than trusted ─────────────────────────
-- The peel/parse CTEs are `packages/core/src/seriesTitle.ts`'s parseSeriesFromTitle reimplemented in
-- SQL, copied verbatim from docs/queries/series-backfill-preview.sql: the same REF alternation, the
-- same peel over stacked trailing parentheticals, the same ';'-split, and the same rule that a
-- parenthetical is consumed only if EVERY part is series-shaped — so `(Deluxe Edition)`,
-- `(We Are Bob)` and `(and Other War Crimes)` all survive. Parity was checked over 5,827 generated
-- cases, zero divergences, and both porting bugs that exercise found are present here:
--   · `cardinality(string_to_array(...)) > 0` — `string_to_array('', ';')` is `{}` in Postgres but
--     `''.split(';')` is `['']` in JS, so an empty `()` satisfied "all parts series-shaped" vacuously.
--   · the opening `btrim`, without which a whitespace-only title kept its space.
-- The trailing-number hypothesis was tested directly against both implementations before this was
-- written: `Binding 13 (Boys of Tommen, #1)` → 1, `Saving 6 (…, #3)` → 3, `Releasing 10 (…, #5)` → 5.
-- A number at the END of a title is never captured; the ref regex is anchored inside the parenthetical.
--
-- ── WHY A FUNCTION, NOT A BARE SCRIPT ──────────────────────────────────────────────────────────
-- Two of this branch's guards are impossible against inline migration SQL. Idempotence has to be
-- proven by RUNNING it twice and diffing a whole-table snapshot, and pgTAP has to exercise each
-- category against fixtures it inserts itself — neither can re-run a statement that already ran at
-- migrate time. So the work lives in a function the migration calls once, and the tests call again.
-- It is also a genuinely re-runnable repair, which is worth having when the next dirty import lands.
--
-- ── The write rule (owner's decision, 2026-08) ─────────────────────────────────────────────────
-- PARSED WINS UNCONDITIONALLY where a title parenthetical exists. The original spec said "never
-- overwrite an existing series", but ~20 existing values were worse than the parsed one
-- (`Zodiac-Academy`, `The Edge of Darkness Trilogy`, `Stormlight Archive` missing its `The`) and
-- five were simply wrong (`Sheik's Caravan` on _Caraval_, `Bookbound Bunny` on _Bunny_). Those came
-- from enrichment: `enrich/index.ts` clears the COVER on a no-confidence match but returns the
-- SERIES from that same disclaimed match, and `mergeImport`'s fill-when-blank writes it. So the
-- contest is not "parsed vs the reader" — it is the reader's own export data versus a match the
-- enricher itself scored as worthless. Recorded in docs/BACKLOG.md as its own fix.
--
-- TWO EXCEPTIONS, HARDCODED, NOT DERIVED:
--   · `Rose Hill (Silver)`        — disambiguates two distinct Rose Hill series; parsed would flatten them.
--   · `Hades x Persephone Saga`   — our own canonical merge target; parsed would revert it.
-- A book already carrying either keeps it. Everything else takes parsed.

create or replace function public.backfill_series_from_titles()
returns jsonb
language plpgsql
set search_path = public
as $fn$
declare
  v_bad text;
  n_book_title int := 0;
  n_entry_title int := 0;
  n_series int := 0;
  n_omnibus int := 0;
  n_adopted int := 0;
begin
  -- Re-entrant: the tests call this twice in one transaction to prove idempotence.
  drop table if exists _sbt_parse;

  create temp table _sbt_parse as
  with recursive
  -- Normalization runs BEFORE the peel. A title in mathematical bold has no ASCII `#` and cannot
  -- match the ref regex at all, so normalizing afterwards would be useless. NFKC folds mathematical
  -- bold and fullwidth to ASCII; it does NOT remove zero-width, so those are stripped separately via
  -- translate() (regex \uXXXX inside a bracket expression is easy to get subtly wrong; translate
  -- dropping every `from` char with no counterpart is unambiguous).
  -- ZW set: U+200B ZWSP, U+200C ZWNJ, U+200D ZWJ, U+2060 WORD JOINER, U+FEFF ZWNBSP.
  src as (
    select 'books'::text as tbl, b.id, b.owner_id, b.title as raw_original,
           btrim(translate(normalize(b.title, NFKC),
                 chr(8203)||chr(8204)||chr(8205)||chr(8288)||chr(65279), '')) as title,
           b.series as series_name, null::uuid as book_id, null::uuid as series_id
    from public.books b
    union all
    select 'series_entries', e.id, e.owner_id, e.title,
           btrim(translate(normalize(e.title, NFKC),
                 chr(8203)||chr(8204)||chr(8205)||chr(8288)||chr(65279), '')),
           s.name, e.book_id, e.series_id
    from public.series_entries e join public.series s on s.id = e.series_id
    where e.removed_at is null
  ),
  peel as (
    select tbl, id, owner_id, raw_original, title as raw, btrim(title) as remaining, 0 as depth,
           null::text as inner_txt, series_name, book_id, series_id
    from src
    union all
    select p.tbl, p.id, p.owner_id, p.raw_original, p.raw,
           btrim((regexp_match(p.remaining, '^(.*?)\s*\(([^()]*)\)\s*$'))[1]),
           p.depth + 1,
           (regexp_match(p.remaining, '^(.*?)\s*\(([^()]*)\)\s*$'))[2],
           p.series_name, p.book_id, p.series_id
    from peel p
    where p.remaining ~ '^(.*?)\s*\(([^()]*)\)\s*$'
      and coalesce((regexp_match(p.remaining, '^(.*?)\s*\(([^()]*)\)\s*$'))[1], '') <> ''
      and cardinality(string_to_array((regexp_match(p.remaining, '^(.*?)\s*\(([^()]*)\)\s*$'))[2], ';')) > 0
      and not exists (
        select 1 from unnest(string_to_array((regexp_match(p.remaining, '^(.*?)\s*\(([^()]*)\)\s*$'))[2], ';')) part
        where part !~* '^\s*(.+?),?\s+(?:#\s*([0-9]+(?:\.[0-9]+)?)(?:\s*[-–]\s*#?[0-9]+(?:\.[0-9]+)?)?|book\s+([0-9]+(?:\.[0-9]+)?)|#\s*([0-9]+(?:\.[0-9]+)?\s*[-–]\s*[0-9]+(?:\.[0-9]+)?))\s*$'
      )
  ),
  deepest as (
    select distinct on (tbl, id) tbl, id, owner_id, raw_original, raw, remaining as clean_title,
           inner_txt, depth, series_name, book_id, series_id
    from peel order by tbl, id, depth desc
  )
  select d.tbl, d.id, d.owner_id, d.raw_original, d.raw, d.clean_title, d.depth,
         d.series_name, d.book_id, d.series_id,
         btrim((regexp_match((string_to_array(d.inner_txt, ';'))[1],
           '^\s*(.+?),?\s+(?:#\s*([0-9]+(?:\.[0-9]+)?)(?:\s*[-–]\s*#?[0-9]+(?:\.[0-9]+)?)?|book\s+([0-9]+(?:\.[0-9]+)?)|#\s*([0-9]+(?:\.[0-9]+)?\s*[-–]\s*[0-9]+(?:\.[0-9]+)?))\s*$', 'i'))[1]) as parsed_series,
         case
           when d.depth = 0 then null
           when position('#' in (string_to_array(d.inner_txt, ';'))[1]) > 0
                and substr((string_to_array(d.inner_txt, ';'))[1],
                           position('#' in (string_to_array(d.inner_txt, ';'))[1])) ~ '[-–]' then null
           else coalesce(
             (regexp_match((string_to_array(d.inner_txt, ';'))[1],
               '^\s*(.+?),?\s+(?:#\s*([0-9]+(?:\.[0-9]+)?)(?:\s*[-–]\s*#?[0-9]+(?:\.[0-9]+)?)?|book\s+([0-9]+(?:\.[0-9]+)?)|#\s*([0-9]+(?:\.[0-9]+)?\s*[-–]\s*[0-9]+(?:\.[0-9]+)?))\s*$', 'i'))[2],
             (regexp_match((string_to_array(d.inner_txt, ';'))[1],
               '^\s*(.+?),?\s+(?:#\s*([0-9]+(?:\.[0-9]+)?)(?:\s*[-–]\s*#?[0-9]+(?:\.[0-9]+)?)?|book\s+([0-9]+(?:\.[0-9]+)?)|#\s*([0-9]+(?:\.[0-9]+)?\s*[-–]\s*[0-9]+(?:\.[0-9]+)?))\s*$', 'i'))[3]
           )::numeric
         end as parsed_position,
         (d.depth > 0
          and position('#' in (string_to_array(d.inner_txt, ';'))[1]) > 0
          and substr((string_to_array(d.inner_txt, ';'))[1],
                     position('#' in (string_to_array(d.inner_txt, ';'))[1])) ~ '[-–]') as is_range,
         (d.clean_title = 'Untitled') as is_untitled
  from deepest d;

  -- ── ABORT, never skip ────────────────────────────────────────────────────────────────────────
  -- A row that consumed a parenthetical but yielded no series, or would end up with an empty title,
  -- or (not being a range) yielded no position, is a parse this migration does not understand.
  -- Skipping it silently is how a repair damages the rows it was supposed to leave alone.
  select string_agg(format('  %s %s: %L', tbl, id, raw_original), E'\n' order by tbl, id)
    into v_bad
  from _sbt_parse
  where depth > 0
    and ( coalesce(btrim(parsed_series), '') = ''
       or coalesce(btrim(clean_title), '') = ''
       or (not is_range and not is_untitled and parsed_position is null) );

  if v_bad is not null then
    raise exception E'series backfill ABORTED — row(s) did not parse cleanly:\n%', v_bad;
  end if;

  -- ── 1. Clean book titles. `Untitled` rows are excluded ENTIRELY (title, series and position all
  --       left untouched): they are unreleased placeholders and cleaning them would make three rows
  --       indistinguishable from each other.
  update public.books b
     set title = p.clean_title
    from _sbt_parse p
   where p.tbl = 'books' and p.id = b.id
     and not p.is_untitled
     and coalesce(btrim(p.clean_title), '') <> ''
     and b.title is distinct from p.clean_title;
  get diagnostics n_book_title = row_count;

  -- ── 2. Clean series_entries titles, same exclusion.
  update public.series_entries e
     set title = p.clean_title
    from _sbt_parse p
   where p.tbl = 'series_entries' and p.id = e.id
     and not p.is_untitled
     and coalesce(btrim(p.clean_title), '') <> ''
     and e.title is distinct from p.clean_title;
  get diagnostics n_entry_title = row_count;

  -- ── 3. Series + position. PARSED WINS, except the two protected names. Omnibus ranges write
  --       nothing (a range is not a slot in a reading order); `Untitled` writes nothing.
  with canon(from_name, to_name) as (
    values ('Adrian X Isolde',      'Adrian x Isolde'),
           ('Hades & Persephone',   'Hades x Persephone Saga'),
           ('Hades X Persephone',   'Hades x Persephone Saga'),
           ('Dance with my Demons', 'Dance With My Demons'),
           ('Playing For Keeps',    'Playing for Keeps'),
           ('Fire and Metal',       'Fire & Metal')
  ),
  tgt as (
    select p.id,
           coalesce(c.to_name, p.parsed_series) as new_series,
           p.parsed_position                    as new_position
    from _sbt_parse p
    left join canon c on c.from_name = p.parsed_series
    where p.tbl = 'books'
      and p.depth > 0
      and not p.is_range
      and not p.is_untitled
      -- the two hardcoded exceptions, compared against the EXISTING value
      and coalesce(p.series_name, '') not in ('Rose Hill (Silver)', 'Hades x Persephone Saga')
  )
  update public.books b
     set series = t.new_series, position = t.new_position
    from tgt t
   where b.id = t.id
     and (b.series is distinct from t.new_series or b.position is distinct from t.new_position);
  get diagnostics n_series = row_count;

  -- ── 4. Omnibus entries: TOMBSTONE rather than delete, so a reader's removal of one stays
  --       expressible. Same shape as remove_series_entry's own write.
  update public.series_entries e
     set removed_at = now(), book_id = null, user_edited = true
    from _sbt_parse p
   where p.tbl = 'series_entries' and p.id = e.id
     and p.is_range
     and e.removed_at is null;
  get diagnostics n_omnibus = row_count;

  -- ── 5. Orphan-ghost adoption, by matchEntryForBook's RULE rather than by a hardcoded id: an
  --       unlinked live entry whose CLEANED title matches exactly one of the owner's books, where
  --       that book is not already linked elsewhere in the same series. Both sides are cleaned
  --       before comparing — the book's title may have been dirty too, which is exactly how these
  --       pairs came to look different. Ambiguity adopts nothing, deliberately: reviving the wrong
  --       slot resurrects a removal the reader made on purpose, which is worse than a missed
  --       revive they can see and redo.
  with cand as (
    -- `min(uuid)` does not exist in Postgres; the ordered array pick is the portable form.
    select g.id as entry_id, g.series_id,
           (array_agg(b.id order by b.id))[1] as book_id, count(*) as n
    from _sbt_parse g
    join _sbt_parse b
      on b.tbl = 'books' and b.owner_id = g.owner_id
     and lower(btrim(b.clean_title)) = lower(btrim(g.clean_title))
    where g.tbl = 'series_entries' and g.book_id is null
    group by g.id, g.series_id
  )
  update public.series_entries e
     set book_id = c.book_id
    from cand c
   where e.id = c.entry_id
     and c.n = 1
     and e.book_id is null
     and not exists (
       select 1 from public.series_entries e2
        where e2.series_id = c.series_id and e2.book_id = c.book_id and e2.id <> e.id
     );
  get diagnostics n_adopted = row_count;

  drop table if exists _sbt_parse;

  return jsonb_build_object(
    'book_titles_cleaned',   n_book_title,
    'entry_titles_cleaned',  n_entry_title,
    'series_written',        n_series,
    'omnibus_tombstoned',    n_omnibus,
    'orphans_adopted',       n_adopted
  );
end
$fn$;

-- Maintenance only. PUBLIC gets EXECUTE on every new function by default, so the revoke is the
-- boundary and the grant is defence in depth (docs/CLAUDE.md). Invoker rights, not security
-- definer: a function that rewrites every reader's titles must not be callable with the owner's
-- privileges by anyone who reaches it.
revoke execute on function public.backfill_series_from_titles() from public;
grant execute on function public.backfill_series_from_titles() to service_role;

do $$
declare r jsonb;
begin
  r := public.backfill_series_from_titles();
  raise notice 'series backfill: % book title(s) cleaned, % entry title(s) cleaned, % series written, % omnibus tombstoned, % orphan(s) adopted',
    r->>'book_titles_cleaned', r->>'entry_titles_cleaned', r->>'series_written',
    r->>'omnibus_tombstoned', r->>'orphans_adopted';
end $$;
