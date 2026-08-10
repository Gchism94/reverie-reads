-- PREVIEW ONLY — every statement is a SELECT. Nothing writes.
-- Run against production before any ACOTAR position correction is written.
--
-- WHY A SECOND ACOTAR QUERY. acotar-position-audit.sql predates Phase 2 and describes a
-- seven-entry shape (positions 1, 2, 2.5, 4, 4, 5.5, 6) that no longer matches production:
-- series-position-collision-preview.sql now reports exactly ONE collision library-wide. Some
-- of that seven-row mess has been resolved since, and by what is not recorded. This file
-- re-establishes ground truth rather than reasoning from the old snapshot — the standing rule
-- that a stored ordinal must be traceable to something, not inherited from a stale summary.
--
-- THE CRITICAL UNKNOWN this is built to answer. The owner states they own "A Court of Wings
-- and Ruin", which makes the position-4 ghost (dd33f8da, book_id null, user_edited=true) stale
-- rather than a legitimate placeholder. But "owns it" has three materially different meanings
-- in this schema, and the fix differs for each:
--
--   (a) a books row EXISTS and is linked to a DIFFERENT series row  -> a series-identity
--       problem (the 222-name-variant fragmentation), not a position problem. The fix would be
--       a series merge, not a reposition.
--   (b) a books row EXISTS and is linked to NOTHING                 -> the ghost should ADOPT
--       it (or reconciliation will, once the page is opened), and the fix is a link plus a
--       position, not a tombstone.
--   (c) NO books row exists                                         -> "owns it" means a
--       physical/other-format copy that was never catalogued. The ghost is then the only
--       record of the book in the library, and tombstoning it DESTROYS that record rather
--       than cleaning up a duplicate.
--
-- Block 3 is what distinguishes them, and it is the reason this query exists at all. Do not
-- propose a fix before reading it: (a), (b) and (c) have different correct answers and the
-- same-looking diff.
--
-- Tombstones are INCLUDED throughout, deliberately. A removed row is not inert here — the
-- reconciliation in useSeriesDetail revives a tombstone whose title matches a book still naming
-- the series, so a tombstone is a live input to whatever happens next.

\set ON_ERROR_STOP on

-- ══ 0. THE SERIES ROW(S) ═════════════════════════════════════════════════════════════════════
-- The target row, plus every OTHER series row belonging to the same owner whose name could be
-- the same franchise written differently. If a second ACOTAR row exists, case (a) above is live
-- and a position correction on this row alone would be correcting half a split.
--
-- `length` is new (20260813010000, merged but NOT NECESSARILY DEPLOYED — confirm with
-- `supabase migration list --linked` before trusting a null here to mean "unset" rather than
-- "column does not exist yet on this database").
with target as (
  select id, owner_id, name from public.series
  where id = 'aa4e251e-be7a-45bf-a66b-78bbf9406e71'
)
select '0. series rows' as section,
       s.id,
       s.name,
       s.status,
       s.source,
       s.source_ref,
       s.length,
       s.created_at,
       (s.id = t.id)                                            as is_target,
       (select count(*) from public.series_entries e
         where e.series_id = s.id and e.removed_at is null)      as live_entries,
       (select count(*) from public.series_entries e
         where e.series_id = s.id and e.removed_at is not null)  as tombstones
from public.series s
join target t on s.owner_id = t.owner_id
where s.id = t.id
   or s.name ilike '%court%'
   or s.name ilike '%thorns%'
   or s.name ilike 'acotar%'
order by is_target desc, s.name;

-- ══ 1. EVERY ENTRY IN THE TARGET SERIES — live AND tombstoned ════════════════════════════════
-- The whole reading order on screen, with each row's linked book. No filtering: the collision
-- preview shows only colliding pairs, and a correction has to be proposed against the FULL
-- order or it will create the next collision while resolving this one.
--
-- `book_position` vs `position` is the Phase 2 synced-copy pair. They may disagree here: the
-- RPC that keeps them in step is merged but not yet deployed, and every writer before it wrote
-- them independently. A disagreement is expected, not a new defect — record it, do not chase it.
select '1. all entries' as section,
       e.id                                          as entry_id,
       e.position,
       e.title                                       as entry_title,
       e.author                                      as entry_author,
       e.label,
       e.book_id,
       b.title                                       as book_title,
       b.position                                    as book_position,
       b.series                                      as book_series_string,
       b.series_count                                as book_series_count,
       b.ownership,
       b.owned_physical,
       b.owned_ebook,
       b.owned_audiobook,
       b.borrowed,
       b.wishlist,
       -- `source` only: series_entries has NO source_ref column, despite
       -- docs/audits/series-count-schema.md §3's schema table listing one. Verified against
       -- the real table (\d public.series_entries) while syntax-checking this file. The audit
       -- is wrong on that one row; the series TABLE has source_ref, series_entries does not.
       e.source,
       e.user_edited,
       e.created_at,
       e.removed_at,
       (e.removed_at is null)                        as is_live
from public.series_entries e
left join public.books b on b.id = e.book_id
where e.series_id = 'aa4e251e-be7a-45bf-a66b-78bbf9406e71'
order by (e.removed_at is null) desc, e.position, e.created_at;

-- ══ 3. THE CRITICAL UNKNOWN — does a Wings-and-Ruin BOOKS row exist? ═════════════════════════
-- (Numbered 3 to match the narrative above; there is no block 2 by design — block 1 already
-- carries the per-entry book join that a separate block would have duplicated.)
--
-- Owner-scoped, title-matched loosely enough to survive punctuation and case ("A Court of Wings
-- & Ruin", "ACOWAR", a trailing edition suffix). Every hit reports whether it is linked to ANY
-- series entry anywhere — not just this series — because a book linked to a DIFFERENT series row
-- is case (a) and a book linked to nothing is case (b). Those are the two the naive query
-- ("not linked in THIS series") would collapse into one answer.
with target as (
  select id, owner_id from public.series
  where id = 'aa4e251e-be7a-45bf-a66b-78bbf9406e71'
)
select '3. wings-and-ruin candidates' as section,
       b.id                                          as book_id,
       b.title,
       b.author_first,
       b.author_last,
       b.series                                      as book_series_string,
       b.position                                    as book_position,
       b.series_count,
       b.ownership,
       b.owned_physical,
       b.owned_ebook,
       b.owned_audiobook,
       b.borrowed,
       b.wishlist,
       b.read_status,
       b.added_at,
       -- Linked anywhere at all? Which series, and is that link live?
       (select count(*) from public.series_entries e where e.book_id = b.id)                     as entry_links_total,
       (select count(*) from public.series_entries e where e.book_id = b.id and e.removed_at is null) as entry_links_live,
       (select string_agg(distinct s2.name, ' | ')
          from public.series_entries e
          join public.series s2 on s2.id = e.series_id
         where e.book_id = b.id)                                                                 as linked_series_names,
       (select count(*) from public.series_entries e
         where e.book_id = b.id and e.series_id = (select id from target))                       as linked_in_target_series,
       -- Which of the three cases this row implies, stated by the query rather than inferred by
       -- whoever reads it.
       case
         when (select count(*) from public.series_entries e
                where e.book_id = b.id and e.removed_at is null
                  and e.series_id <> (select id from target)) > 0
           then '(a) linked to ANOTHER series — identity split, not a position fix'
         when (select count(*) from public.series_entries e
                where e.book_id = b.id and e.removed_at is null) = 0
           then '(b) catalogued but UNLINKED — the ghost should adopt this row'
         else '(b/target) already linked in the target series'
       end                                                                                       as implies
from public.books b
join target t on b.owner_id = t.owner_id
where b.title ilike '%wings%ruin%'
   or b.title ilike '%acowar%'
   or regexp_replace(lower(b.title), '[^a-z0-9]+', '', 'g') like '%wingsandruin%'
order by b.added_at;

-- ══ 4. EVERY ACOTAR-NAMED BOOK, LINKED OR NOT ════════════════════════════════════════════════
-- The wider net: books whose own `series` string names this franchise, with their entry linkage.
-- Two things surface here that block 1 cannot — a catalogued franchise book with NO entry at all
-- (reconciliation has never run for it, and will seed one at a position of its own choosing the
-- next time the page is opened), and a book filed under a VARIANT series string, which is the
-- library-wide fragmentation this correction must not silently absorb.
with target as (
  select id, owner_id from public.series
  where id = 'aa4e251e-be7a-45bf-a66b-78bbf9406e71'
)
select '4. franchise books' as section,
       b.id            as book_id,
       b.title,
       b.series        as book_series_string,
       b.position      as book_position,
       b.series_count,
       (select count(*) from public.series_entries e
         where e.book_id = b.id and e.removed_at is null)   as live_entry_links,
       (select string_agg(distinct s2.name, ' | ')
          from public.series_entries e
          join public.series s2 on s2.id = e.series_id
         where e.book_id = b.id and e.removed_at is null)   as live_linked_series
from public.books b
join target t on b.owner_id = t.owner_id
where b.series ilike '%court%'
   or b.series ilike '%thorns%'
   or b.series ilike 'acotar%'
order by b.position nulls last, b.title;

-- ══ 5. HEADLINE — one row to paste back first ════════════════════════════════════════════════
with target as (
  select id, owner_id from public.series
  where id = 'aa4e251e-be7a-45bf-a66b-78bbf9406e71'
)
select '5. headline' as section,
       (select count(*) from public.series_entries e
         where e.series_id = (select id from target) and e.removed_at is null)     as live_entries,
       (select count(*) from public.series_entries e
         where e.series_id = (select id from target) and e.removed_at is not null) as tombstones,
       (select string_agg(e.position::text, ', ' order by e.position)
          from public.series_entries e
         where e.series_id = (select id from target) and e.removed_at is null)     as live_positions,
       (select count(*) from public.books b join target t on b.owner_id = t.owner_id
         where b.title ilike '%wings%ruin%')                                       as wings_and_ruin_books,
       (select count(*) from public.series s join target t on s.owner_id = t.owner_id
         where s.name ilike '%court%' or s.name ilike '%thorns%' or s.name ilike 'acotar%')
                                                                                    as acotar_series_rows;
