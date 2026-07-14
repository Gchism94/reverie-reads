# ADR 0001 — One reading order per series (alternate orders deferred)

**Status:** accepted · 2026-07-13
**Context:** `feat/series-experience` (docs/task-series-experience.md)

## Decision

The series page renders **one** canonical order per series. `series_entries` stores a single
numeric `position` (decimals first-class: #0.5, #2.5) plus an optional `label` per slot, and the
reader's manual arrangement always wins over source data (`user_edited` pins a row against
Hardcover refreshes).

Alternate orders — publication vs. chronological vs. author-recommended — are **deferred**, not
rejected. Readers of interleaved universes (e.g. publication-order vs. timeline-order debates)
are real, but launch feedback asked for *a* series view, not a choice of them, and every deferred
dimension keeps the drag/decimal/ghost model simpler to trust.

## Where the extension attaches later

`series_entries` is the series-membership relation. An `order_variant` column (e.g.
`'primary' | 'publication' | 'chronological' | <custom uuid>`) would turn the relation into one
row per (entry × variant), with today's rows becoming the `'primary'` variant. The page's
sorting, Next Up, progress, and chain-prompt logic all flow through `sortEntries()` in
`packages/core/src/seriesShelf.ts` — a variant picker only has to choose which rows to feed it.

## Also deferred

A home-page "continue the series" rail. It falls out of this model (`nextUp()` over every series
with a read in progress), but home-page composition is its own conversation.

## Note on the retired Order tab

The standalone Orders tab (cross-series reading-order overlays) was removed from nav, routing,
and the book page in this same change. The `reading_orders` / `reading_order_items` tables and
the import pipeline that builds them from universe files remain — user-authored data is kept, and
a later decision can migrate those overlays onto series pages or drop them.
