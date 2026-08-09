# Task: feat/series-integrity-mechanism (v2)

Branch: `feat/series-integrity-mechanism` off `main`.
Read first: `docs/audits/series-position-integrity.md`, `docs/audits/series-count-schema.md`,
`docs/tasks/task-series-consolidation.md`, and
`supabase/migrations/20260812010000_merge_series_entries_reparent.sql` (the template).

This is the v2 revision, written after production Block D and Block 8 results
changed the scope materially, and after Phase 0 (added in this revision) was
executed and closed on this branch. The design in Phases 1-3 is otherwise
unchanged from the original draft.

## What Block D changed

Production, read-only, `series-position-integrity-audit.sql` Block D:

| total_series | total_distinct_series_names | total_books_with_legacy_series | total_live_series_entries |
| ------------ | --------------------------- | ------------------------------ | ------------------------- |
| 23           | 222                         | 437                            | 71                        |

23 series records against 222 distinct series _name strings_ — on average
each real series has roughly 9-10 name variants sitting as separate,
unmerged records (the ACOTAR/A-Court-of-Thorns-and-Roses split is one
instance of a pattern, not a special case). 437 books carry series
membership as a raw legacy string on the book row; only 71 have a
corresponding structured `series_entries` row. **The vast majority of series
membership in this library has never been migrated into the structured
table at all.**

This is not "ACOTAR happened to get messy." This is systemic and
library-wide. ACOTAR is the visible, well-understood pilot case — Phase 4
below is the FIRST of many reconciliations this mechanism needs to support,
not a one-off fix that closes the ticket.

## Phase 0 — COMPLETE. Audit of every `series_entries.user_edited` writer.

**Status: done, closed on this branch.** Full audit report: see this branch's
Phase 0 completion (feat/series-integrity-mechanism, pre-Phase-1 commit).

Summary of findings, for reference without re-reading the full audit:

- **The invariant holds.** Every direct writer of `user_edited` (11 sites in
  `apps/web/src/data/series.ts`, 1 in `importExport.ts`, 5 migrations) sets
  the flag consistently: `true` = genuine reader gesture (drag, hand-edit,
  manual add, deliberate removal, revival), `false` = machine output
  (seeding, source-refresh ghost inserts), and several sites correctly
  _preserve_ the existing value when linking or re-parenting rather than
  re-stamping it.
- **One historical violation, already closed.** Seeding wrote `user_edited:
true` from commit `ab9e1fe` until `fix/series-seed-provenance` (#131) —
  this made every seeded row permanently immune to `mergeSourceEntries`'s
  `!userEdited` gate, and is the root cause the ACOTAR drift traces back to.
  Closed two ways, both verified on disk: the write fix (seeding now writes
  `false`), and a one-shot repair migration
  (`20260810010000_reset_seeded_user_edited.sql`) that cleared the flag on
  every live row matching the ambiguous-seeded-row shape.
- **Two display-only fallbacks stamp `true` on in-memory entries that are
  never persisted** (`SeriesStrip.tsx`, `chainPrompt.ts`). Not writers, no
  action needed — flagged as latent risk only, worth a code comment if
  either is ever made writable.
- **Conclusion: `user_edited` means what the hard AGENTS.md rule assumes it
  means.** Phase 1's unique constraint and Phase 2's write-path RPC can rely
  on it without building in a second layer of doubt.

This closes the concern that drove Phase 0's creation: production evidence
(Block 8, the Mist-and-Fury `2.5` row) suggested the flag might be set
`true` without genuine reader intent. The audit traced that specific case to
the seeding bug above — already fixed and repaired before this branch even
started — and found no other writer with the same problem. Proceed to
Phase 1 on that basis.

## What Block 8 changed — resolved cases, folded into Phase 4

Production, read-only, `acotar-position-audit.sql` Block 8, the seven
ACOTAR-cluster `series_entries` rows, is the concrete case this mechanism
will be proven against in Phase 4. Two rows were `user_edited=true`:

- **Mist-and-Fury at 2.5** — owner-confirmed not deliberate; the seeding-bug
  shape Phase 0 traced and closed. This row's flag was a false positive from
  the _closed_ historical violation — it predates the repair migration's
  cutoff or was seeded before `#131` landed. Verify on the actual row before
  Phase 4 executes: does the repair migration's guard clause
  (`removed_at is null and user_edited and book_id is not null and label is
null and source = 'manual'`) match this specific row? If the repair
  migration already should have cleared it and didn't, that's a second,
  narrower finding to chase before Phase 4 — report rather than assume.
- **Wings-and-Ruin at position 4** — owner set this directly. Per Phase 0,
  this reflects a genuine reader gesture (the flag is trustworthy), so it is
  NOT a false positive to override. It doesn't cleanly match either external
  source (Wikidata implies 3, Wikipedia implies 3) — this is a real
  disagreement between the reader's stated position and both external
  sources, not a data-integrity bug. Surface to the owner as a discrepancy
  in Phase 4; do not auto-correct a `user_edited=true` row even though two
  sources disagree with it.

## Ownership vs. membership — a rule the mechanism must encode, not handle ad hoc

Established from the Mist-and-Fury case (owner-confirmed: "not intended...
incorrectly configured with our workflow"), and it will recur constantly
given Block D's scope:

**A `series_entries` row represents "this slot in the reading order is
filled" — not "I own N copies of this book."** One physical book equals one
series slot, regardless of how many formats (physical/ebook/audiobook) the
reader holds. Format/ownership is a `books`-table concern
(`owned_physical`/`owned_ebook`/`owned_audiobook`); series membership is a
`series_entries` concern. These must never be conflated by the
reconciliation tooling.

Two distinct repair shapes follow, and Phase 4's tooling needs to
distinguish them per case, not assume one:

- **Duplicate `books` row from messy import** (the actual Mist-and-Fury
  case, confirmed by the owner) — the Iron-Flame shape. Merge the book rows
  via `merge_books`; the entry collapses naturally since only one book
  remains to hold it.
- **Genuine second copy, different format** (a real case the tooling must
  also handle, even though it didn't apply here) — keep both `books` rows
  (real owned copies), but merge the `series_entries` down to one,
  re-pointing the redundant entry to the surviving one. `merge_books` as it
  exists today assumes a losing book row disappears; this shape needs a
  variant, or a documented manual path, that merges entries without merging
  books. Report which before implementing either.

## Phase 1 — schema. Report before implementing; some of this may need judgment calls flagged back.

1. Add `unique (series_id, position) where removed_at is null` to
   `series_entries`. This alone would have caught the ACOTAR collision (two
   books both claiming position 4) at write time. Report what happens to any
   row that currently violates this — the constraint can't be added against
   dirty data, so report the violating set first (read-only, staged for the
   owner, same as every prior production query this session) before
   proposing how they get resolved prior to the constraint landing. Given
   Block D's scope, also report whether violations cluster (a handful of
   series account for most collisions) or spread evenly — this determines
   whether pre-constraint cleanup is a week of Iron-Flame-style incidents or
   needs its own batched tooling.
2. Add a length column to `public.series` — name and type your call, argue
   it. This is the new canonical home; `books.series_count` becomes a synced
   copy, not an independent source. (Confirmed absent — see
   `docs/audits/series-count-schema.md` §1: never existed, not a dead
   column.)
3. Decide and justify: does `books.series_count`/`books.position` stay as
   real columns (synced, not independently writable) for cheap read access,
   or does display move to always reading through a join/view? Argue for
   keeping the synced-copy columns unless you find a strong reason not to —
   removing them is a bigger blast radius (every read site changes) for a
   marginal gain, but make the case explicitly rather than defaulting.

## Phase 2 — COMPLETE. The write path. One RPC, `merge_books`-shaped.

**Status: implemented and green on this branch** (`set_series_order`, `20260814010000`). The spec
below is unchanged; what it produced, and the three owner rulings taken along the way:

- **`set_series_order(p_series, p_slots, p_origin, p_opts)`** — batch-shaped from birth, which is
  what makes a reorder-specific variant unnecessary. It parks affected rows above
  `greatest(max live, max requested)` before writing finals, because probing showed a
  single-statement swap AND a whole-list renumber both fail 23505 under a non-deferrable partial
  unique index. A deferrable partial `EXCLUDE` constraint also works and was refused.
- **`merge_books` step 4 — option (a), derive don't merge** (owner ruling). `position` and
  `series_count` left step 4's coalesce list; step 4b derives them from the surviving entry and its
  series row, with `p_fields` kept as the fallback for books with no live entry.
- **Phase 1's migration is SPLIT** (owner ruling, revising the Phase 1 "alongside or after"
  ruling). `series.length` stays in `20260813010000`; the partial unique index moved to
  `20260816010000` and deploys LAST, after the re-pointed app ships. Never re-merge the two files —
  one `db push` applying both is exactly the hazard the split exists to prevent.
- **No second RPC for insert-side position selection** (owner ruling). The RPC owns writes that
  MOVE a live slot or set length; an insert choosing a position is a different operation the unique
  index already protects by failing loud. The two silent-collision fallbacks were hardened instead
  (`series_entries.position`'s `default 0` dropped; the `?? 0` seeding fallback and the source
  insert's `: 0` both send an unplaceable book to the end of the order).

## Phase 2 — the original spec. One RPC, `merge_books`-shaped.

1. Design a security-definer RPC — name it, argue for the name — that is the
   ONLY path allowed to write series length or position. It writes
   `series_entries` and the synced `books` columns atomically, in one
   transaction, exactly as `merge_books` does across its seven tables.
2. Re-point every current writer identified in `docs/audits/series-count-schema.md`
   §4 (`toBookRow()`'s four callers, `restoreBackup`, the edit dialog,
   `merge_books` step 4 itself, `backfill_series_from_titles()`) through the
   new RPC instead of direct `UPDATE`. Report any writer where this is
   awkward or seems wrong, rather than forcing it through silently.
3. Replace `syncBookPosition`'s two-statement dual-write (`series.ts:417`)
   with a single call into the new RPC. This closes a live hazard, not just
   a hypothetical the mechanism prevents going forward — treat it as the
   first concrete win.
4. `user_edited = true` protection — now confirmed reliable by Phase 0 —
   must survive inside the new RPC exactly as it does in
   `mergeSourceEntries` today. State explicitly how the RPC checks this
   before writing.

## Phase 3 — `claimedSeriesLength` and `displayTotal` retire or change meaning

Both functions in `packages/core/src/seriesIndex.ts` currently reconcile a
disagreement that Phase 1-2 should eliminate at the source. Report: once
`public.series` has a real length column populated through the new RPC, do
these functions become simple reads of that column (and the client-side
reconciliation logic deleted), or do they still serve a purpose (e.g. as a
fallback for series never touched by the new write path)? Do not delete
speculatively — report what still needs them after the schema exists, then
act on that.

## Phase 4 — ACOTAR runs through the mechanism as the proof case, first of many

Do not implement this phase yet. Report only: once Phases 1-3 land, what
does running ACOTAR's correction through the new RPC actually require —

- The series-record merge itself (two `public.series` rows for one series)
  still needs `task-series-consolidation.md`'s three-outcome decision table
  (same / distinct / related-but-separate) — that tooling is separate from
  this task and unaffected by it.
- The Mist-and-Fury book-row merge via `merge_books`, per the ownership-vs-
  membership rule above.
- Position correction for the `user_edited=false` rows: **Frost and
  Starlight = 3.5, Silver Flames = 5.** This is the owner's convention
  (novellas get `.5`), NOT sourced from Wikidata (which states 3.1/4) or
  Wikipedia (which states 4/5) — record it in the fix as an explicit owner
  convention, attributed to neither source, per the standing sourcing
  discipline.
- Wings-and-Ruin's `user_edited=true` row is surfaced to the owner as a
  discrepancy (per Block 8 above), not silently corrected.
- Given Block D's scope, report whether Phase 4's ACOTAR work should produce
  a REUSABLE incident-file template (a parameterized version of what Iron
  Flame and Mist-and-Fury needed) rather than a one-off script — since this
  pattern will repeat roughly 22 more times at minimum (23 series records
  against what may resolve to far fewer real series). This does not mean
  automated library-wide correction — the standing rule against automating
  unverified correction still holds — but the REVIEW WORKFLOW (audit query
  → owner review → staged SQL → owner runs) established for Iron Flame and
  Mist-and-Fury should become a documented, repeatable procedure rather than
  reinvented each time.

## Standing

Investigate and report before implementing — if any premise here doesn't
hold against the real schema, stop and report rather than forcing it. No
production writes from a Code session, ever, including read-only SELECTs —
stage any query needed for the owner to run by hand. Full gate including
`format:check` against a clean worktree of the committed HEAD, pinned
prettier, never `npx`. Full e2e at default workers, all three projects. No
merge without explicit authorization, phase by phase — Phase 1 is now the
next checkpoint.
