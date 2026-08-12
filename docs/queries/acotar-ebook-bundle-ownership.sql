-- ACOTAR eBook-bundle ownership — record format ownership, do NOT revive the series_entries row.
--
-- STAGED — DO NOT RUN. No Code session runs this. The owner reviews and runs it by hand,
-- against production, same discipline as acotar-fix.sql and iron-flame-merge.sql.
--
-- ══ WHY THIS FILE EXISTS, AND WHY IT DOES NOT UN-TOMBSTONE 09357eb3 ══════════════════════════════
-- series_entries row 09357eb3 ("A Court of Thorns and Roses eBook Bundle", position 11,
-- removed_at 2026-08-03) is not a reading-order slot — it is a books-table/format fact (owning the
-- series as an eBook bundle) that got stored as a fake series_entries row instead. That is exactly
-- the shape task-series-integrity-mechanism.md's "ownership vs. membership" rule forbids:
-- "A series_entries row represents 'this slot in the reading order is filled' — not 'I own N copies
-- of this book.' ... Format/ownership is a books-table concern (owned_physical/owned_ebook/
-- owned_audiobook); series membership is a series_entries concern. These must never be conflated."
--
-- So the fix here is NOT to revive the tombstone — that would re-conflate the two concerns this
-- rule exists to keep apart, and would also re-occupy a slot in a reading order that Phase 4 just
-- finished correcting (positions 1, 2, 3, 3.5, 5; 4 deliberately vacant; nothing belongs at 11
-- either). The fix is to record the ownership fact on the books it actually describes, and leave
-- the tombstone exactly where it is.
--
-- ══ COLUMN EXISTENCE — ASSERTED BY THE TASK DOC, NOT VERIFIED IN THIS WORKSPACE ══════════════════
-- owned_physical/owned_ebook/owned_audiobook are named in task-series-integrity-mechanism.md's
-- ownership-vs-membership section as existing books-table columns. No CREATE TABLE for `books` is
-- present in this upload's migrations folder to confirm the column names or types independently.
-- Q0 below checks this before anything else runs. If it fails, STOP and get the real column name —
-- do not guess a variant.
--
-- ══ SCOPE — AN ASSUMPTION THAT NEEDS OWNER CONFIRMATION, NOT JUST A GUARD ════════════════════════
-- Four of the five main-sequence books have real `books` rows: A Court of Thorns and Roses
-- (6469788a), A Court of Mist and Fury (c570f8de), A Court of Frost and Starlight (7c1fbd41), A
-- Court of Silver Flames (49242225). The fifth, A Court of Wings and Ruin, exists ONLY as a ghost
-- series_entries row (dd33f8da, book_id null) — per acotar-fix.sql's finding 1, the owner owns the
-- physical copy but it was never catalogued, so there is no `books` row to mark owned_ebook on even
-- if the bundle covers it. This file deliberately touches only the four rows that exist. Whether the
-- eBook bundle you own actually includes Wings and Ruin (and whether Frost and Starlight, a
-- novella, was part of the bundle at all) is a fact about the physical product, not something
-- derivable from the database — confirm the four-book scope matches what you actually bought before
-- running the write. If Wings and Ruin needs to be included, it needs a real `books` row first
-- (cataloguing it), which is a separate action from this file.
--
-- ══ WHAT THIS DOES NOT DO ═════════════════════════════════════════════════════════════════════════
-- Does not touch series_entries row 09357eb3 (stays tombstoned, exactly as the owner left it).
-- Does not touch the ghost dd33f8da or its position.
-- Does not touch anything in the out-of-scope series row 2bec23ba, per the same discipline
-- acotar-fix.sql's guard #8b established.

\set ON_ERROR_STOP on

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- PRE-FLIGHT (no writes — every statement here is a SELECT). Run this section first, alone.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

-- Q0. Confirm the ownership columns actually exist and are booleans, before anything below assumes
--     it. If this returns zero rows or unexpected types, STOP — get the real column names first.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'books'
  and column_name in ('owned_physical', 'owned_ebook', 'owned_audiobook')
order by column_name;

-- Q1. Current state of the four target books — read this before deciding to run the write.
select 'Q1. target books before' as section,
       b.id, b.title, b.series, b.position, b.series_count,
       b.owned_physical, b.owned_ebook, b.owned_audiobook
from public.books b
where b.id in (
  '6469788a-2446-47b9-8807-7c0affbe62f1', -- A Court of Thorns and Roses
  'c570f8de-96ac-41d8-a1f2-a9ca25ad4790', -- A Court of Mist and Fury
  '7c1fbd41-0f55-4149-9f32-0d3eaa484a11', -- A Court of Frost and Starlight
  '49242225-3d05-408b-b5e0-400477465cab'  -- A Court of Silver Flames
)
order by b.position;
-- Expected: 4 rows. Note whichever of owned_ebook is already true — the write below is idempotent
-- (sets true regardless of current value) so an already-true row is harmless, not an error.

-- Q2. Confirm Wings and Ruin is still ghost-only (no books row) — the reason it's excluded here.
select 'Q2. wings and ruin ghost check' as section,
       e.id as entry_id, e.book_id, e.position, e.title
from public.series_entries e
where e.id = 'dd33f8da-ddde-44b3-87f1-e9d32e4abd3f'::uuid;
-- Expected: book_id IS NULL. If it now has a book_id, Wings and Ruin has since been catalogued —
-- bring it back as a fifth row to include, do not silently add it here.

-- Q3. Confirm the tombstone is exactly where the fix left it — sanity check on the scope claim.
select 'Q3. bundle tombstone' as section,
       e.id, e.title, e.position, e.removed_at, e.user_edited
from public.series_entries e
where e.id = '09357eb3-574d-4bfc-9957-affe28dc67ea'::uuid;
-- Expected: removed_at = 2026-08-03 (unchanged), title = 'A Court of Thorns and Roses eBook Bundle'.

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- THE WRITE. Run only after Q0-Q3 match expectations AND you've confirmed the four-book scope is
-- actually what you own as the eBook bundle.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

do $$
declare
  n int;
begin
  select count(*) into n from public.books
   where id in (
     '6469788a-2446-47b9-8807-7c0affbe62f1',
     'c570f8de-96ac-41d8-a1f2-a9ca25ad4790',
     '7c1fbd41-0f55-4149-9f32-0d3eaa484a11',
     '49242225-3d05-408b-b5e0-400477465cab'
   );
  if n <> 4 then
    raise exception 'guard: expected 4 target books, found % — a book id has changed or been removed; STOP', n;
  end if;
end $$;

update public.books
   set owned_ebook = true
 where id in (
   '6469788a-2446-47b9-8807-7c0affbe62f1',
   'c570f8de-96ac-41d8-a1f2-a9ca25ad4790',
   '7c1fbd41-0f55-4149-9f32-0d3eaa484a11',
   '49242225-3d05-408b-b5e0-400477465cab'
 );

do $$
declare
  n int;
begin
  get diagnostics n = row_count;
  raise notice 'updated % book row(s)', n;
end $$;

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- POST-RUN AUDIT (no writes).
-- ════════════════════════════════════════════════════════════════════════════════════════════════

select 'A1. target books after' as section,
       b.id, b.title, b.owned_physical, b.owned_ebook, b.owned_audiobook
from public.books b
where b.id in (
  '6469788a-2446-47b9-8807-7c0affbe62f1',
  'c570f8de-96ac-41d8-a1f2-a9ca25ad4790',
  '7c1fbd41-0f55-4149-9f32-0d3eaa484a11',
  '49242225-3d05-408b-b5e0-400477465cab'
)
order by b.position;
-- Expected: owned_ebook = true on all four; owned_physical/owned_audiobook unchanged from Q1.

-- A2. Confirm the tombstone and the ghost are still untouched.
select 'A2. tombstone still removed' as section, removed_at, position
from public.series_entries where id = '09357eb3-574d-4bfc-9957-affe28dc67ea'::uuid;

select 'A2. ghost still a ghost' as section, book_id, position
from public.series_entries where id = 'dd33f8da-ddde-44b3-87f1-e9d32e4abd3f'::uuid;
