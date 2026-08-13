-- DUPLICATE-SERIES AUDIT. READ-ONLY, one statement. Run against production.
--
-- Finds every set of series NAMES that plausibly name one series, per owner, across BOTH homes a
-- name can live in: `series` rows (records with entries) and `books.series` strings (a name can
-- exist book-side with no row yet — rows are created lazily on first series-page open, series.ts
-- "find-or-create"). A duplicate pair where only one side has a row is still a duplicate.
--
-- Three linkage heuristics, each labelled in `why` so a false positive is inspectable:
--   · norm-equal    — same after lowercasing, stripping punctuation, and a leading "the "
--   · initialism    — one name equals the concatenated initials of the other's words
--                     (ACOTAR ↔ A Court Of Thorns And Roses; includes little words, since that is
--                     how these abbreviations are actually built)
--   · prefix        — one normalized name is a prefix of the other (≥ 4 chars), catching
--                     "Empyrean" ↔ "The Empyrean" beyond the leading-the strip
--
-- Provenance columns, for the backfill hypothesis: `created_at` on the series row dates the RECORD
-- (a row created after the 20260809 backfill deploy is the lazily-created long-form side; a row
-- predating it is hand-made or import-era). `src` is the row's source ('manual'/'hardcover').
-- Entry tallies split live/ghost/tombstone so a reader-authored ghost (the thing a merge must not
-- lose) is visible per record.

with owner_names as (
  -- every name in play, from both homes
  select owner_id, btrim(series) as name
  from public.books
  where nullif(btrim(series), '') is not null
  group by 1, 2
  union
  select owner_id, btrim(name)
  from public.series
  group by 1, 2
),
enriched as (
  select
    n.owner_id,
    n.name,
    lower(regexp_replace(regexp_replace(n.name, '^(the)\s+', '', 'i'), '[^a-z0-9]+', '', 'gi')) as norm,
    lower(regexp_replace(
      (select string_agg(left(w, 1), '' order by ord)
         from unnest(regexp_split_to_array(n.name, '\s+')) with ordinality t(w, ord)
        where w ~ '^[[:alnum:]]'), '[^a-z0-9]', '', 'gi')) as initials,
    s.id                                as series_id,
    s.source                            as src,
    s.created_at                        as row_created,
    s.refreshed_at,
    (select count(*) from public.books b
      where b.owner_id = n.owner_id and btrim(b.series) = n.name)                       as books,
    (select count(*) from public.books b
      where b.owner_id = n.owner_id and btrim(b.series) = n.name
        and b.series_count is not null)                                                 as books_with_count,
    (select max(b.series_count) from public.books b
      where b.owner_id = n.owner_id and btrim(b.series) = n.name)                       as max_series_count,
    (select count(*) from public.series_entries e
      where e.series_id = s.id and e.removed_at is null)                                as live_entries,
    (select count(*) from public.series_entries e
      where e.series_id = s.id and e.removed_at is null and e.book_id is null)          as ghost_entries,
    (select count(*) from public.series_entries e
      where e.series_id = s.id and e.removed_at is not null)                            as tombstones
  from owner_names n
  left join public.series s
    on s.owner_id = n.owner_id and btrim(s.name) = n.name
),
pairs as (
  select a.owner_id, a.name as name_a, b.name as name_b,
         case
           when a.norm = b.norm then 'norm-equal'
           when a.norm = b.initials or b.norm = a.initials then 'initialism'
           when length(a.norm) >= 4 and (b.norm like a.norm || '%' or a.norm like b.norm || '%')
             then 'prefix'
         end as why
  from enriched a
  join enriched b
    on a.owner_id = b.owner_id and a.name < b.name
  where a.norm = b.norm
     or a.norm = b.initials or b.norm = a.initials
     or (length(least(a.norm, b.norm)) >= 4
         and (b.norm like a.norm || '%' or a.norm like b.norm || '%'))
),
-- collapse pairs into connected sets per owner (small n: two hops of closure is plenty here,
-- and a set that needs more shows up as two overlapping rows rather than being lost)
sets as (
  select owner_id, least(name_a, name_b) as set_key, name_a as member, why from pairs
  union
  select owner_id, least(name_a, name_b), name_b, why from pairs
)
select
  st.owner_id::text        as owner,
  st.set_key               as duplicate_set,
  st.member                as name,
  string_agg(distinct st.why, '+')          as linked_by,
  e.series_id is not null  as has_row,
  e.src,
  e.row_created,
  e.books,
  e.books_with_count,
  e.max_series_count,
  e.live_entries,
  e.ghost_entries,
  e.tombstones
from sets st
join enriched e on e.owner_id = st.owner_id and e.name = st.member
group by st.owner_id, st.set_key, st.member, e.series_id, e.src, e.row_created,
         e.books, e.books_with_count, e.max_series_count, e.live_entries, e.ghost_entries, e.tombstones
order by owner, duplicate_set, name;
