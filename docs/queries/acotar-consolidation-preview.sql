-- ACOTAR consolidation, Phase 4 of task-series-integrity-mechanism.md — the proof case for the
-- new merge_series/merge_books/set_series_order mechanism, first of ~22 more reconciliations
-- Block D found library-wide.
--
-- PREVIEW ONLY — every statement below is a SELECT. Nothing writes. Run this first; the actual
-- merge_series / merge_books / set_series_order write script gets drafted from these results,
-- following the same preview -> guarded fix -> post-run audit shape as every other production
-- fix this session (iron-flame-merge.sql, empyrean-cross-owner-duplicate.sql).
--
-- What this needs, per the task doc, stated whole:
--   1. The series-record merge itself — two public.series rows for the same real series
--      ("ACOTAR" and "A Court of Thorns and Roses" are the pilot case) via merge_series.
--   2. The Mist-and-Fury book-row merge via merge_books (owner-confirmed duplicate books row from
--      a messy import — the Iron-Flame shape, not a genuine second copy).
--   3. Position correction to the EXACT ruled order: 1 Thorns and Roses / 2 Mist and Fury /
--      3 Wings and Ruin / 3.5 Frost and Starlight (novella) / 4 DELIBERATELY VACANT /
--      5 Silver Flames. Not Wikidata's (3/3.1/4), not Wikipedia's. Via set_series_order, run
--      AFTER the merges land, so it's the authoritative final word regardless of whatever
--      intermediate position merge_series's own collision-resolution produces.
--   4. Wings-and-Ruin's ghost entry (dd33f8da), user_edited=true, OWNER-REVIEWED AND OVERRIDDEN
--      2026-08-09 — must NOT be treated as a stale flag to auto-correct. Confirm it's still in
--      that state before anything else runs; if it changed, stop and re-report rather than assume.

\set ON_ERROR_STOP on

-- ── 1. Every public.series row whose name plausibly names this series ─────────────────────────
-- Run this FIRST with no assumptions about exact spelling/capitalization — merge_series requires
-- the caller to compute both name keys (seriesNameKey does NOT auto-collapse "ACOTAR" and
-- "A Court of Thorns and Roses" — that pair is Tier 3 by design), so the exact `name` string on
-- each row, verbatim, is what the write script needs.
select 'Q1. candidate series rows' as section,
       s.id, s.owner_id, s.name, s.length, s.created_at,
       (select count(*) from public.series_entries e
         where e.series_id = s.id and e.removed_at is null) as live_entries,
       (select count(*) from public.series_entries e
         where e.series_id = s.id and e.removed_at is not null) as tombstoned_entries
from public.series s
where s.name ilike '%thorns and roses%'
   or s.name ilike '%acotar%'
   or s.name ilike '%court of%'
order by s.created_at;
-- Expected: exactly 2 rows (the ACOTAR/A-Court-of-Thorns-and-Roses pair) unless the library holds
-- more variants than triage assumed — if more than 2, STOP and report rather than guessing which
-- pair to merge.

-- ── 2. Every series_entries row in EITHER candidate series, live or tombstoned ─────────────────
-- Substitute the two series ids from Q1 below once known; left as a name-based join for the first
-- run so no id needs to be guessed.
select 'Q2. entries in candidate series' as section,
       e.id as entry_id, e.series_id, s.name as series_name, e.position, e.title, e.author,
       e.book_id, b.title as book_title, b.read_status,
       e.removed_at, e.user_edited, e.source, e.label
from public.series_entries e
join public.series s on s.id = e.series_id
left join public.books b on b.id = e.book_id
where s.name ilike '%thorns and roses%'
   or s.name ilike '%acotar%'
   or s.name ilike '%court of%'
order by s.name, e.removed_at nulls first, e.position;
-- Expected shape, per the ruled order: five main-sequence books (positions vary until corrected),
-- Frost and Starlight (novella), the Wings-and-Ruin ghost (dd33f8da, book_id null), any tombstones.

-- ── 3. Wings-and-Ruin's ghost entry — confirm the owner-override is still exactly where it was
--      left (2026-08-09), before anything else runs.
select 'Q3. wings-and-ruin ghost state' as section,
       e.id, e.series_id, e.position, e.title, e.book_id, e.user_edited, e.removed_at, e.label
from public.series_entries e
where e.id = 'dd33f8da-ddde-44b3-87f1-e9d32e4abd3f'::uuid;
-- Expected: book_id IS NULL (still a ghost — if it now has a book_id, Wings and Ruin has since
-- been catalogued; report before proceeding, don't fold silently into this fix), user_edited =
-- true, position = 4 (the owner's own placement, per the 2026-08-09 override — NOT the ruled
-- table's final "3", since this row hasn't been corrected yet).

-- ── 4. Every book row plausibly naming Mist and Fury — the suspected duplicate-book-row pair.
select 'Q4. candidate Mist-and-Fury book rows' as section,
       b.id, b.owner_id, b.title, b.read_status, b.series, b.position, b.series_count,
       b.owned_physical, b.owned_ebook, b.owned_audiobook,
       (select count(*) from public.reads r where r.book_id = b.id) as reads_n,
       (select count(*) from public.series_entries e
         where e.book_id = b.id and e.removed_at is null) as live_entry_links
from public.books b
where b.title ilike '%mist and fury%'
order by b.id;
-- Expected: 2 rows (a duplicate pair from a messy import, per the owner's prior confirmation:
-- "not intended... incorrectly configured with our workflow"). If more or fewer than 2, STOP —
-- the Iron-Flame-shape assumption needs re-checking before a merge_books call gets drafted.

-- ── 5. Systemic sanity check — same shape as the Empyrean fix's Q4: any OTHER cross-owner
--      mismatch anywhere in series_entries right now, so this consolidation doesn't reopen or
--      collide with a class of bug already closed.
select 'Q5. cross-owner mismatch scan (should still be empty)' as section,
       e.id as entry_id, e.owner_id as entry_owner, b.owner_id as book_owner
from public.series_entries e
join public.books b on b.id = e.book_id
where e.removed_at is null
  and e.owner_id <> b.owner_id;
-- Expected: 0 rows.
