# ADR 0004 — Removing a book from a series is one operation, and it is a tombstone

**Status:** accepted · 2026-07-25
**Context:** `fix/series-shelf-audit` (#77; supersedes the removal half of `docs/task-series-defects.md`)

## Decision

**One removal, two entry points.** The ✕ on the series screen and clearing the series field on the
book detail page now take the same path. Both:

1. **soft-delete** the `series_entries` row — `removed_at = now()`, `book_id = null`,
   `user_edited = true`; and
2. **clear `books.series`** on the book itself.

A removed slot is a tombstone, not a deleted row. Live-entry queries filter `removed_at is null`
(partial index `series_entries_live_idx`). Re-adding the same book to the series **revives** the
tombstone rather than inserting a second row.

The ✕ is available on **every** entry, linked or ghost, behind a confirm dialog.

## Why it had to be unified

The two surfaces meant different things by "remove", and the difference was invisible to the reader.

- The series screen's ✕ **detached** the entry — it cleared `book_id` and left the slot in place —
  and was gated to ghost entries only (`{!book && …}`), so a reader looking at a linked book could
  not remove it from the series at all from the screen built for managing the series.
- Clearing the series field on the book page updated `books.series` and left the `series_entries`
  row pointing at a book that no longer claimed the series.

Either way the reader saw the book leave one screen and stay on the other. "Removed from the series"
is a single idea; it should not depend on which page you happened to be standing on.

## Why a tombstone rather than a delete

`series` rows can carry `source = 'hardcover'` and are refreshed against the canonical source. A hard
delete leaves no record that the reader made a decision, so the next reconciliation looks at a
canonical series with a missing slot and **helpfully puts it back**. The reader removes the book, the
series refreshes, the book returns — and nothing in the data explains why.

`removed_at` makes the decision durable. Reconciliation reads the tombstone as "the reader dismissed
this slot" and leaves it dismissed. This is the same principle as `user_edited` in
[ADR 0001](0001-series-single-order.md): **a reader's explicit act outranks source data**, and the
schema has to remember the act for that to hold across a refresh.

## Consequences

- `series_entries` accumulates tombstone rows. Bounded by how many books a reader removes from a
  series and cheap to filter (partial index), so no cleanup job is scheduled.
- Every query touching `series_entries` must filter `removed_at is null`. Missing the filter
  resurrects removed slots in that view.
- Reconciliation gained a deterministic order (`position asc nulls last, title`) so a refresh
  doesn't reshuffle equal-position entries, and tombstone revival so re-adding is idempotent.
- Removal invalidates via `qc.removeQueries` rather than `invalidateQueries` for the series key —
  invalidation refetched a series that may no longer exist and flashed stale entries.
- Because removal now writes to two places, it is one of the code paths `#78`'s write-error
  surfacing covers: a partial removal reports rather than failing silently.
