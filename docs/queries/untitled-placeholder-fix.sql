-- STAGED — DO NOT RUN. Pending the owner's separate explicit go-ahead.
--
-- One-time correction of the three production `books` rows found by series-entry-repair-counts.sql
-- category 1 ("dirty titles (books)"), all the same shape: an unreleased future volume whose title
-- still carries the `Untitled (Series, #N)` placeholder parenthetical.
--
--   4d92eaa3-60fa-44e1-a231-cfce2f51b820 | Fae & Alchemy  | "Untitled (Fae & Alchemy, #3)"
--   554a0b32-9b85-4131-abb7-929b0847ce95 | The Empyrean   | "Untitled (The Empyrean, #4)"
--   771c4566-f089-42e5-bd19-be9500e7d1cc | The Empyrean   | "Untitled (The Empyrean, #5)"
--
-- These are REAL `books` rows (not series_entries ghosts), each already carrying `series` +
-- `position` in their proper columns. The title's parenthetical is redundant display junk; the
-- series/position columns are the authority. The fix is therefore "clean the title to Untitled",
-- NOT "convert to a ghost" and NOT "migrate info from the title into the columns" (it is already
-- there).
--
-- WHY NOT A MIGRATION: 3 rows, fixed shape, one-time. The existing backfill
-- (20260809010000_series_backfill.sql) is idempotent and already deliberately SKIPS these rows via
-- its is_untitled guard — a second migration touching the same rows for a one-time fix would muddy
-- ownership and wouldn't be idempotent-relative-to-the-backfill. The general-case guard (stop new
-- placeholders accumulating as "dirty") is a CODE change to planTitleCleanup, not a migration —
-- landed separately in this same branch.
--
-- ── The defensive check ───────────────────────────────────────────────────────────────────────
-- The UPDATE re-parses each title's parenthetical with the SAME verified SQL port of
-- parseSeriesFromTitle used by the backfill migration and series-entry-repair-preview.sql (5,827-case
-- parity, zero divergences), and refuses the row UNLESS the parsed series + position EXACTLY MATCH
-- the stored `series` and `position`. This is the guard the report's Q3 called for: never strip a
-- parenthetical from a placeholder unless the dedicated columns already hold the same info, so two
-- `Untitled` rows in the same series can never be collapsed onto each other. A row that has drifted
-- (stored columns disagree with the parenthetical) is LEFT ALONE — surfaced by the final SELECT, not
-- silently repaired.
--
-- ── How to run, once approved ──────────────────────────────────────────────────────────────────
-- This file is SELECT-only except for the final UPDATE. Review the three preview SELECTs first;
-- they show (a) the rows as they are, (b) what the parser extracts from each title, and (c) which
-- rows the UPDATE will touch vs. refuse. Then run the UPDATE, then the verification SELECT. Run
-- against PRODUCTION only by hand from this file — never from a Code session, never via a raw
-- `supabase db push`, and only after the owner's separate explicit go-ahead on this exact SQL.

-- ══ PREVIEW 1 — the three rows as they stand ═══════════════════════════════════════════════════
select id, series, position, title
from public.books
where id in (
  '4d92eaa3-60fa-44e1-a231-cfce2f51b820',
  '554a0b32-9b85-4131-abb7-929b0847ce95',
  '771c4566-f089-42e5-bd19-be9500e7d1cc'
)
order by series, position;

-- ══ PREVIEW 2 — what the parser extracts from each title (the verified port) ═══════════════════
with recursive
peel as (
  select b.id, b.title as raw, btrim(b.title) as remaining, 0 as depth, null::text as inner_txt
  from public.books b
  where b.id in (
    '4d92eaa3-60fa-44e1-a231-cfce2f51b820',
    '554a0b32-9b85-4131-abb7-929b0847ce95',
    '771c4566-f089-42e5-bd19-be9500e7d1cc'
  )
  union all
  select p.id, p.raw,
         btrim((regexp_match(p.remaining, '^(.*?)\s*\(([^()]*)\)\s*$'))[1]),
         p.depth + 1,
         (regexp_match(p.remaining, '^(.*?)\s*\(([^()]*)\)\s*$'))[2]
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
  select distinct on (id) id, raw, remaining as clean_title, inner_txt, depth
  from peel order by id, depth desc
)
select d.id,
       d.raw,
       d.clean_title,
       btrim((regexp_match((string_to_array(d.inner_txt, ';'))[1],
         '^\s*(.+?),?\s+(?:#\s*([0-9]+(?:\.[0-9]+)?)(?:\s*[-–]\s*#?[0-9]+(?:\.[0-9]+)?)?|book\s+([0-9]+(?:\.[0-9]+)?)|#\s*([0-9]+(?:\.[0-9]+)?\s*[-–]\s*[0-9]+(?:\.[0-9]+)?))\s*$', 'i'))[1]) as parsed_series,
       coalesce(
         (regexp_match((string_to_array(d.inner_txt, ';'))[1],
           '^\s*(.+?),?\s+(?:#\s*([0-9]+(?:\.[0-9]+)?)(?:\s*[-–]\s*#?[0-9]+(?:\.[0-9]+)?)?|book\s+([0-9]+(?:\.[0-9]+)?)|#\s*([0-9]+(?:\.[0-9]+)?\s*[-–]\s*[0-9]+(?:\.[0-9]+)?))\s*$', 'i'))[2],
         (regexp_match((string_to_array(d.inner_txt, ';'))[1],
           '^\s*(.+?),?\s+(?:#\s*([0-9]+(?:\.[0-9]+)?)(?:\s*[-–]\s*#?[0-9]+(?:\.[0-9]+)?)?|book\s+([0-9]+(?:\.[0-9]+)?)|#\s*([0-9]+(?:\.[0-9]+)?\s*[-–]\s*[0-9]+(?:\.[0-9]+)?))\s*$', 'i'))[3]
       )::numeric as parsed_position
from deepest d;

-- ══ PREVIEW 3 — which rows the UPDATE will touch vs. refuse (dry run of the guard) ═════════════
-- match = true  → the UPDATE will clean the title to 'Untitled'
-- match = false → the UPDATE will SKIP this row (stored columns disagree with the parenthetical);
--                 it appears in the "refused" section below for manual review.
with recursive
peel as (
  select b.id, b.series, b.position, b.title as raw, btrim(b.title) as remaining, 0 as depth, null::text as inner_txt
  from public.books b
  where b.id in (
    '4d92eaa3-60fa-44e1-a231-cfce2f51b820',
    '554a0b32-9b85-4131-abb7-929b0847ce95',
    '771c4566-f089-42e5-bd19-be9500e7d1cc'
  )
  union all
  select p.id, p.series, p.position, p.raw,
         btrim((regexp_match(p.remaining, '^(.*?)\s*\(([^()]*)\)\s*$'))[1]),
         p.depth + 1,
         (regexp_match(p.remaining, '^(.*?)\s*\(([^()]*)\)\s*$'))[2]
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
  select distinct on (id) id, series, position, raw, remaining as clean_title, inner_txt, depth
  from peel order by id, depth desc
),
parsed as (
  select d.id, d.series, d.position, d.raw, d.clean_title,
         btrim((regexp_match((string_to_array(d.inner_txt, ';'))[1],
           '^\s*(.+?),?\s+(?:#\s*([0-9]+(?:\.[0-9]+)?)(?:\s*[-–]\s*#?[0-9]+(?:\.[0-9]+)?)?|book\s+([0-9]+(?:\.[0-9]+)?)|#\s*([0-9]+(?:\.[0-9]+)?\s*[-–]\s*[0-9]+(?:\.[0-9]+)?))\s*$', 'i'))[1]) as parsed_series,
         coalesce(
           (regexp_match((string_to_array(d.inner_txt, ';'))[1],
             '^\s*(.+?),?\s+(?:#\s*([0-9]+(?:\.[0-9]+)?)(?:\s*[-–]\s*#?[0-9]+(?:\.[0-9]+)?)?|book\s+([0-9]+(?:\.[0-9]+)?)|#\s*([0-9]+(?:\.[0-9]+)?\s*[-–]\s*[0-9]+(?:\.[0-9]+)?))\s*$', 'i'))[2],
           (regexp_match((string_to_array(d.inner_txt, ';'))[1],
             '^\s*(.+?),?\s+(?:#\s*([0-9]+(?:\.[0-9]+)?)(?:\s*[-–]\s*#?[0-9]+(?:\.[0-9]+)?)?|book\s+([0-9]+(?:\.[0-9]+)?)|#\s*([0-9]+(?:\.[0-9]+)?\s*[-–]\s*[0-9]+(?:\.[0-9]+)?))\s*$', 'i'))[3]
         )::numeric as parsed_position
  from deepest d
)
select id, series, position, raw,
       (series = parsed_series and position = parsed_position) as match,
       parsed_series, parsed_position,
       case when (series = parsed_series and position = parsed_position)
            then 'WILL CLEAN to Untitled'
            else 'REFUSED — stored columns disagree with parenthetical; left for manual review'
       end as action
from parsed
order by series, position;

-- ══ THE UPDATE — run only after reviewing previews 1–3 and the owner's go-ahead ═══════════════
-- Re-parses inline (same CTE) and writes 'Untitled' ONLY where the parsed series+position match the
-- stored columns. A row that drifted is untouched by construction — the WHERE clause fails for it.
with recursive
peel as (
  select b.id, b.title as raw, btrim(b.title) as remaining, 0 as depth, null::text as inner_txt
  from public.books b
  where b.id in (
    '4d92eaa3-60fa-44e1-a231-cfce2f51b820',
    '554a0b32-9b85-4131-abb7-929b0847ce95',
    '771c4566-f089-42e5-bd19-be9500e7d1cc'
  )
  union all
  select p.id, p.raw,
         btrim((regexp_match(p.remaining, '^(.*?)\s*\(([^()]*)\)\s*$'))[1]),
         p.depth + 1,
         (regexp_match(p.remaining, '^(.*?)\s*\(([^()]*)\)\s*$'))[2]
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
  select distinct on (id) id, remaining as clean_title, inner_txt, depth
  from peel order by id, depth desc
),
parsed as (
  select d.id, d.clean_title,
         btrim((regexp_match((string_to_array(d.inner_txt, ';'))[1],
           '^\s*(.+?),?\s+(?:#\s*([0-9]+(?:\.[0-9]+)?)(?:\s*[-–]\s*#?[0-9]+(?:\.[0-9]+)?)?|book\s+([0-9]+(?:\.[0-9]+)?)|#\s*([0-9]+(?:\.[0-9]+)?\s*[-–]\s*[0-9]+(?:\.[0-9]+)?))\s*$', 'i'))[1]) as parsed_series,
         coalesce(
           (regexp_match((string_to_array(d.inner_txt, ';'))[1],
             '^\s*(.+?),?\s+(?:#\s*([0-9]+(?:\.[0-9]+)?)(?:\s*[-–]\s*#?[0-9]+(?:\.[0-9]+)?)?|book\s+([0-9]+(?:\.[0-9]+)?)|#\s*([0-9]+(?:\.[0-9]+)?\s*[-–]\s*[0-9]+(?:\.[0-9]+)?))\s*$', 'i'))[2],
           (regexp_match((string_to_array(d.inner_txt, ';'))[1],
             '^\s*(.+?),?\s+(?:#\s*([0-9]+(?:\.[0-9]+)?)(?:\s*[-–]\s*#?[0-9]+(?:\.[0-9]+)?)?|book\s+([0-9]+(?:\.[0-9]+)?)|#\s*([0-9]+(?:\.[0-9]+)?\s*[-–]\s*[0-9]+(?:\.[0-9]+)?))\s*$', 'i'))[3]
         )::numeric as parsed_position
  from deepest d
)
update public.books b
   set title = 'Untitled'
  from parsed p
 where b.id = p.id
   and p.clean_title = 'Untitled'
   and b.series = p.parsed_series
   and b.position = p.parsed_position
   and b.title is distinct from 'Untitled';

-- ══ VERIFY — the three rows after the UPDATE ════════════════════════════════════════════════════
select id, series, position, title
from public.books
where id in (
  '4d92eaa3-60fa-44e1-a231-cfce2f51b820',
  '554a0b32-9b85-4131-abb7-929b0847ce95',
  '771c4566-f089-42e5-bd19-be9500e7d1cc'
)
order by series, position;
