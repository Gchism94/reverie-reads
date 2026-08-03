-- DIAGNOSTIC for duplicate positions within a series. READ-ONLY, one statement.
-- Run against production. For every series colliding BEFORE or AFTER the migration, lists each of
-- its books with the stored number, the parsed number, which branch writes it, and whether the
-- collision RESOLVES, PERSISTS or is NEW.
--
-- ── THIS FILE WAS REWRITTEN, 2026-08. The earlier version answered a question that no longer ─────
-- ── exists. ─────────────────────────────────────────────────────────────────────────────────────
-- Its first version was written against the NEVER-OVERWRITE rule, and its whole point was to
-- separate a collision the migration CREATES from one that ALREADY EXISTS — because under that rule
-- a book with a stored series kept its stored position, so the migration mostly changed nothing and
-- "did this backfill cause it?" was the live question. It reported `EXISTING kept — migration writes
-- nothing` on every row, which was true of the rule it encoded and false of the migration.
--
-- Under PARSED WINS that question is gone: a book carrying a series parenthetical has BOTH its
-- series and its position replaced, so there is no "migration writes nothing" branch left for a
-- dirty-titled book to fall into. The live question is the opposite one — the stored numbers were
-- the damage, the parsed numbers are the repair, so: does the repair actually land, and does any
-- collision survive it?
--
-- `verdict` is the column to read:
--   · RESOLVED  — collides today, does not after. The repair worked on this series.
--   · PERSISTS  — collides today AND after. Two parentheticals genuinely print the same number, or
--                 an exception row is holding a stored number against a parsed one.
--   · NEW       — does not collide today, does after. This one needs a decision before authorising:
--                 positionsAreInSeriesIndices renumbers the WHOLE series on any duplicate, so a
--                 single new collision discards every parsed number in it.
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
-- So if a `parsed_position` below is wrong, it is a title shape not covered above —
-- `parenthetical_parsed` is printed precisely so the actual parenthetical is visible, not assumed.

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
         ('Fire and Metal',     'Fire & Metal'),
         -- Book one's title, printed as the series by the export. A rename, not a protection, so
         -- the parenthetical's position lands rather than a wrong stored one being frozen.
         ('Divine Rivals',      'Letters of Enchantment')
),
bk as (
  select p.*, (p.clean_title = 'Untitled') as is_untitled,
         coalesce(c.to_name, p.parsed_series) as canon_series
  from parse p left join canon c on c.from_name = p.parsed_series
),
-- The migration's `tgt` predicate, clause for clause. Any row NOT matching it keeps both fields.
final as (
  select bk.*,
         ( bk.is_untitled
           or bk.is_range
           or bk.depth = 0
           or coalesce(bk.series_name, '') in ('Rose Hill (Silver)', 'Hades x Persephone Saga')
         ) as untouched
  from bk
),
state as (
  select f.*,
         case when f.untouched then f.series_name else f.canon_series end    as final_series,
         case when f.untouched then f.position    else f.parsed_position end as final_position,
         case when f.is_untitled then 'excluded (bare Untitled) — untouched'
              when f.is_range    then 'omnibus range — untouched'
              when f.depth = 0   then 'no parenthetical — untouched'
              when coalesce(f.series_name, '') in ('Rose Hill (Silver)', 'Hades x Persephone Saga')
                then 'PROTECTED (existing name) — untouched'
              when f.canon_series is distinct from f.parsed_series
                then 'RENAMED — canonical name + parsed position written'
              when coalesce(btrim(f.series_name), '') = ''
                then 'BACKFILLED — parsed series + position written'
              else 'OVERWRITTEN — parsed series + position replace the stored ones'
         end as write_branch
  from final f
),
-- Collisions as they stand TODAY, keyed on the series each book currently sits in.
before_dupe as (
  select owner_id, series_name as series, position as pos
  from state
  where nullif(btrim(series_name),'') is not null and position is not null
  group by 1,2,3 having count(*) > 1
),
-- Collisions in the post-migration state.
after_dupe as (
  select owner_id, final_series as series, final_position as pos
  from state
  where nullif(btrim(final_series),'') is not null and final_position is not null
  group by 1,2,3 having count(*) > 1
),
-- Every series named by either set. A series is listed whole, not just its colliding pair: the
-- renumber that a collision triggers applies to the entire series, so the rest of it is context
-- the decision needs.
touched_series as (
  select owner_id, series from before_dupe
  union
  select owner_id, series from after_dupe
)
select
  ts.series                                              as series,
  s.raw_original                                         as title_as_stored,
  s.clean_title,
  s.inner_txt                                            as parenthetical_parsed,
  s.series_name                                          as existing_series,
  s.position                                             as existing_position,
  s.parsed_series,
  s.parsed_position,
  s.final_series,
  s.final_position,
  s.write_branch,
  -- Per BOOK: is this row part of a duplicate before, after, both, neither.
  case when bd.pos is not null and ad.pos is not null then 'collides BEFORE and AFTER'
       when bd.pos is not null                        then 'collided BEFORE only'
       when ad.pos is not null                        then 'collides AFTER only'
       else 'no duplicate on this row' end             as row_state,
  -- Per SERIES: the answer the migration is being judged on.
  case when bool_or(bd.pos is not null) over w and not bool_or(ad.pos is not null) over w
         then 'RESOLVED — collides today, clean after'
       when bool_or(bd.pos is not null) over w and bool_or(ad.pos is not null) over w
         then 'PERSISTS — still duplicated after; read parenthetical_parsed on the pair'
       when bool_or(ad.pos is not null) over w
         then 'NEW — clean today, duplicated after; DECIDE BEFORE AUTHORISING'
       else 'no duplicate' end                          as verdict
from touched_series ts
join state s
  on s.owner_id = ts.owner_id
 and (s.series_name = ts.series or s.final_series = ts.series)
left join before_dupe bd
  on bd.owner_id = s.owner_id and bd.series = s.series_name and bd.pos = s.position
left join after_dupe ad
  on ad.owner_id = s.owner_id and ad.series = s.final_series and ad.pos = s.final_position
window w as (partition by ts.owner_id, ts.series)
order by verdict desc, ts.series, s.final_position nulls last, s.clean_title;
