-- One-incident fix: a cross-owner ghost duplicate in "The Empyrean" left behind by the
-- Iron Flame merge (iron-flame-merge.sql).
--
-- ══ ALREADY RUN — 2026-08-12 ══════════════════════════════════════════════════════════════════════
-- The owner ran this by hand. All three PRE-FLIGHT/write guards passed and the tombstone applied:
-- 69ceef54… now has book_id = null, user_edited = true, removed_at = 2026-08-12 16:18:05+00.
-- a8e2ac80… (the kept entry) verified unchanged. The A3 cross-owner mismatch scan came back with
-- 0 rows post-fix — the incident is closed. Kept here as documentation, per this repo's convention
-- for every hand-run production fix; do not re-run against the same rows.
--
-- One bug worth flagging for future scripts of this shape: the original version of THE FIX below
-- had the row-count check in a *separate* `do $$ ... $$` block after the `UPDATE`, instead of
-- wrapping both in the same block. `GET DIAGNOSTICS ... ROW_COUNT` only reflects a statement
-- executed inside the SAME PL/pgSQL block — it does not see a plain top-level statement that ran
-- before the block started. That produced a false "expected exactly 1 row updated, got 0" error
-- even though the UPDATE itself succeeded (confirmed via the POST-RUN AUDIT). Fixed below to match
-- the pattern acotar-ebook-bundle-ownership.sql already uses correctly (UPDATE and GET DIAGNOSTICS
-- in the same block).
--
-- STAGED — DO NOT RUN until the owner has reviewed the PRE-FLIGHT output below and confirmed it
-- matches this script's guards. No Code session runs this — same discipline as iron-flame-merge.sql
-- and acotar-ebook-bundle-ownership.sql.
--
-- ══ HOW THIS HAPPENED ═════════════════════════════════════════════════════════════════════════════
-- iron-flame-merge.sql ran merge_books(primary=1555cc10, loser=38066e50). Per
-- 20260812010000_merge_series_entries_reparent.sql, merge_books re-parents EVERY live
-- series_entries row that points at the loser's book_id onto the primary — the collision check that
-- decides tombstone-vs-reparent is scoped to `(series_id, book_id)` within a single series row, not
-- across accounts. The loser's book_id was linked from two entries in two DIFFERENT series rows that
-- both happen to be named "The Empyrean":
--   - a8e2ac80-174c-4205-a409-4823c28ef254 — series 56c019a4…, owner d4bf8f6b… (the reader's
--     current, post-consolidation account). This is the real, correct reading-order slot.
--   - 69ceef54-b5b5-4727-9452-4bc1cf376f20 — series cbece794…, owner 37e9e3a5… (the reader's OLD,
--     pre-consolidation account — same human, confirmed same email gchism94@gmail.com, account
--     created 2026-07-06). This entry was never meant to survive as a live link; it was an
--     accidental leftover in a since-abandoned account.
-- Because cbece794… ≠ 56c019a4…, there was no local (series_id, book_id) collision for merge_books
-- to catch, so instead of tombstoning the redundant entry (the branch exercised in
-- merge_series_entries_test.sql, "Series A" fixture), it silently re-parented 69ceef54… onto
-- 1555cc10… too — producing a live entry whose owner_id (37e9e3a5…) no longer matches its linked
-- book's owner_id (d4bf8f6b…). A full-table scan confirmed this is the ONLY row in series_entries
-- with that mismatch — an isolated incident, not a systemic class of bug. No guard in merge_books
-- could have caught this: it has no way to know two differently-owned series rows named "The
-- Empyrean" are the same real series across two accounts of the same person.
--
-- ══ THE RULING (owner's direction) ════════════════════════════════════════════════════════════════
-- "Just combine them with the most accurate information. No one else would have added the series,
-- so it was an accidental add." — a8e2ac80… already IS the accurate slot (correct current owner,
-- correct book, same position). There is nothing to merge INTO it. The fix is to retire 69ceef54…
-- using the exact same tombstone shape merge_books itself uses for a colliding redundant entry
-- (book_id → null, user_edited → true, removed_at → now()) — preserving the row for history, same
-- as every other tombstone in this codebase, rather than deleting it outright.
--
-- ══ WHAT THIS DOES NOT DO ═════════════════════════════════════════════════════════════════════════
-- Does not touch a8e2ac80… (already correct).
-- Does not call merge_books — that RPC is owner-scoped to auth.uid() on BOTH rows, and 69ceef54…'s
-- owner (37e9e3a5…) is not, and should not become, the acting identity for anything post-consolidation.
-- A direct UPDATE matching merge_books' own tombstone invariants is the minimal, correct tool here.
-- Does not delete or touch series row cbece794… itself. Q3 below checks whether it's now fully
-- orphaned (0 live entries) — if so, that's a separate, optional cleanup for the owner to decide on
-- later, not bundled into this fix.

\set ON_ERROR_STOP on

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- PRE-FLIGHT (no writes — every statement here is a SELECT). Run this section first, alone, as a
-- privileged role so RLS can't hide either owner's rows from you.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

-- Q1. Full current state of the entry being retired.
select 'Q1. entry to tombstone' as section,
       e.id, e.owner_id, e.series_id, e.book_id, e.position, e.title, e.author,
       e.user_edited, e.source, e.removed_at
from public.series_entries e
where e.id = '69ceef54-b5b5-4727-9452-4bc1cf376f20'::uuid;
-- Expected: owner_id = 37e9e3a5-ecfc-4f83-8563-d6a602108797, series_id = cbece794…,
-- book_id = 1555cc10-3496-435b-a8ea-9b1f36ab62f9, position = 2, removed_at IS NULL.
-- If any of these differ from what the earlier audit found, STOP — the row has changed since
-- triage and the guards below need to be re-derived, not blindly run.

-- Q2. Full current state of the entry being kept — confirms it's still the correct, live slot.
select 'Q2. entry being kept (untouched by this fix)' as section,
       e.id, e.owner_id, e.series_id, e.book_id, e.position, e.title, e.author,
       e.user_edited, e.source, e.removed_at
from public.series_entries e
where e.id = 'a8e2ac80-174c-4205-a409-4823c28ef254'::uuid;
-- Expected: owner_id = d4bf8f6b-c754-48b6-914c-7ea0227bb7fa, series_id = 56c019a4…,
-- book_id = 1555cc10-3496-435b-a8ea-9b1f36ab62f9, position = 2, removed_at IS NULL.
-- If this row is missing or no longer live, STOP — do not run the write. Tombstoning 69ceef54…
-- would then leave the reader with ZERO live entries for this book/slot, which is data loss, not
-- a dedupe.

-- Q3. Is the old series row now fully orphaned? Informational only — no action taken on it here.
-- Derives the series id from the target entry itself (69ceef54…) rather than a hardcoded literal —
-- triage only captured the cbece794… prefix, not the full UUID.
select 'Q3. old series row live-entry count' as section,
       s.id as series_id, s.name, s.owner_id,
       (select count(*) from public.series_entries e2
         where e2.series_id = s.id and e2.removed_at is null) as live_entries_before_this_fix
from public.series s
where s.id = (
  select series_id from public.series_entries
  where id = '69ceef54-b5b5-4727-9452-4bc1cf376f20'::uuid
);
-- Expected count = 1 (just 69ceef54… itself) — if it shows other live entries, treat that as new
-- information and re-triage before proceeding; this fix assumes cbece794… has no other purpose.

-- Q4. Systemic re-check, run immediately before the write: confirm 69ceef54… is still the ONLY
-- cross-owner mismatch in the table (repeats the scan from triage so nothing new crept in).
select 'Q4. cross-owner mismatch scan' as section,
       e.id as entry_id, e.owner_id as entry_owner, b.owner_id as book_owner, e.series_id, e.book_id
from public.series_entries e
join public.books b on b.id = e.book_id
where e.removed_at is null
  and e.owner_id <> b.owner_id;
-- Expected: exactly one row — 69ceef54…. If more rows appear, STOP — this is no longer an isolated
-- incident and the fix below (scoped to one row) is not sufficient; re-triage the full set first.

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- THE FIX (writes; run only after Q1-Q4 all match expectations above).
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

do $$
declare
  n_target int;
  n_kept   int;
  n_mismatches int;
  target_id constant uuid := '69ceef54-b5b5-4727-9452-4bc1cf376f20';
  kept_id   constant uuid := 'a8e2ac80-174c-4205-a409-4823c28ef254';
  book_id_  constant uuid := '1555cc10-3496-435b-a8ea-9b1f36ab62f9';
begin
  -- Guard #1: the row being retired is exactly where triage found it.
  select count(*) into n_target from public.series_entries
   where id = target_id
     and owner_id = '37e9e3a5-ecfc-4f83-8563-d6a602108797'::uuid
     and book_id = book_id_
     and position = 2
     and removed_at is null;
  if n_target <> 1 then
    raise exception 'guard #1: 69ceef54… no longer matches the triaged shape (owner/book/position/live) — got %, STOP', n_target;
  end if;

  -- Guard #2: the row being kept is still live and correct — refuse to create a data-loss scenario.
  select count(*) into n_kept from public.series_entries
   where id = kept_id
     and owner_id = 'd4bf8f6b-c754-48b6-914c-7ea0227bb7fa'::uuid
     and book_id = book_id_
     and position = 2
     and removed_at is null;
  if n_kept <> 1 then
    raise exception 'guard #2: a8e2ac80… is not live/correct — refusing to tombstone the only remaining slot, STOP';
  end if;

  -- Guard #3: still exactly one cross-owner mismatch in the whole table (re-check from Q4).
  select count(*) into n_mismatches
    from public.series_entries e
    join public.books b on b.id = e.book_id
   where e.removed_at is null and e.owner_id <> b.owner_id;
  if n_mismatches <> 1 then
    raise exception 'guard #3: expected exactly 1 cross-owner mismatch table-wide, found % — re-triage before proceeding, STOP', n_mismatches;
  end if;

  raise notice 'pre-flight OK: retiring 69ceef54… (isolated incident confirmed), a8e2ac80… stays live';
end $$;

-- Tombstone, using the same shape merge_books itself uses for a colliding redundant entry
-- (see merge_series_entries_test.sql lines 106-116): book_id → null, user_edited → true,
-- removed_at → now(). The row is kept, not deleted — its history stays queryable.
--
-- UPDATE and the row-count check run in the SAME do $$ block: GET DIAGNOSTICS ROW_COUNT only sees
-- a statement executed within its own PL/pgSQL block, not a separate top-level statement that ran
-- before it — splitting them (as an earlier version of this file did) produces a false "0 rows
-- updated" error even when the UPDATE succeeded.
do $$
declare
  n int;
begin
  update public.series_entries
     set book_id = null,
         user_edited = true,
         removed_at = now()
   where id = '69ceef54-b5b5-4727-9452-4bc1cf376f20'::uuid
     and owner_id = '37e9e3a5-ecfc-4f83-8563-d6a602108797'::uuid
     and book_id = '1555cc10-3496-435b-a8ea-9b1f36ab62f9'::uuid
     and removed_at is null;

  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'expected exactly 1 row updated, got % — STOP, do not commit', n;
  end if;
  raise notice 'tombstoned % row', n;
end $$;

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- POST-RUN AUDIT (no writes).
-- ════════════════════════════════════════════════════════════════════════════════════════════════

-- A1. The retired entry — expect removed_at set, book_id null, user_edited true.
select 'A1. retired entry after' as section,
       e.id, e.book_id, e.user_edited, e.removed_at
from public.series_entries e
where e.id = '69ceef54-b5b5-4727-9452-4bc1cf376f20'::uuid;

-- A2. The kept entry — expect completely unchanged from Q2.
select 'A2. kept entry unchanged' as section,
       e.id, e.owner_id, e.series_id, e.book_id, e.position, e.removed_at
from public.series_entries e
where e.id = 'a8e2ac80-174c-4205-a409-4823c28ef254'::uuid;

-- A3. Systemic re-check — expect ZERO rows now (the isolated incident is closed).
select 'A3. cross-owner mismatch scan after fix' as section,
       e.id as entry_id, e.owner_id as entry_owner, b.owner_id as book_owner
from public.series_entries e
join public.books b on b.id = e.book_id
where e.removed_at is null
  and e.owner_id <> b.owner_id;
-- Expected: 0 rows.

-- A4. Old series row's live-entry count — expect 0. Informational: if this stays 0, the owner may
-- want to also delete the now-fully-orphaned cbece794… series row as a follow-up, separately from
-- this fix, whenever convenient. The tombstone above only touches book_id/user_edited/removed_at,
-- so 69ceef54…'s series_id is unchanged and still safely derives cbece794…'s id, same as Q3.
select 'A4. old series row live-entry count after' as section,
       count(*) as live_entries
from public.series_entries e2
where e2.series_id = (
  select series_id from public.series_entries where id = '69ceef54-b5b5-4727-9452-4bc1cf376f20'::uuid
)
  and e2.removed_at is null;
-- Expected: 0 (69ceef54… itself no longer counts — removed_at is now set).
