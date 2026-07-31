-- PREVIEW ONLY — every statement here is a SELECT. Nothing writes.
-- Run against production before authorising fix/series-entry-repair's migration.
--
-- ── The parser is PORTED, and the port was verified rather than trusted ─────────────────────────
-- `parse` below reimplements packages/core/src/seriesTitle.ts's parseSeriesFromTitle in SQL: the
-- same REF alternation (name + `#N` / `Book N` / `#N-M` range), the same peel loop over STACKED
-- trailing parentheticals, the same ';'-split within one parenthetical, and the same rule that a
-- parenthetical is consumed only if EVERY part is series-shaped — so "(Deluxe Edition)" is left
-- alone. It is not a looser regex; a looser regex is how a repair damages titles it should not touch.
--
-- Parity was checked by running both implementations over 5,827 generated cases — real ACOTAR
-- shapes, the parser's own test cases, ranges, stacked and ';'-joined refs, en-dashes, decimals,
-- unicode, and malformed parentheses — and diffing every field. Zero divergences. Two genuine
-- porting bugs were found and fixed by that exercise, both silent:
--   · `string_to_array('', ';')` is `{}` in Postgres but `''.split(';')` is `['']` in JS, so an
--     EMPTY parenthetical "()" satisfied "all parts are series-shaped" VACUOUSLY and was consumed.
--     The cardinality guard below is what stops that.
--   · the opening `btrim` was missing, so a title of only whitespace kept its space.
--
-- ── What the preview does NOT decide ───────────────────────────────────────────────────────────
-- Category 2 shows every position disagreement, including rows where `user_edited` is true. The
-- migration will recover positions ONLY where user_edited is false — a reader's deliberate placement
-- outranks the source's number even when the source is right. The column is shown so you can see
-- exactly which rows that rule protects before authorising anything.

with recursive
src as (
  select 'books'::text as tbl, b.id, b.owner_id, b.title, null::numeric as position,
         null::boolean as user_edited, null::uuid as book_id, b.series as series_name
  from public.books b
  union all
  select 'series_entries', e.id, e.owner_id, e.title, e.position,
         e.user_edited, e.book_id, s.name
  from public.series_entries e join public.series s on s.id = e.series_id
  where e.removed_at is null
),
-- Peel trailing parentheticals exactly as the TS loop does.
peel as (
  select tbl, id, owner_id, title as raw, btrim(title) as remaining, 0 as depth,
         null::text as inner_txt, position, user_edited, book_id, series_name
  from src
  union all
  select p.tbl, p.id, p.owner_id, p.raw,
         btrim((regexp_match(p.remaining, '^(.*?)\s*\(([^()]*)\)\s*$'))[1]),
         p.depth + 1,
         (regexp_match(p.remaining, '^(.*?)\s*\(([^()]*)\)\s*$'))[2],
         p.position, p.user_edited, p.book_id, p.series_name
  from peel p
  where p.remaining ~ '^(.*?)\s*\(([^()]*)\)\s*$'
    and coalesce((regexp_match(p.remaining, '^(.*?)\s*\(([^()]*)\)\s*$'))[1], '') <> ''
    -- cardinality guard: see the header. Without it, "()" is consumed and the TS parser never does.
    and cardinality(string_to_array((regexp_match(p.remaining, '^(.*?)\s*\(([^()]*)\)\s*$'))[2], ';')) > 0
    and not exists (
      select 1 from unnest(string_to_array((regexp_match(p.remaining, '^(.*?)\s*\(([^()]*)\)\s*$'))[2], ';')) part
      where part !~* '^\s*(.+?),?\s+(?:#\s*([0-9]+(?:\.[0-9]+)?)(?:\s*[-–]\s*#?[0-9]+(?:\.[0-9]+)?)?|book\s+([0-9]+(?:\.[0-9]+)?)|#\s*([0-9]+(?:\.[0-9]+)?\s*[-–]\s*[0-9]+(?:\.[0-9]+)?))\s*$'
    )
),
deepest as (
  select distinct on (tbl, id) tbl, id, owner_id, raw, remaining as clean_title, inner_txt, depth,
         position, user_edited, book_id, series_name
  from peel order by tbl, id, depth desc
),
parse as (
  select d.*,
         (string_to_array(d.inner_txt, ';'))[1] as chunk,
         -- refs[0] after unshift = first ';' part of the LEFTMOST consumed parenthetical
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
         -- a range parenthetical: an omnibus, which is not a slot in a reading order
         (d.depth > 0
          and position('#' in (string_to_array(d.inner_txt, ';'))[1]) > 0
          and substr((string_to_array(d.inner_txt, ';'))[1],
                     position('#' in (string_to_array(d.inner_txt, ';'))[1])) ~ '[-–]') as is_range
  from deepest d
),
dirty as (select * from parse where depth > 0)

-- ══ 1. TITLES CARRYING A SERIES PARENTHETICAL ══════════════════════════════════════════════════
select '1. dirty title' as category, tbl as source, id, series_name,
       raw as current_value, clean_title as proposed_value,
       parsed_position::text as encodes_position, user_edited::text as user_edited,
       case when is_range then 'RANGE — omnibus' else null end as note
from dirty

union all
-- ══ 2. STORED POSITION DISAGREES WITH THE TITLE'S ══════════════════════════════════════════════
-- user_edited shown deliberately: the migration will SKIP the true ones.
select '2. position disagrees', tbl, id, series_name,
       position::text, parsed_position::text, parsed_position::text, user_edited::text,
       case when user_edited then 'reader-placed — migration will NOT touch this' else 'recoverable' end
from dirty
where tbl = 'series_entries' and parsed_position is not null
  and position is distinct from parsed_position

union all
-- ══ 3. ORPHAN GHOSTS WHOSE CLEANED TITLE MATCHES A LIBRARY BOOK ════════════════════════════════
-- Both sides are cleaned before comparing: the BOOK's title may be dirty too, which is exactly how
-- these pairs came to look different in the first place.
select '3. orphan ghost', 'series_entries', g.id, g.series_name,
       g.raw, g.clean_title, g.parsed_position::text, g.user_edited::text,
       'matches book ' || b.id || ' — ' || b.clean_title
from dirty g
join parse b on b.tbl = 'books' and b.owner_id = g.owner_id
             and lower(btrim(b.clean_title)) = lower(btrim(g.clean_title))
where g.tbl = 'series_entries' and g.book_id is null

union all
-- ══ 4. OMNIBUS ENTRIES (a range is not a reading-order slot) ═══════════════════════════════════
select '4. omnibus entry', 'series_entries', id, series_name,
       raw, clean_title, null, user_edited::text, 'tombstone rather than delete'
from dirty
where tbl = 'series_entries' and is_range

order by 1, 4 nulls last, 5;
