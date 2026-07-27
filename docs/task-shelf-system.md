# Task: Shelf & TBR System Overhaul

> **Status: shipped in #49.** This is the brief the work was built against, not a description of
> how the app behaves today. Regressions in this area were fixed in #64 and again in #77. For
> current behavior, read the code and `docs/DATA_MODEL.md`.

**Branch:** `feat/shelf-system`
**Dependencies:** `feat/ownership-model` must be merged first.
**Golden rule applies:** eyeball on the real authenticated app before merge.

## Context

Launch feedback clusters here: shelves/TBRs can't be opened as their own view, can't be reordered (stuck in creation order), books within a shelf can't be reordered, adding a book requires going through the book itself, only TBRs can be priority, and Reading Now on the home page isn't editable. These are one coherent system — build them together.

## 1. Shelf/TBR detail page

- Clicking a shelf or TBR (its name/header anywhere it appears — Shelves page rails, home page priority rails) opens a full detail page: name, description, count, and all its books.
- Two renderings, toggleable: the spine-shelf treatment (the signature look) and a cover grid (utility). Remember the skin character system — the detail page is a marquee surface; use existing slot configs and tokens, no bespoke hardcoded styling.
- Books on the page open book detail; back returns to the shelf (per the back-navigation pattern from `fix/launch-hotfixes`).

## 2. Manual ordering — both levels

- **Shelves themselves:** add a `sort_order` (or equivalent) to shelves/TBRs. The Shelves page and home render in this order, not creation date. Drag-and-drop to reorder; new shelves append to the end.
- **Books within a shelf:** add a position to the shelf-membership relation. Drag-and-drop within the detail page (and within rails if feasible without jank); new books append to the end.
- Both drag interactions need a keyboard-accessible fallback (move up/down affordances or equivalent) — axe must stay green.
- Use fractional/spaced positioning or renumber-on-write; your call, note it in the report.

## 3. Priority shelves

- TBRs already carry a priority flag that surfaces them on the home page. Extend the same flag to shelves.
- Home page renders **all** priority-flagged shelves and TBRs, in the user's manual order, as spine rails. The flag is the cap — no artificial slot limit. If zero items are flagged, keep the current default behavior.

## 4. Add-book affordance on every shelf

- Each shelf/TBR gets an "add book" action — on the detail page and on rails (an end-cap "+" slot on the shelf itself is in keeping with the physical-library feel; use judgment against the skin system).
- Opens a picker: search your library first (owned + unowned). Include a visible, disabled-or-stubbed path for external search ("can't find it? search everywhere") that the `feat/discover-search` task will wire up — design the picker so that plugs in without rework.
- Adding from this picker defaults ownership to unowned for new-to-library books (per ownership-model context defaults).

## 5. Editable Reading Now

- The home page Reading Now section becomes editable in place: add a current read (picker from library), remove one (without losing reading progress data — removing from Reading Now is not un-marking as reading; decide the semantics and document them; recommended: removing from the home display sets the book's status back to its prior state only if the user confirms, otherwise it's display-only), and reorder if multiple.
- Keep the existing progress-nudge and finish-into-read-log behaviors intact.

## Out of scope

Series pages (own task). External search inside the picker (discover task). Shelf sharing/visibility (privacy copy rules stand: shelves are private by default; do not add any public path).

## Acceptance / eyeball checklist

- [ ] Open a TBR and a shelf as full pages; both renderings; navigation in/out correct
- [ ] Drag a shelf to a new position; order persists across reload and reflects on home
- [ ] Drag books within a shelf; order persists; keyboard fallback works
- [ ] Flag a shelf (not TBR) as priority → appears on home in chosen order; unflag → disappears
- [ ] Add an unowned book to a TBR via the shelf's add button without ever visiting the book's detail page
- [ ] Edit Reading Now: add, remove, reorder; progress data survives
- [ ] Eyeballed across ≥3 skins; contrast test, axe, full suite green

## Completion report

Report: schema changes, positioning strategy chosen, the Reading Now removal semantics implemented, picker architecture (and the seam left for external search), surfaces eyeballed per skin, test results.
