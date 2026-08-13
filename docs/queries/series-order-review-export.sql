-- Series-order review pass — production-side export (READ ONLY, every statement a SELECT).
--
-- Purpose: dump the CURRENT state of every series + its live entries for the owner, so the
-- Wikidata batch-lookup results (series_summary.csv / series_positions.csv, run 2026-08-13,
-- 40 series resolved with ordinals) can be diffed against what the library actually stores.
-- The diff itself happens offline; nothing here writes, and no fix is proposed until the
-- disagreement report is reviewed.
--
-- Run from your terminal (single session, though read-only so pooling can't hurt this one):
--   psql "$PROD_DB_URL" -f docs/queries/series-order-review-export.sql \
--     --csv -o series-production-state.csv
-- (--csv -o writes one CSV; the two result sets are separated by their 'section' column.)
-- Then send series-production-state.csv back to the review session.

\set ON_ERROR_STOP on

-- ── 1. Every series row the owner has ─────────────────────────────────────────────────────
select 'S1' as section,
       s.id::text        as series_id,
       s.name            as series_name,
       s.length::text    as claimed_length,
       (select count(*) from public.series_entries e
         where e.series_id = s.id and e.removed_at is null)::text as live_entries,
       ''                as position, '' as title, '' as book_id, '' as user_edited, '' as removed
from public.series s
where s.owner_id = 'd4bf8f6b-c754-48b6-914c-7ea0227bb7fa'::uuid

union all

-- ── 2. Every LIVE entry in every one of those series ──────────────────────────────────────
select 'S2' as section,
       e.series_id::text,
       s.name,
       '' as claimed_length,
       '' as live_entries,
       e.position::text,
       e.title,
       coalesce(e.book_id::text, '(ghost)'),
       e.user_edited::text,
       '' as removed
from public.series_entries e
join public.series s on s.id = e.series_id
where s.owner_id = 'd4bf8f6b-c754-48b6-914c-7ea0227bb7fa'::uuid
  and e.removed_at is null

order by 3, 1, 6;
