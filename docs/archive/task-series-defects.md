# Task: Series Defects — Removal, Positions, and Status Widening

> **Status: shipped in #65.** This is the brief the work was built against, not a description of
> how the app behaves today. Revised by #77: removal is now one operation across both entry
> points, and a removal is a tombstone. See `docs/decisions/0004-series-removal-semantics.md`.
> For current behavior, read the code and `docs/reference/DATA_MODEL.md`.

**Branch:** `fix/series-defects`
**Repo:** book-corpus
**Dependencies:** none hard; can run parallel to the ownership/add-flow lane.

## Context

Tester feedback on the series experience shipped in PR #52 reports three defects and one
gap:

1. **Books cannot be removed from a series.** Deleting the series reference in the book
   page's "add details" doesn't detach it; adding a book to a series from the "see whole
   series" link is likewise irreversible.
2. **Positions appear randomly assigned and are not editable from the book page.** Each
   book gets a number (presumably its series position), and correcting it in the book's
   "add details" doesn't take effect.
3. **Series status needs two more values** (confirmed): add `interconnected_standalone`
   and `interconnected_series` to the existing
   `standalone | ongoing | completed | on_hiatus | cancelled` set. Romance especially
   lives in interconnected-standalone territory.
4. **Parked, do not build:** connecting multiple series into a universe/saga layer. Note
   it in the report as a future feature; do not foreclose it in schema.

## Fixes

**Removal.** A book must be detachable from a series from both entry points — the book
page's series field and the series detail page. Removing a book from a series deletes its
`series_entries` row (or converts it to a ghost if the entry should persist as a
canonical slot the user no longer owns — decide which and report; the likely right
behavior is: removing from the book page detaches the book but keeps the canonical slot
as a ghost, while removing from the series page removes the slot entirely).

**Positions.** Investigate why positions look random — is source data from Hardcover
seeding wrong values, are manual entries being overwritten by refresh (the `user_edited`
flag from #52 should prevent that), or is the book page's position field simply not
writing to `series_entries.position`? Report the root cause. Then: the position set in
the book page's details must write through and survive refresh, exactly as the series
page's drag-reorder does. Both surfaces write the same field; they must not disagree.

**Status widening.** Extend the enum, migrate cleanly, and update `normalizeSeriesStatus`
to handle the two new values plus likely import spellings. Update the status badges and
any copy that enumerates statuses.

## Acceptance / eyeball checklist

- [ ] Remove a book from a series via the book page — detaches, survives reload
- [ ] Remove a book from a series via the series page — slot removed, survives reload
- [ ] Set a position in the book page's details → the series page reflects it; drag on
      the series page → the book page reflects it; both survive a source refresh
- [ ] All seven status values selectable and persisted with correct badges
- [ ] Full suite, lint, `pnpm build` green; eyeballed on the real authenticated app

## Completion report

Report: root cause of the position defect, the removal semantics chosen for each entry
point and why, the status migration mapping, and a note on the parked multi-series
(universe/saga) feature.

---

## Revision — 2026-07-25, after a browser audit of the shipped fix

PR #65 was verified at the DB level only; the UI eyeball in the acceptance list above never
happened. A follow-up audit drove all four reported defects through the real browser UI and
three of #65's claims did not survive it. This section records what changed and supersedes
the removal semantics specified above.

**Removal is now ONE act with one meaning, on both entry points.** #65 gave the two surfaces
deliberately different semantics — the series page deleted the slot, the book page merely
detached the book and kept the slot as a ghost. Readers reported the second as "removing
doesn't stick": the book was still sitting in the series afterwards. Remove now means the slot
is gone and the book stops naming the series, wherever it is invoked, and both entry points
confirm before acting. The earlier "keep the canonical slot" rationale is withdrawn — a slot
the reader dismissed is not a slot worth preserving on their behalf.

**Removal is a soft delete.** `series_entries.removed_at` (migration
`20260725010000_series_entry_removal.sql`) tombstones the row. Live reads filter it out; only
the source merge is shown it, so a Hardcover refresh matches the removed title and never
re-inserts the ghost the reader dismissed. A deliberate re-add — the picker, a new ghost slot,
or the book naming the series again — revives the row. Removal outlives a refresh, not the
reader changing their mind.

**The series page's remove control was unreachable.** It was gated on `!book`, so it rendered
only for ghost slots; a book added through "see the whole series" (ghost → ＋ Add) linked its
entry and the ✕ disappeared for good. #65 changed that button's call signature but left the
guard, which left `useRemoveEntry`'s "clear books.series" branch unreachable with a bookId —
dead code. This is the defect the DB-only verification could not have caught.

**Positions were still seeded from raw `books.position`.** #65 fixed _editability_ but not the
seeding its own root-cause analysis named: an import parks a GLOBAL order number there, so
412/87/1290 rendered as "#87, #412, #1290". `seedSeriesPositions` (core) now judges the set as
a whole — believable in-series indices are kept, gaps included, since owning #1, #2, #5 means
two are missing; anything else is renumbered to 1..n preserving relative order. The
reconciliation's library query also had no `ORDER BY`, so a null-position library numbered
itself by whatever order rows came back in.

**Two smaller edit-path defects.** `Number(v) || ''` treated 0 as empty, so #0 could not be set
and silently cleared the field; and clearing the position left the old number standing on the
series side. Clearing now sends the slot to the end — the same rule the seeder uses for a book
with no number at all.

**Stale badges.** The series query is persisted to IndexedDB and `staleTime` kept a restored
copy "fresh", so an edited position repainted the OLD numbers for ~2s. The series shelf now
opts out of persistence: its query reconciles the library into `series_entries` — it writes on
every run — so a restored copy is a derived snapshot that cannot refresh itself offline anyway.

**Parked, still parked:** the multi-series universe/saga layer. `removed_at` is additive and
does not foreclose a future `series_group`/`universe` relation.

### Verification

Seven e2e guards in `apps/web/e2e/series-removal-positions.spec.ts` drive the actual controls —
the ✕ on a linked row, the acquire-then-remove path, the book page's confirm, a source refresh
against a tombstone, both position-seeding shapes, and a stale-paint guard that samples the
series page as it opens. `pnpm db:seed` was also repaired (it had been failing the
`books_status_check` since 20260715, which is why the app could not be stood up locally with
data — the likely reason #65 was never eyeballed).
