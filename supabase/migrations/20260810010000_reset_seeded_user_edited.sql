-- Clear `user_edited` on entries that reconciliation seeded before the flag meant anything.
--
-- ── WHY THESE ROWS ARE WRONG ───────────────────────────────────────────────────────────────────
-- `mergeSourceEntries` moves a row only when `!userEdited`, so `user_edited` decides whether a
-- Hardcover fetch can ever correct a position. From ab9e1fe (#77) until fix/series-seed-provenance
-- (#131), `useSeriesDetail` stamped `user_edited: true` on every entry it seeded for a library book
-- naming the series — machine output wearing a reader's signature. Opening a series page once made
-- that series permanently uncorrectable. #131 fixed the write; this fixes the rows it already wrote.
--
-- ── WHY THIS IS SAFE TO RUN ONCE AND WRONG TO RUN AS A HABIT ───────────────────────────────────
-- READ THIS BEFORE CALLING THE FUNCTION BELOW AGAIN. It is idempotent in the immediate sense — the
-- predicate requires `user_edited`, and the update clears it, so a second run right now matches
-- nothing. It is NOT safe once readers start using the app again, and the reason is that its whole
-- premise expires:
--
--   Before #131, a live linked unlabelled row carrying `user_edited` was AMBIGUOUS — it could be a
--   seeded row or a reader's picker-add, and nothing in the schema tells them apart (there is no
--   `updated_at` on series_entries; see docs/queries/series-entry-provenance-audit.sql). The owner
--   accepted that ambiguity for this one pass, on the evidence that the real population is seeded.
--
--   After #131, seeding writes `false`. So a row that carries `user_edited: true` FROM NOW ON is a
--   genuine reader gesture — a drag, a hand-set position, a picker add. Running this function later
--   would reset exactly those, silently discarding arrangements a reader made on purpose.
--
-- A `created_at` cutoff does not rescue it, which is worth stating because it is the obvious fix and
-- it does not work: a row seeded before this migration is reset here, and if the reader then drags
-- it, its `created_at` still predates the cutoff — so a later run resets the reader's own gesture
-- while appearing to respect the boundary. The safety of this migration is a fact about WHEN it
-- runs, not a property the SQL can enforce. Hence: run once, at deploy of this migration, and never
-- again. `revoke execute from public` and the function comment are what stand between it and a
-- casual second call.
--
-- ── WHAT IT DELIBERATELY DOES NOT TOUCH ────────────────────────────────────────────────────────
-- Three shapes are genuine reader gestures and are identifiable, so they keep their flag:
--   · book_id IS NULL  — a manual ghost slot. Seeding ALWAYS links a book, so an unlinked
--     `user_edited` row can only have come from `useAddGhostEntry` or a removal.
--   · label IS NOT NULL — only `useUpdateEntry` writes a label, and that is a reader typing a tag.
--   · source = 'hardcover' — see below; this one was NOT in the brief and is the reason the audit's
--     numbers did not add up.
-- Tombstones (`removed_at` not null) are excluded outright: their flag is what stops a source
-- refresh repositioning a slot the reader dismissed, and it is load-bearing regardless of origin.
--
-- ── THE `source = 'manual'` GUARD, AND WHY IT IS HERE ──────────────────────────────────────────
-- The brief specified live + user_edited + linked + unlabelled. That predicate is one row too wide,
-- and the owner's own audit shows it: 26 live user_edited rows, of which 23 ambiguous linked-manual
-- and 2 reader ghosts — which leaves one row in NEITHER bucket, because both audit buckets filter
-- `source = 'manual'` and this one does not.
--
-- A `source = 'hardcover'` row carrying `user_edited` is necessarily a reader gesture. Every machine
-- write to a hardcover row sets the flag FALSE (`useApplySeriesSource`, series.ts), and `source` is
-- write-once — nothing in the app ever updates it after insert. So the only way that combination
-- exists is a reader acting on a hardcover-sourced row: dragging a canonical ghost into place, or
-- `revivedTombstone` un-removing one. Seeding, the thing this migration exists to undo, always
-- writes `source: 'manual'`, so narrowing here cannot skip a single row the brief wanted reset.
--
-- Without this clause the migration would reset that row and silently discard the arrangement behind
-- it — the exact harm the ghost and label guards exist to prevent, arriving through the one door
-- they do not cover. It also makes the deploy count match the 23 the owner expects rather than 24.
--
-- ── WHY A FUNCTION AND NOT INLINE SQL ──────────────────────────────────────────────────────────
-- Same reason as 20260809010000_series_backfill.sql: inline migration SQL has already run by the
-- time pgTAP starts, so it cannot be exercised against fixtures, and idempotence cannot be proven by
-- running it twice. The work lives in a function the migration calls once and the tests call again.

create or replace function public.reset_seeded_user_edited()
returns jsonb
language plpgsql
set search_path = public
as $fn$
declare
  n_reset          int := 0;
  n_owners         int := 0;
  n_series         int := 0;
  n_kept_ghost     int := 0;
  n_kept_labelled  int := 0;
  n_kept_hardcover int := 0;
  n_kept_tombstone int := 0;
begin
  -- The four live `user_edited` categories are disjoint and EXHAUSTIVE — reset + ghost + labelled +
  -- hardcover is every live user_edited row — so the notice below can be reconciled against the
  -- audit query rather than merely believed. Counted BEFORE the write, since the write moves rows
  -- out of the reset category. Exhaustiveness is asserted in the pgTAP, not just claimed here.
  select count(*) into n_kept_ghost
  from public.series_entries
  where removed_at is null and user_edited and book_id is null;

  select count(*) into n_kept_labelled
  from public.series_entries
  where removed_at is null and user_edited and book_id is not null and label is not null;

  select count(*) into n_kept_hardcover
  from public.series_entries
  where removed_at is null and user_edited and book_id is not null and label is null
    and source <> 'manual';

  select count(*) into n_kept_tombstone
  from public.series_entries
  where removed_at is not null and user_edited;

  -- ONE STATEMENT, so the reported count and the rows actually written cannot disagree. The obvious
  -- alternative — count with one query, then update with a second carrying the same WHERE — writes
  -- this predicate twice, and the deploy notice is the only place anyone would ever notice the two
  -- had drifted apart. `returning` makes the tally a fact about the write rather than a claim beside
  -- it, and removes the need to count first because the predicate is self-clearing.
  with upd as (
    update public.series_entries
       set user_edited = false
     where removed_at is null
       and user_edited
       and book_id is not null
       and label is null
       and source = 'manual'
    returning owner_id, series_id
  )
  select count(*), count(distinct owner_id), count(distinct series_id)
    into n_reset, n_owners, n_series
  from upd;

  return jsonb_build_object(
    'reset',           n_reset,
    'owners',          n_owners,
    'series',          n_series,
    'kept_ghost',      n_kept_ghost,
    'kept_labelled',   n_kept_labelled,
    'kept_hardcover',  n_kept_hardcover,
    'kept_tombstone',  n_kept_tombstone
  );
end
$fn$;

comment on function public.reset_seeded_user_edited() is
  'ONE-SHOT REPAIR, ran at 20260810010000. Clears user_edited on live linked unlabelled entries, '
  'which before fix/series-seed-provenance (#131) were indistinguishable from machine-seeded rows. '
  'Seeding now writes false, so any user_edited row created after that fix is a REAL reader gesture '
  'and calling this again would silently discard it. Do not run as maintenance.';

-- PUBLIC gets EXECUTE on every new function by default, so the revoke is the boundary and the grant
-- is defence in depth (CLAUDE.md). Invoker rights, not security definer: a function that rewrites
-- provenance across every reader's series must not carry the owner's privileges to whoever reaches it.
revoke execute on function public.reset_seeded_user_edited() from public;
grant execute on function public.reset_seeded_user_edited() to service_role;

do $$
declare r jsonb;
begin
  r := public.reset_seeded_user_edited();
  -- INFORMATIONAL, NOT A GATE. The owner's audit (2026-08-03) measured 23 resettable rows over 2
  -- owners; a materially different number here means rows were created between that audit and this
  -- deploy. This notice reports it but does NOT refuse the run — nothing in this migration blocks on
  -- the count, so read it rather than assume silence means it matched.
  raise notice 'seeded user_edited reset: % row(s) across % owner(s) and % series; kept % ghost, % labelled, % hardcover, % tombstone',
    r->>'reset', r->>'owners', r->>'series',
    r->>'kept_ghost', r->>'kept_labelled', r->>'kept_hardcover', r->>'kept_tombstone';
end $$;
