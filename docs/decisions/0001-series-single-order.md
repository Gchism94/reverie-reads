# ADR 0001 — One reading order per series (alternate orders deferred)

**Status:** accepted · 2026-07-13 · amended 2026-09-03
**Context:** `feat/series-experience` (docs/archive/task-series-experience.md)

## Decision

The series page renders **one** reader-facing order per series. `series_entries.position` stores the
canonical volume number (decimals first-class: #0.5, #2.5), while `sort_order` stores the reader's
independent shelf order. A drag edits only `sort_order`; it never manufactures a bibliographic
volume such as 5.8. `sort_user_edited` pins that arrangement against source refreshes, while
`user_edited` continues to protect the separate canonical number and label.

Alternate orders — publication vs. chronological vs. author-recommended — are **deferred**, not
rejected. Readers of interleaved universes (e.g. publication-order vs. timeline-order debates)
are real, but launch feedback asked for _a_ series view, not a choice of them, and every deferred
dimension keeps the drag/decimal/ghost model simpler to trust.

## Where the extension attaches later

`series_entries` is the series-membership relation. Alternate variants would attach through a
separate order/entry relation keyed by series entry, with today's `sort_order` becoming the primary
variant. The page's sorting, Next Up, progress, and chain-prompt logic all flow through
`sortEntries()` in `packages/core/src/seriesShelf.ts`.

## Also deferred

A home-page "continue the series" rail. It falls out of this model (`nextUp()` over every series
with a read in progress), but home-page composition is its own conversation.

## Note on the retired Order tab

The standalone Orders tab (cross-series reading-order overlays) was removed from nav, routing,
and the book page in this same change. The `reading_orders` / `reading_order_items` tables and
the import pipeline that builds them from universe files remain — user-authored data is kept, and
a later decision can migrate those overlays onto series pages or drop them.
