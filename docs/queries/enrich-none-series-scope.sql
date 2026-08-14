-- SCOPE INVESTIGATION: did the pre-2026-08-11 enrich bug leave disclaimed series values in books?
--
-- READ-ONLY. Every statement below is a SELECT. Nothing is written, nothing is repaired. Paste the
-- whole file into the Supabase dashboard SQL Editor and run it.
--
-- ── THE BUG ─────────────────────────────────────────────────────────────────────────────────────
-- Before 25cb487 (2026-08-11), supabase/functions/enrich/index.ts did:
--
--     if (confidence === 'none') merged.cover = ''
--
-- On a disclaimed match it withheld the COVER ONLY. `series` and `seriesPosition` from that same
-- disclaimed match flowed straight through to the caller and into books.series. The fix
-- (`withholdByConfidence`) now clears cover + series + seriesPosition together on 'none'.
--
-- ── WHY THIS FILE IS AN INVESTIGATION AND NOT A CLEANUP ─────────────────────────────────────────
-- Detection is NOT solid, and a cleanup built on unsound detection would corrupt the data a second
-- way — clearing series values the reader typed themselves. Three independent reasons:
--
--  1. books.cover_confidence CANNOT identify these rows. It is written by enrichLibrary.ts only as
--     `if (patch.cover && outcome.data.confidence)` — i.e. only when a cover was attached. The bug's
--     own precondition ('none' -> cover cleared) means patch.cover was empty, so the affected rows
--     never recorded a confidence at all. They look like `cover_confidence IS NULL`, which is also
--     what an ordinary un-enriched book looks like.
--
--  2. books.series_user_chosen CANNOT separate reader-set from enrich-set retroactively. It was
--     added 2026-08-18 (20260818010000) as `not null default false` with NO backfill, so every row
--     written before that date reads `false` whether the reader typed the series or enrichment
--     attached it. It only becomes meaningful for gestures made after that migration deployed.
--
--  3. books.series can arrive from several paths that leave no distinguishing mark: CSV import,
--     manual entry on the book page, the series backfill, and enrichment. `source` is row-level
--     (how the BOOK arrived, not how the series field did) and `updated_at` is bumped by the
--     enrichment sweep on essentially every write, so neither isolates the field's origin.
--
-- The one real forensic trace is enrichment_cache: it retains `confidence` per key, and `record`
-- holds the merged payload as written. A cache row with confidence='none' whose record still
-- carries a series is a row written BEFORE the fix (after it, the withheld record is cached clean).
-- That is the strongest available signal, and Q3/Q4 below use it — but see the caveat there.

-- ── Q1. Baseline: how much series data exists at all? ───────────────────────────────────────────
select
  count(*)                                                        as books_total,
  count(*) filter (where coalesce(series, '') <> '')              as with_series,
  count(*) filter (where coalesce(series, '') <> '' and series_user_chosen) as series_reader_flagged,
  count(*) filter (where coalesce(series, '') <> '' and not series_user_chosen) as series_not_flagged
from public.books;

-- ── Q2. Is there ANY usable confidence marker on books carrying a series? ───────────────────────
-- Expectation from the code read: essentially all NULL for the affected rows. If a meaningful
-- number come back 'none', that would contradict reason (1) above and is worth reporting back
-- before anyone designs a cleanup.
select
  coalesce(cover_confidence, '(null)') as cover_confidence,
  count(*)                             as books_with_a_series
from public.books
where coalesce(series, '') <> ''
group by 1
order by 2 desc;

-- ── Q3. The forensic trace: cache rows that recorded a disclaimed match yet carry a series ──────
-- These are pre-fix writes by construction. Count first — this is the true upper bound on how many
-- distinct works could have propagated a disclaimed series.
select
  count(*)                                                     as none_confidence_cache_rows,
  count(*) filter (where coalesce(record->>'series', '') <> '') as of_those_carrying_a_series
from public.enrichment_cache
where confidence = 'none';

-- ── Q4. Which live books line up with one of those cache rows, by ISBN ──────────────────────────
-- CAVEAT, and it is the reason this is not a cleanup: a match here is CIRCUMSTANTIAL, not proof.
-- It shows the book's series equals the series a disclaimed match proposed for the same ISBN. That
-- is consistent with the bug having written it — and equally consistent with the reader having
-- typed the correct series that the fuzzy matcher also guessed. Only ISBN-keyed cache rows can be
-- joined at all; 'ta:<title>|<author>' keys use a normalisation implemented in TypeScript that this
-- query cannot faithfully reproduce, so title/author-matched books are invisible here.
select
  b.id,
  b.owner_id,
  b.title,
  b.series                as book_series,
  c.record->>'series'     as cache_proposed_series,
  b.series_user_chosen,
  b.cover_confidence,
  b.enriched_at,
  b.updated_at
from public.books b
join public.enrichment_cache c
  on c.isbn13 = regexp_replace(coalesce(b.isbn, ''), '[^0-9Xx]', '', 'g')
where c.confidence = 'none'
  and coalesce(b.series, '') <> ''
  and coalesce(c.record->>'series', '') <> ''
  and lower(btrim(b.series)) = lower(btrim(c.record->>'series'))
order by b.owner_id, b.title;

-- ── Q5. Same join, but counted, so the report is one number rather than a row dump ──────────────
select
  count(*)                       as suspect_books,
  count(distinct b.owner_id)     as affected_owners
from public.books b
join public.enrichment_cache c
  on c.isbn13 = regexp_replace(coalesce(b.isbn, ''), '[^0-9Xx]', '', 'g')
where c.confidence = 'none'
  and coalesce(b.series, '') <> ''
  and coalesce(c.record->>'series', '') <> ''
  and lower(btrim(b.series)) = lower(btrim(c.record->>'series'));

-- ── WHAT TO DO WITH THE RESULTS ────────────────────────────────────────────────────────────────
-- Q5 = 0        -> nothing to clean; the fix is purely forward-looking. Done.
-- Q5 small (<20)-> hand-adjudicate. Q4 lists them with enough context to judge each one, and a
--                  per-row decision beats any rule, given the caveat above.
-- Q5 large      -> report back BEFORE any cleanup is written. A blanket clear would delete
--                  reader-entered series values that happen to agree with a fuzzy guess, and there
--                  is no column that separates those two cases for pre-2026-08-18 rows.
