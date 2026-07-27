# Task: Ownership Model — Decouple "Owned" from "In My Library"

> **Status: shipped in #48 — superseded by `docs/task-ownership-v2.md`.** This is the brief the
> work was built against, not a description of how the app behaves today. The two-state `owned |
> unowned` model this specifies is **no longer the model** — #68 replaced it with four states
> (`owned | borrowed | wishlist | unset`). Read it as history. For current behavior, read the
> code and `docs/DATA_MODEL.md`.

**Branch:** `feat/ownership-model`
**Dependencies:** none, but **blocks** `feat/shelf-system`, `feat/series-experience` (gap adds), and `feat/discover-search`. Merge this first.
**Golden rule applies:** eyeball on the real authenticated app before merge.

## Context

Today, a book record existing implies Greg owns it. Consequences from launch feedback: you cannot add a book to a shelf/TBR unless it's "in your library," and any manual add forces owned status. This breaks the core TBR use case — most of a TBR is books you *don't* own yet. Fix the model, not the symptoms.

## Data model

- Locate the user-book relation (the per-user book record table). Add an `ownership` column: enum/text with allowed values `'owned' | 'unowned'`, NOT NULL, default `'owned'`.
- Backfill: all existing records → `'owned'`.
- Two states only, by decision. Design nothing that forecloses richer states later (borrowed, loaned, preordered), but do not build them.
- RLS: unchanged — this is a user-scoped attribute like any other.
- Shelves, TBRs, reading statuses, ratings, notes: all reference the book record and must work identically regardless of ownership. Audit for any query or constraint that assumes owned.

## Flows

**Manual add (single book, any entry point):** the add form gains an ownership toggle — two options, worded warmly in each skin's voice, semantically "I own this" / "I want to read this." Default is context-sensitive: adding from the library defaults owned; adding from a shelf/TBR context or Discover defaults unowned. Persist the toggle state within the form session only.

**Import:** Reverie XLSX template gains an `Owned` column (yes/no, default yes when blank) — remember the template is generated from `REVERIE_TEMPLATE_COLUMNS` + `REVERIE_PROFILE` with the byte-parity CI check; change the schema source, never the artifact. Goodreads CSV mapping (`Exclusive Shelf`): `read` / `currently-reading` → owned; `to-read` → unowned. If the import-quality task hasn't landed, implement just this mapping rule here and note it.

**Book detail:** ownership is visible and editable — a single tap/click toggles owned ⇄ unowned. Marking a book read does NOT auto-set owned (library books and borrowed reads exist).

## Surfaces

- **Library:** default grid shows owned; a filter chip includes/excludes unowned ("wishlist" framing — check existing copy conventions). Collection-size counts and shelf-of-books displays count owned; read-count stats count reads regardless of ownership.
- **Unowned visual treatment:** a subtle ghost/outline treatment on covers and spines, expressed through skin tokens (per-skin character system), not hardcoded styles. Must pass the registry-keyed contrast test in all nine skins.
- **Stats:** audit stat queries — collection stats (books owned, formats) scope to owned; reading stats (books read, pages, streaks) scope to reads irrespective of ownership.

## Out of scope

Shelf detail pages, shelf ordering, priority shelves (shelf-system task). Discover search (its own task). Purchase links, price tracking, borrowed/loaned states.

## Acceptance / eyeball checklist

- [ ] Migration applied; every pre-existing record is `owned`; app behaves identically for an all-owned library
- [ ] Add a book manually as unowned → it appears on the chosen shelf, does NOT appear in default library grid, DOES appear with the wishlist filter on
- [ ] Toggle ownership from book detail in both directions; library grid and counts update
- [ ] Unowned ghost treatment eyeballed in at least 3 skins including Tryst; contrast test green
- [ ] XLSX template regenerated from schema source; byte-parity check green; blank Owned column imports as owned
- [ ] Goodreads `to-read` rows import as unowned
- [ ] Full suite + axe green

## Completion report

Report: migration SQL, tables/columns touched, every query audited for owned-assumption and its resolution, template schema diff, skins eyeballed, test results. Explicitly list any surface where ownership scoping was ambiguous and the call you made.
