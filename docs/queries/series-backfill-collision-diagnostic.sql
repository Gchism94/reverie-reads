-- DIAGNOSTIC for the eight Q4a duplicate-position collisions. READ-ONLY, one statement.
-- Run against production. Answers, per colliding book: what the parser extracted, from which
-- parenthetical, and WHICH branch of the migration would supply its final position.
--
-- ── Why this exists ────────────────────────────────────────────────────────────────────────────
-- `series-backfill-preview.sql`'s Q4a reports collisions in the POST-migration state, which
-- conflates two very different things:
--   · a collision the migration CREATES  — both books backfilled, their PARSED positions collide.
--     This is the one that matters before authorising: it is new damage.
--   · a collision that ALREADY EXISTS    — the books have a series today, so the never-overwrite
--     rule keeps their existing position and the migration changes nothing. The series page is
--     already renumbering these, today, and will keep doing so whether or not this migration runs.
-- Q4a could not tell them apart, so eight collisions read as eight problems the backfill causes.
-- `blame` below is the column that separates them.
--
-- ── What the parser was already cleared of ─────────────────────────────────────────────────────
-- The hypothesis that the parser picks a number out of the TITLE (Binding 13, Releasing 10,
-- Saving 6, Blood & Roses Volume 1 all ending in a digit) was tested directly against both
-- implementations, on the real Goodreads title shapes:
--     Binding 13 (Boys of Tommen, #1)    -> Binding 13   | Boys of Tommen | 1
--     Keeping 13 (Boys of Tommen, #2)    -> Keeping 13   | Boys of Tommen | 2
--     Saving 6 (Boys of Tommen, #3)      -> Saving 6     | Boys of Tommen | 3
--     Releasing 10 (Boys of Tommen, #5)  -> Releasing 10 | Boys of Tommen | 5
--     Blood & Roses Volume 1 (Blood & Roses, #1-3) -> position '' (range, correctly no slot)
-- TS and the SQL port agree on every one. A trailing number in the title is NOT captured: the ref
-- regex is anchored to the parenthetical's contents, and the title is what remains after the peel.
-- So if a collision's `parsed_position` below is wrong, it is a title shape not covered above —
-- `inner_txt` is printed precisely so the actual parenthetical is visible rather than assumed.

with recursive
src as (
  select b.id, b.owner_id, b.title as raw_original,
         btrim(translate(normalize(b.title, NFKC),
               chr(8203)||chr(8204)||chr(8205)||chr(8288)||chr(65279), '')) as title,
         b.position, b.series as series_name
  from public.books b
),
peel as (
  select id, owner_id, raw_original, title as raw, btrim(title) as remaining, 0 as depth,
         null::text as inner_txt, position, series_name
  from src
  union all
  select p.id, p.owner_id, p.raw_original, p.raw,
         btrim((regexp_match(p.remaining, '^(.*?)\s*\(([^()]*)\)\s*$'))[1]),
         p.depth + 1,
         (regexp_match(p.remaining, '^(.*?)\s*\(([^()]*)\)\s*$'))[2],
         p.position, p.series_name
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
  select distinct on (id) id, owner_id, raw_original, raw, remaining as clean_title,
         inner_txt, depth, position, series_name
  from peel order by id, depth desc
),
parse as (
  select d.*,
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
                     position('#' in (string_to_array(d.inner_txt, ';'))[1])) ~ '[-–]') as is_range
  from deepest d
),
canon(from_name, to_name) as (
  values ('Adrian X Isolde',    'Adrian x Isolde'),
         ('Hades & Persephone', 'Hades x Persephone Saga'),
         ('Hades X Persephone', 'Hades x Persephone Saga'),
         ('Dance with my Demons','Dance With My Demons'),
         ('Playing For Keeps',  'Playing for Keeps'),
         ('Fire and Metal',     'Fire & Metal')
),
bk as (
  select p.*, (p.clean_title = 'Untitled') as is_untitled,
         coalesce(c.to_name, p.parsed_series) as canon_series
  from parse p left join canon c on c.from_name = p.parsed_series
),
final as (
  select bk.*,
         case when bk.is_untitled or bk.is_range then bk.series_name
              when bk.series_name is null then bk.canon_series
              else bk.series_name end as final_series,
         case when bk.is_untitled or bk.is_range then bk.position
              when bk.series_name is null then bk.parsed_position
              else bk.position end as final_position,
         -- WHICH BRANCH supplied the final position. This is the whole point of the query.
         case when bk.is_untitled then 'excluded (Untitled) — untouched'
              when bk.is_range   then 'omnibus — untouched'
              when bk.series_name is null then 'BACKFILLED — parsed_position written'
              else 'EXISTING kept — migration writes nothing' end as blame
  from bk
),
collisions as (
  select owner_id, final_series, final_position
  from final
  where nullif(btrim(final_series),'') is not null and final_position is not null
  group by 1,2,3 having count(*) > 1
)
select
  f.final_series,
  f.final_position                                        as colliding_at,
  f.blame,
  f.raw_original                                          as title_as_stored,
  f.clean_title,
  f.inner_txt                                             as parenthetical_parsed,
  f.parsed_series,
  f.parsed_position,
  f.series_name                                           as existing_series,
  f.position                                              as existing_position,
  -- Does the MIGRATION cause this collision, or is it already true today?
  case when bool_and(f.blame = 'EXISTING kept — migration writes nothing')
            over (partition by f.owner_id, f.final_series, f.final_position)
       then 'PRE-EXISTING — true today, migration changes nothing'
       when bool_or(f.blame = 'BACKFILLED — parsed_position written')
            over (partition by f.owner_id, f.final_series, f.final_position)
       then 'MIGRATION-CAUSED (at least partly) — decide before authorising'
       else 'mixed' end                                   as verdict
from final f
join collisions c
  on c.owner_id = f.owner_id and c.final_series = f.final_series
 and c.final_position = f.final_position
order by f.final_series, f.final_position, f.clean_title;
