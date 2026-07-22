# Task: Series Defects — Removal, Positions, and Status Widening

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
