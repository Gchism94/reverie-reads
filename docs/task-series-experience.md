# Task: Series Experience — The Series Page IS the Reading Order

> **Status: shipped in #52.** This is the brief the work was built against, not a description of
> how the app behaves today. Removal semantics were revised in #77
> (`docs/decisions/0004-series-removal-semantics.md`). The one-order decision holds —
> `docs/decisions/0001-series-single-order.md`. For current behavior, read the code and
> `docs/DATA_MODEL.md`.

**Branch:** `feat/series-experience`
**Dependencies:** `feat/ownership-model` (ghost-slot adds) and `feat/book-editing` (series status enum) merged first.
**Golden rule applies:** eyeball on the real authenticated app before merge.

## Context

Launch feedback: "how do I look at the series?", book detail doesn't show the other books in a series, and the "Order" tab confused its one tester. Design decision, locked: **the standalone Order tab dies.** Reading order is not metadata to consult; it's a position the reader occupies. The series page renders _as_ the order, with the user's state woven in. The old prototype's Grid ⇄ Series library toggle returns.

## 1. Series detail page

One ordered shelf, top to bottom (or a vertical-scrolling spine arrangement — use the skin system's vocabulary; this is a marquee surface):

- **Every canonical entry in reading order**, including books not in the user's library, rendered as **ghost slots** — outlined spine/cover placeholders with title, position, and an add action (creates an unowned record, straight onto a chosen TBR or just into the wishlist; per ownership model).
- **Per-entry state, inline:** read ✓ / currently reading / on a TBR (which one) / owned-unread / not owned ("to get").
- **Position badges:** decimal positions with optional labels — #0.5, #2.5 rendered with tags like "novella," "prequel." Schema: numeric position (supports decimals) + optional short label on the series-membership relation.
- **Progress lockup** at top: "Read 3 of 7 · 2 to get" plus series status (from the book-editing enum) and a subtle progress rule.
- **Next Up:** the first unread entry in order is visually elevated. If Next Up is unowned, the ghost slot carries "you need this next" framing with the add action. This is the page's emotional center — spend design effort here.
- **Drag to reorder** with auto decimal assignment when dropped between neighbors (drop between #2 and #3 → 2.5; renormalize positions silently when they get ugly). Keyboard-accessible fallback. Manual order always wins over source data.

## 2. Canonical series data

- Where Hardcover has the series (backend, 60 req/min, cache per series daily like the releases pattern), seed entries and positions from it — but user edits are never overwritten by refresh; source data only fills gaps.
- Manual series creation/editing is first-class: create a series, name it, set status, add books (from library or as ghost entries with just title/author), reorder. Indie/KU series will often have no source data at all.

## 3. Library Grid ⇄ Series toggle

- Restore the toggle in the Library: Series mode lists each series as a compact strip — covers in order, read ticks, "X to get" badge, series status — tapping through to the series page. Standalones group at the end or under their own header (your call, report it).

## 4. Book detail series strip

- Books in a series show a strip on their detail page: "#3 of 7 · SeriesName" with prev/next neighbor covers and a link to the series page. Neighbors respect reading order including ghosts.

## 5. Post-read chain prompt

- On marking a book read, if a next-in-series entry exists: one-tap prompt — "Next: {title}" with actions _Reading now / Add to TBR / dismiss_. If next is unowned, the add action creates the unowned record. Non-blocking, easily dismissed, never repeated for the same event.

## Explicitly deferred (record as ADR)

Alternate orders (publication vs. chronological vs. author-recommended). Schema stores a single position now; write `docs/decisions/` ADR noting the deferral and that the series-membership relation is where an `order_variant` dimension would attach later. Also deferred: a home-page "continue the series" rail — falls out of this model but is a separate home-page conversation.

## Out of scope

Genre/cover editing (book-editing task). Releases/author-following integration. Any social surface — series pages are private like everything else.

## Acceptance / eyeball checklist

- [ ] Order tab removed; no orphaned routes or nav entries
- [ ] Open a series: full order incl. a ghost entry; states render correctly; progress lockup accurate
- [ ] Next Up elevates the correct book; unowned Next Up shows acquisition framing; add-from-ghost lands an unowned record on a TBR
- [ ] Drag a novella between #2 and #3 → position 2.5 with label; survives reload and a Hardcover refresh
- [ ] Library Series mode lists series with accurate ticks and "X to get"; taps through
- [ ] Book detail strip shows correct neighbors; links work
- [ ] Mark a mid-series book read → chain prompt appears once, all three actions work
- [ ] ADR committed; eyeballed across ≥3 skins; contrast test, axe, full suite green

## Completion report

Report: schema for series membership (position/label), Hardcover seeding + cache + non-overwrite mechanics, standalone-grouping choice, prompt implementation, ADR path, surfaces eyeballed, test results.
