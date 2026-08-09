# Task: Regression Investigation — Shelf Add & Shelf Reorder

> **Status: shipped in #64.** This is the brief the work was built against, not a description of
> how the app behaves today. Shelf reorder needed surfacing again in #77. For current behavior,
> read the code and `docs/reference/DATA_MODEL.md`.

**Branch:** `fix/shelf-regressions`
**Repo:** book-corpus
**Priority:** highest — this is shipped, verified functionality that has since broken.
**Dependencies:** none. Do this first.

## Context

Two capabilities shipped and were scripted-verified on the real authenticated app in
PR #48 (ownership model) and PR #49 (shelf system):

1. Adding a book you do **not** own to a shelf or TBR, via the shelf's own add button,
   without visiting the book's detail page. (#49 acceptance: _"an unowned book added to
   a TBR via the shelf's picker without ever visiting the book's page"_ — passed.)
2. Reordering books **within** a shelf by drag, with a keyboard fallback. (#49
   acceptance: _"book reorder persists"_ — passed.)

A tester **on the current production build** reports both are now broken:

- "cannot add books to your shelves/tbrs that you do not have in your library"
- "Once in a shelf, you cannot edit the order of books on the shelf"

## Investigate before fixing

This is a regression hunt, not a feature build. Establish the facts first and report
them before changing anything:

- Reproduce both on the current build (real authenticated app). Confirm they are broken
  and describe the exact failing behavior — is the affordance missing entirely, present
  but non-functional, or erroring?
- **Bisect:** the acceptance checks passed at #49. Identify what changed since. Prime
  suspects in order: the merge/rebase sequence around #58–#60 (several branches
  rebased on each other), the `ShelvesRoute` rewrite noted during #49's own rebase, the
  `CoverImage` refactor in #58 that rerouted Discover and SpineShelf through a shared
  component, and any surface that was rewritten rather than extended.
- Determine whether the `LibraryPicker` / `onExternalSearch` seam from #49 and #55 is
  still wired, and whether the drag/position write path still reaches the
  `list_items.position` column.
- Check whether the reorder failure is UI-only (handles missing, drag not binding) or
  persistence (writes not landing).

Report the root cause of each before implementing.

## Fix

- Restore both capabilities to their #49-specified behavior: shelf-scoped add that
  accepts unowned books (creating an unowned record placed on that shelf), and
  drag-reorder within a shelf with a keyboard-accessible fallback.
- **Add regression tests that would have caught this** — the original acceptance checks
  were scripted manually. Convert both into automated e2e assertions so a future
  rebase can't silently break them again. This is the most important part of the task.

## Acceptance / eyeball checklist

- [ ] Add an unowned book to a TBR from the shelf's own add button, never visiting the
      book detail page — book lands on the shelf, marked unowned
- [ ] Drag-reorder books within a shelf; order persists across reload
- [ ] Keyboard fallback (▲▼) reorders and persists
- [ ] New e2e tests cover both and fail against the broken build
- [ ] Full suite, lint, `pnpm build` green

## Completion report

Report: reproduction of each failure, the root cause and the specific commit/PR that
introduced each regression, the fix, and the new automated tests with confirmation they
fail against the pre-fix state.
