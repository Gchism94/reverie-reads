-- PREVIEW ONLY — every statement is a SELECT. Nothing writes.
-- Run against production before authorising any series-position correction at scale.
--
-- Phase 3 of `docs/audits/series-position-integrity.md`: per-series position-integrity
-- snapshot, on the ENTIRE library, covering the three defect classes that surfaced on
-- ACOTAR:
--
--   (A)  duplicate books rows within a single series position range
--        (the Mist-and-Fury shape — two `public.books` rows for one physical book, both
--         tagged into the same series)
--   (B)  position disagreement with Wikidata P179/P1545 (a series has positions that don't
--        match the open-listing canonical, e.g. 5.5 / 6 in a 5-work series)
--   (C)  duplicate `public.series` rows naming the same franchise
--        (the ACOTAR vs "A Court of Thorns and Roses" shape — `docs/queries/duplicate-
--         series-audit.sql` was built to find this exact thing)
--
-- This is the GENERAL version of the audit. ACOTAR's specific deeper dive lives at
-- `docs/queries/acotar-position-audit.sql`.
--
-- Each defect counts rows, not the number of affected series — that's the number that
-- drives whether the fix is a per-series hand-edit or a backfill pipeline defect.

\set ON_ERROR_STOP on

-- ══ A. DUPLICATE-SERIES RECORDS — "ACOTAR / A Court of Thorns and Roses" SHAPE ══════════════
-- Cribbed and tightened from `docs/queries/duplicate-series-audit.sql`. We only need the
-- COUNT here, not the per-pair column dump — the final fix goes patch-by-pair regardless.
-- Three name-linkage heuristics from the original: norm-equal (lowercase + strip punct +
-- leading "the "), initialism (concatenated initials — ACOTAR works for "A Court Of
-- Thorns And Roses"), and prefix ≥ 4 chars.
--
-- The output is one row per duplicate_set. The reader decides the survivor.
with norm as (
  select s.id, s.name,
         -- simple normalised form: lowercase + strip some punctuation
         lower(regexp_replace(s.name, '[^[:alnum:][:space:]]', '', 'g')) as norm_name
  from public.series s
),
initials_form as (
  select id, name,
         -- initialism: the first letter of every word, lowercase, no separator
         lower(string_agg(substr(word,1,1), '')) as initials
  from (
    select id, name, regexp_split_to_table(lower(regexp_replace(name, '[^[:alnum:][:space:]]', '', 'g')), E'\\s+') as word
    from norm
  ) w
  where length(word) > 0
  group by id, name
),
pairs as (
  select a.id as a_id, a.name as a_name, b.id as b_id, b.name as b_name,
         case
           when a.norm_name = b.norm_name                  then 'norm-equal'
           when a.initials = b.initials
                and length(a.norm_name) >= 4               then 'initialism'
           when a.norm_name like b.norm_name || '%'
                and length(b.norm_name) >= 4               then 'prefix-a'
           when b.norm_name like a.norm_name || '%'
                and length(a.norm_name) >= 4               then 'prefix-b'
         end as link
  from norm a
  cross join norm b
  join initials_form ai on ai.id = a.id
  join initials_form bi on bi.id = b.id
  where a.id < b.id
)
select 'A. duplicate-series records' as section,
       link,
       a_name, b_name,
       (select count(*) from public.series_entries
         where series_id in (a_id, b_id) and removed_at is null) as live_entries_count
from pairs
where link is not null
order by live_entries_count desc, a_name;

-- ══ B. DUPLICATE BOOKS WITHIN A SERIES POSITION RANGE — "two Mist-and-Fury rows" SHAPE ════
-- For every series that has more than one `public.books` row sharing the same
-- `lower(title)` (after the prefix-collapses), report the duplicate-bearers. We rely on
-- `public.books.series` (the legacy text carry) AND `public.series_entries.book_id` (the
-- post-#160 truth) — a row can have its `series` text written before `series_entries`
-- existed and never have been migrated. The output is one row per (series, title) pair
-- with the count of alive book rows that share it.
with all_series_books as (
  -- rows that have `series` text set, attributed via `books.series`
  select b.owner_id, b.series as series_name, b.id as book_id, b.title
  from public.books b
  where b.series is not null and length(b.series) > 0
  union
  -- rows that have `series_entries` linkage, attributed via series.name
  select e.owner_id, s.name as series_name, e.book_id, e.title
  from public.series_entries e
  join public.series s on s.id = e.series_id
  where e.removed_at is null and e.book_id is not null
),
dupes as (
  select series_name, lower(title) as ltitle, count(*) as n
  from all_series_books
  where book_id is not null
  group by series_name, lower(title)
  having count(*) > 1
)
select 'B. duplicate books within a series' as section,
       d.series_name,
       d.ltitle   as title,
       d.n        as n_dupes,
       (select string_agg(b.id::text, ', ' order by b.created_at)
        from all_series_books asb
        join public.books b on b.id = asb.book_id
        where asb.series_name = d.series_name
          and lower(asb.title) = d.ltitle
       ) as book_ids,
       (select string_agg(coalesce(b.read_status,'NULL'), ', ' order by b.created_at)
        from all_series_books asb
        join public.books b on b.id = asb.book_id
        where asb.series_name = d.series_name
          and lower(asb.title) = d.ltitle
       ) as read_statuses
from dupes d
order by d.n desc, d.series_name, d.ltitle;

-- ══ C. POSITION COLLISIONS WITHIN A SERIES — "two books at position 4" SHAPE ═══════════════
-- Different shape from (B): two DIFFERENT titles share a `series_entries.position` in
-- the same series. That is the position-assignment defect class — distinct book rows
-- got the same slot, regardless of whether they're otherwise legitimate. We look at
-- `series_entries.position`, which is what the UI renders; the legacy carry on
-- `public.books.position` shows in the trailing read-only block.
with collisions as (
  select e.series_id, s.name as series_name, e.position,
         count(*) as n_rows,
         string_agg(distinct lower(e.title), ' | ' order by lower(e.title)) as titles
  from public.series_entries e
  join public.series s on s.id = e.series_id
  where e.removed_at is null
    and e.position is not null
  group by e.series_id, s.name, e.position
  having count(*) > 1
)
select 'C. position-collision series_entries' as section,
       series_name, position, n_rows, titles
from collisions
order by n_rows desc, series_name, position;

-- Also surface the legacy carry — `public.books.position` collisions. Same defect
-- expressed in the pre-#160 schema's data shape; not always reachable from the
-- series_entries view (a row might have `books.position` but no `series_entries`
-- linkage), so we list it independently.
select 'C-legacy. position-collision on books.position' as section,
       b.owner_id,
       b.series        as series_name,
       b.position,
       count(*)        as n_rows,
       string_agg(b.title, ' | ' order by b.title) as titles
from public.books b
where b.series is not null and length(b.series) > 0
  and b.position is not null
group by b.owner_id, b.series, b.position
having count(*) > 1
order by n_rows desc, b.series, b.position;

-- ══ D. CLUSTER SUMMARY — DOES THIS GENERALISE? ════════════════════════════════════════════
-- If every series in the library has at least one (B) or (C) row, this is systemic. If
-- only a handful do, it's incident-specific per-series hand-edit territory. This block
-- summarises the shape — combine with (B) and (C) to decide.
select 'D. cluster summary' as section,
  (select count(*) from public.series) as total_series,
  (select count(distinct series_name)
   from (select b.series as series_name from public.books b
         where b.series is not null
         union
         select s.name as series_name from public.series s) x
  ) as total_distinct_series_names,
  (select count(*) from public.books where series is not null and length(series) > 0) as total_books_with_legacy_series,
  (select count(*) from public.series_entries where removed_at is null) as total_live_series_entries;
