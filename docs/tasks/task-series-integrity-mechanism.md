# Task: feat/series-integrity-mechanism

Branch: `feat/series-integrity-mechanism` off `main`.
Read first: `docs/audits/series-position-integrity.md`, `docs/audits/series-count-schema.md`
(both this session), `docs/tasks/task-series-consolidation.md`, and
`supabase/migrations/20260812010000_merge_series_entries_reparent.sql` (the template).

## Why this exists, and why it comes before any per-series correction

ACOTAR was found with two series records for one series, two duplicate book
rows, two different books both claiming position 4, and decimal positions
that disagree across two independent external sources. The instinct was to
fix ACOTAR. The correct order, decided explicitly: **build the mechanism that
prevents this first, then run ACOTAR's correction through it as the proof
case.** Fixing ACOTAR before the mechanism exists means fixing it again the
next time an import or edit re-introduces the same drift — nothing currently
stops that.

The schema audit confirmed the mechanism has to be built, not just wired up:
`public.series` has no length column at all (never existed, not a dead
column — genuinely absent), and `series_entries.position` carries **no
unique constraint**, so ordering is exactly as unconstrained there as
`books.position` is. There is no existing canonical home to point a sync at.
This task creates one.

## The design tension this closes, stated precisely

Two facts are currently series-level truths that get asserted independently,
per book, with nothing checking agreement:

- **Length**: `books.series_count`, written by at least seven paths
  (`useAddBook`, `useUpdateBook`, `insertNewBook`, `foldIn`, `restoreBackup`,
  the edit dialog, `merge_books` step 4). `packages/core/src/seriesIndex.ts`
  already documents this in its own comments — `claimedSeriesLength` takes
  `max()` specifically because members disagree, and states outright that
  deriving the fact away is "the real fix," out of that PR's scope. This task
  is that fix.
- **Position**: `books.position` and `series_entries.position` are two
  separately-writable copies of the same fact, kept in sync (when they are)
  by `syncBookPosition` (`apps/web/src/data/series.ts:417`) — **two
  unserialized UPDATE statements, no transaction, no DB enforcement**. This
  is a live dual-write hazard on every call to `useMoveEntry`/`useUpdateEntry`
  today, not a hypothetical the mechanism prevents going forward. Flag and
  fix this specifically, it does not need to wait for the rest of the design.

## The four established precedents to build from — do not invent new patterns

The schema audit found the repo's existing cross-row-consistency vocabulary.
Use it:

1. **`invalidate_enriched_stamp()`** (before-update trigger) — the
   single-chokepoint-invariant pattern. Its own comment states the repo's
   general rule: "the mechanism-to-notice belongs at the one chokepoint that
   cannot be bypassed" — the DB layer, because some writers (migrations,
   imports) run no client code.
2. **`remove_series_entry(p_entry)`** (security-definer RPC) — atomic
   cross-row consistency for a small, well-scoped operation. Reads
   authoritative state server-side rather than trusting a caller-passed value.
3. **`merge_books(p_primary, p_loser, p_fields)`** (security-definer RPC) —
   the strongest existing template: ordered, atomic, multi-table, explicit
   ownership checks because `security definer` bypasses RLS. **This is the
   shape for the new position/length-write RPC.**
4. **`set_updated_at()`** — single-row, listed for completeness, not a
   pattern to reuse here.

## Phase 1 — schema. Report before implementing; some of this may need judgment calls flagged back.

1. Add `unique (series_id, position) where removed_at is null` to
   `series_entries`. This alone would have caught the ACOTAR collision (two
   books both claiming position 4) at write time. Report what happens to
   any row that currently violates this — the constraint can't be added
   against dirty data, so report the violating set first (read-only,
   staged for the owner, same as every prior production query this
   session) before proposing how they get resolved prior to the constraint
   landing.
2. Add a length column to `public.series` — name and type your call, argue
   it. This is the new canonical home; `books.series_count` becomes a synced
   copy, not an independent source.
3. Decide and justify: does `books.series_count`/`books.position` stay as
   real columns (synced, not independently writable) for cheap read access,
   or does display move to always reading through a join/view? Argue for
   keeping the synced-copy columns unless you find a strong reason not to —
   removing them is a bigger blast radius (every read site changes) for a
   marginal gain, but make the case explicitly rather than defaulting.

## Phase 2 — the write path. One RPC, `merge_books`-shaped.

1. Design a security-definer RPC — name it, argue for the name — that is the
   ONLY path allowed to write series length or position. It writes
   `series_entries` and the synced `books` columns atomically, in one
   transaction, exactly as `merge_books` does across its seven tables.
2. Re-point every current writer identified in the schema audit
   (`toBookRow()`'s four callers, `restoreBackup`, the edit dialog,
   `merge_books` step 4 itself, `backfill_series_from_titles()`) through the
   new RPC instead of direct `UPDATE`. Report any writer where this is
   awkward or seems wrong, rather than forcing it through silently.
3. Replace `syncBookPosition`'s two-statement dual-write with a single call
   into the new RPC. This closes the live hazard named above — treat it as
   the first concrete win, not just a side effect.
4. `user_edited = true` protection (already a hard CLAUDE.md rule) must
   survive inside the new RPC exactly as it does today — a reader-set
   position is never silently overwritten by the new mechanism either.
   State explicitly how the RPC checks this before writing.

## Phase 3 — `claimedSeriesLength` and `displayTotal` retire or change meaning

Both functions in `packages/core/src/seriesIndex.ts` currently reconcile a
disagreement that Phase 1–2 should eliminate at the source. Report: once
`public.series` has a real length column populated through the new RPC, do
these functions become simple reads of that column (and the client-side
reconciliation logic deleted), or do they still serve a purpose (e.g. as a
fallback for series never touched by the new write path)? Do not delete
speculatively — report what still needs them after the schema exists, then
act on that.

## Phase 4 — ACOTAR runs through the mechanism as the proof case

Do not implement this phase yet. Report only: once Phases 1–3 land, what does
running ACOTAR's correction through the new RPC actually require —

- The series-record merge itself (two `public.series` rows for one series)
  still needs `task-series-consolidation.md`'s three-outcome decision table
  (same / distinct / related-but-separate) — that tooling is separate from
  this task and unaffected by it.
- Position correction (the Wikidata-vs-Wikipedia split, resolved as 3.5/4→5
  per owner convention, documented as convention not attributed to either
  source) becomes a call through the new RPC instead of a hand-written
  UPDATE, once the unique constraint and the RPC exist.
  Report whether Phase 4 is now small enough to fold into the ACOTAR incident
  branch directly, or still warrants staging as its own reviewed file the way
  Iron Flame's fix was.

## Standing

Investigate and report before implementing — if any premise here doesn't
hold against the real schema (e.g. the unique constraint can't be added
cleanly, or a writer resists being re-pointed), stop and report rather than
forcing it. No production writes from a Code session, ever, including
read-only SELECTs — stage any query needed for the owner to run by hand,
same as every prior incident this session. Full gate including
`format:check` against a clean worktree of the committed HEAD, pinned
prettier, never `npx`. Full e2e at default workers, all three projects —
this touches `supabase/` and `packages/core/` and `apps/web/`, no exemption
applies. No merge without explicit authorization, phase by phase — do not
proceed past Phase 1 without a checkpoint.
