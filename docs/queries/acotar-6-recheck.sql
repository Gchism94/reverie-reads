-- ACOTAR 6 — read-only re-check of ONE row, to resolve a contradiction between two dated claims.
--
-- PREVIEW ONLY — every statement is a SELECT. Nothing writes. Run against production by hand.
-- Staged rather than run: docs/tasks/task-series-integrity-mechanism.md § Standing bars a Code
-- session from touching the production database at all, "including read-only SELECTs". The local
-- dev database holds none of these rows (checked: zero rows for 2bec23ba), so running Block 1
-- there would return an empty result that proves nothing about production.
--
-- ══ THE CONTRADICTION ════════════════════════════════════════════════════════════════════════════
-- Two records disagree about whether 2bec23ba's single live entry ("ACOTAR 6") links to a `books`
-- row. Both are dated; neither is self-evidently stale.
--
--   2026-08-06 — docs/tasks/task-series-consolidation.md (085ed37), correcting its own Phase 1
--                audit: "'ACOTAR 6' is NOT a ghost (ghost_entries: 0, live_entries: 1, books: 1).
--                It is a real book row added through the acquire flow. Cascade would not destroy
--                the book, only its entry linkage."
--
--   2026-08-09 — the owner's ruling on fix/acotar-position-correction, from
--                docs/queries/acotar-followup.sql Block 1: "a real, distinct, legitimate GHOST for
--                the unreleased 6th book" — i.e. book_id null.
--
-- This is not a bookkeeping detail. The consolidation spec calls ghost and tombstone cargo "the
-- highest-risk cargo" in a series merge, and reasons about what a cascade would and would not
-- destroy ON THE PREMISE THAT A BOOK ROW EXISTS. If it does not, that paragraph is reasoning about
-- something that is not there.
--
-- WHAT THIS QUERY IS FOR: the CURRENT value, stated plainly. It is not an attempt to decide which
-- historical claim was "more right" — both may have been accurate on their own date, which is
-- itself the finding. Block 2 exists to make the drift CAUSE determinable rather than guessed at.
--
-- ══ WHY A CAUSE IS RECOVERABLE AT ALL ═══════════════════════════════════════════════════════════
-- `series_entries_book_id_fkey` is ON DELETE SET NULL — verified against the live schema
-- (`confdeltype = 'n'`). So deleting a `books` row does not delete its series entry: it silently
-- turns that entry into a ghost, leaving no tombstone, no timestamp, and no other trace. A linked
-- entry becoming a ghost between 2026-08-06 and 2026-08-09 is therefore exactly what a book
-- deletion looks like from the entry's side — and it is indistinguishable, from the entry alone,
-- from an entry that was never linked. Block 2 asks the books table instead, which is the axis that
-- can tell those apart.

\set ON_ERROR_STOP on

-- ══ 1. THE ROW ITSELF — Block 1 of acotar-followup.sql, narrowed to the columns in dispute ═══════
-- `book_id` and `book_title` are the answer. Everything else is context for reading it.
-- If book_id IS NULL      -> it is a ghost today; the 2026-08-09 ruling describes the current state.
-- If book_id IS NOT NULL  -> it links a real book today; the 2026-08-06 spec describes it.
select '1. the ACOTAR 6 entry' as section,
       e.id                                       as entry_id,
       e.position,
       e.title                                    as entry_title,
       e.book_id,                                 -- <- THE DISPUTED VALUE
       b.title                                    as book_title,       -- <- and its corroboration
       b.added_at                                 as book_added_at,
       b.series                                   as book_series_string,
       b.ownership,
       b.owned_physical,
       b.owned_ebook,
       b.owned_audiobook,
       b.read_status,
       e.source,
       e.user_edited,
       e.created_at                               as entry_created_at,
       e.removed_at,
       (e.book_id is null)                        as is_ghost_today
from public.series_entries e
left join public.books b on b.id = e.book_id
where e.series_id = '2bec23ba-a016-4e97-aa60-e7dfff528fa7'::uuid
order by e.removed_at nulls first, e.position, e.created_at;
-- Expected: exactly ONE row, live (removed_at null). More than one, or a tombstone, means the
-- second series row changed since 2026-08-09 and both dated claims are describing a shape that no
-- longer exists — stop and re-read acotar-followup.sql in full before concluding anything.

-- ══ 2. THE DRIFT CAUSE — does an ACOTAR-6 BOOKS row exist anywhere under this owner? ═════════════
-- Owner-scoped, matched loosely (initialism, spelled-out title, a numeral or roman-numeral 6),
-- because the point is to find the row whatever it is called. Each hit reports whether it is linked
-- to any entry at all, which is what separates "unlinked" from "deleted".
--
-- READ THE RESULT WITH BLOCK 1:
--
--   Block 1 book_id NULL  +  Block 2 returns a matching books row (entry_links_total = 0)
--     -> The book EXISTS but is UNLINKED. The link was broken, not the book. Causes that produce
--        this: a manual unlink, or a remove-then-re-add that left the book behind. Note that
--        `remove_series_entry` is NOT among them — it tombstones the entry, and 2bec23ba has zero
--        tombstones, so that path did not run here.
--
--   Block 1 book_id NULL  +  Block 2 returns NOTHING
--     -> No such book exists today. Either the books row was DELETED (the ON DELETE SET NULL FK
--        then silently ghosted the entry, leaving exactly this state and no other evidence), or the
--        2026-08-06 "books: 1" reading counted something else. These two are NOT distinguishable
--        from the current database — there is no deletion log. Say "cause unknown, two candidates"
--        rather than picking one.
--
--   Block 1 book_id NOT NULL
--     -> No drift to explain. The 2026-08-06 spec is current and the 2026-08-09 ruling's word
--        "ghost" was loose usage for a forward-looking slot rather than a statement about book_id.
--        Correct the 2026-08-09 record, not the spec.
select '2. ACOTAR 6 book candidates' as section,
       b.id                                          as book_id,
       b.title,
       b.series                                      as book_series_string,
       b.position                                    as book_position,
       b.series_count,
       b.ownership,
       b.read_status,
       b.added_at,
       b.updated_at,
       (select count(*) from public.series_entries e where e.book_id = b.id)                        as entry_links_total,
       (select count(*) from public.series_entries e where e.book_id = b.id and e.removed_at is null) as entry_links_live,
       (select string_agg(distinct s.name, ' | ')
          from public.series_entries e
          join public.series s on s.id = e.series_id
         where e.book_id = b.id)                                                                    as linked_series_names
from public.books b
where b.owner_id = (select owner_id from public.series
                     where id = '2bec23ba-a016-4e97-aa60-e7dfff528fa7'::uuid)
  and (b.title ilike '%acotar%6%'
    or b.title ilike '%acotar%vi%'
    or regexp_replace(lower(b.title), '[^a-z0-9]+', '', 'g') like '%acotar6%'
    or (b.series ilike 'acotar%' and b.title ilike '%6%'))
order by b.added_at;

-- ══ 3. HEADLINE — one row to paste back ══════════════════════════════════════════════════════════
with e as (
  select * from public.series_entries
   where series_id = '2bec23ba-a016-4e97-aa60-e7dfff528fa7'::uuid and removed_at is null
)
select '3. headline' as section,
       (select count(*) from e)                                              as live_entries,
       (select count(*) from e where book_id is null)                        as of_which_ghosts,
       (select bool_and(book_id is null) from e)                             as acotar6_is_ghost_today,
       (select string_agg(coalesce(book_id::text, '<<NULL — GHOST>>'), ', ') from e) as book_id_value,
       (select count(*) from public.series_entries se
         where se.series_id = '2bec23ba-a016-4e97-aa60-e7dfff528fa7'::uuid
           and se.removed_at is not null)                                    as tombstones;
-- `acotar6_is_ghost_today` is the single value the addendum records. Note it is written as
-- `bool_and(book_id is null)` and not `is(book_id, null)`: with zero rows bool_and returns NULL,
-- which reads as "no row to speak of" rather than silently agreeing that the row is a ghost. An
-- empty result here is a finding, not a confirmation.
