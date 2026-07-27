# Task: Ownership Model v2 — Borrowed, Unset, and the Reading-History Hole

> **Status: shipped in #68.** This is the brief the work was built against, not a description of
> how the app behaves today. This is the current possession model. `docs/DATA_MODEL.md` carries
> the shipped shape. For current behavior, read the code and `docs/DATA_MODEL.md`.

**Branch:** `feat/ownership-v2`
**Repo:** book-corpus
**Dependencies:** `fix/shelf-regressions` merged first (it touches the same shelf/library
surfaces). **Blocks** `feat/add-flow-parity`.

## Context

Tester feedback exposed a real design flaw. The two-state ownership model
(`owned | unowned`) forces every book into a possession category, and the library's
default filter scopes to owned — so **a book you read from the library disappears from
your library entirely.** Reading history is silently gated on ownership. The tester
asked for "borrowed" three separate times (as an ownership option, as a book "type,"
and implicitly as *"no place to see the books you 'read' unless you own it"*).

Confirmed decisions:
- Ownership becomes **four states**: `owned | borrowed | wishlist | unset`.
- Read status gains an **unset** state — cataloguing a book must not force
  read/reading/unread/DNF.
- The library's default scope changes from "owned" to **anything you own, have
  borrowed, or have read** — reading history is never hidden by possession.

Note: `books.source` already carries `'Borrowed'` on ~77 rows as a provenance string.
Survey it — it may be usable as backfill signal, but `source` is provenance and
`ownership` is state; do not conflate them. Report what you find.

## Data model

- Widen the `ownership` constraint from `('owned','unowned')` to
  `('owned','borrowed','wishlist','unset')`.
- **Migration mapping:** existing `'owned'` → `'owned'`; existing `'unowned'` →
  `'wishlist'` (that was its meaning — a book you want, not a book you're neutral
  about). Consider backfilling `source='Borrowed'` rows to `ownership='borrowed'` —
  propose this in the report before doing it, with the row count.
- Read status: add an unset/null state. Survey how read status is currently stored
  (enum, text, nullable?) and make "no selection" representable and the default for
  newly added books.
- Format flags keep the **suppress-not-clear** behavior from #48: flags are retained
  regardless of ownership state and surfaced only where appropriate. `bookOwnedFormats()`
  gates on `owned` today — extend it so **borrowed** books can also carry a format
  (the tester explicitly wants to record the *type* of a book they read but don't own).

## Surfaces

- **Library default scope:** `ownership IN ('owned','borrowed') OR readStatus is a read
  state`. Wishlist and unset books stay out of the default grid but remain reachable via
  filter chips. Audit every count and stat against this: *collection* stats scope to
  owned (+borrowed where meaningful — your call, report it); *reading* stats never scope
  on ownership.
- **Ownership control** (book detail and add form): four options in each skin's voice,
  including a genuine "not set" that is the default for new books rather than a forced
  choice. Keep the per-skin vocabulary pattern from #48 (ownIt/wantIt) and extend it.
- **Borrowed visual treatment:** distinct from the wishlist ghost treatment — a borrowed
  book is in your hands, not on a wishlist. Use skin tokens; pass the registry-keyed
  contrast test across all nine skins.
- **Read status control:** "not set" is selectable and default; no forced choice.

## Out of scope

Due dates, lending tracking, library-system integration, return reminders. Borrowed is a
state, not a subsystem. The add-form parity work (its own task).

## Acceptance / eyeball checklist

- [ ] Migration applied; pre-existing owned books unchanged; former unowned books read
      as wishlist
- [ ] Add a book with no ownership and no read status selected — it saves, and neither
      field shows a value it wasn't given
- [ ] Mark a book borrowed, mark it read, do not mark it owned → it appears in the
      library and in reading stats
- [ ] A borrowed book can carry a format (paperback/ebook/audio)
- [ ] Wishlist books stay out of the default grid, reachable by filter
- [ ] Borrowed treatment eyeballed in ≥3 skins; contrast test green
- [ ] Full suite, lint, `pnpm build` green

## Completion report

Report: migration SQL and mapping, the `source='Borrowed'` backfill proposal with row
counts, every query audited for the new default scope, how read-status-unset is
represented, the four-state per-skin vocabulary, and skins eyeballed.
