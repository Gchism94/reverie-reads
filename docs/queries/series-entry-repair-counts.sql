-- PREVIEW COUNTS — the blast radius. Every statement is a SELECT; nothing writes.
-- Same verified parser port as series-entry-repair-preview.sql (5,827-case parity, zero divergences).
--
-- Read `2b` and `3b` before authorising anything:
--   2b is the number of position disagreements the migration will DELIBERATELY LEAVE ALONE, because
--      the reader placed them (user_edited). If 2b is large, the source is disagreeing with the
--      reader a lot and that is worth understanding before repairing anything.
--   3b is orphan ghosts whose cleaned title matches MORE THAN ONE library book. The migration must
--      refuse those rather than pick — mirroring matchEntryForBook, where an undiscriminatable tie
--      claims nothing. A non-zero 3b means some ghosts cannot be adopted automatically at all.

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

select '1. dirty titles (books)'            as category, count(*) from dirty where tbl = 'books'
union all
select '1. dirty titles (series_entries)',   count(*) from dirty where tbl = 'series_entries'
union all
select '2a. position recoverable (user_edited = false)', count(*) from dirty
  where tbl = 'series_entries' and parsed_position is not null
    and position is distinct from parsed_position and not user_edited
union all
select '2b. position disagrees but READER-PLACED (skipped)', count(*) from dirty
  where tbl = 'series_entries' and parsed_position is not null
    and position is distinct from parsed_position and user_edited
union all
select '3a. orphan ghosts with exactly ONE matching book', count(*) from (
  select g.id from dirty g
  join parse b on b.tbl = 'books' and b.owner_id = g.owner_id
               and lower(btrim(b.clean_title)) = lower(btrim(g.clean_title))
  where g.tbl = 'series_entries' and g.book_id is null
  group by g.id having count(*) = 1) one
union all
select '3b. orphan ghosts matching MORE THAN ONE book (cannot auto-adopt)', count(*) from (
  select g.id from dirty g
  join parse b on b.tbl = 'books' and b.owner_id = g.owner_id
               and lower(btrim(b.clean_title)) = lower(btrim(g.clean_title))
  where g.tbl = 'series_entries' and g.book_id is null
  group by g.id having count(*) > 1) many
union all
select '4. omnibus entries (tombstone, not delete)', count(*) from dirty
  where tbl = 'series_entries' and is_range
order by 1;
