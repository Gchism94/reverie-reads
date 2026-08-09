# Task: Cover System — The Cover Is the Door

> **Status: shipped in #50.** This is the brief the work was built against, not a description of
> how the app behaves today. The ingest posture narrowed in #79 — Google Books is display-only
> now. See `docs/decisions/0005-google-covers-display-only.md`. For current behavior, read the
> code and `docs/reference/DATA_MODEL.md`.

**Branch:** `feat/cover-system`
**Dependencies:** none hard; can run parallel to other feature branches. Coordinate lightly with `fix/import-quality` (the no-cover placeholder gains an affordance here; the placeholder's visual policy lives there).
**Golden rule applies:** eyeball on the real authenticated app before merge — on a real phone for the camera path, not just devtools emulation.

## Context

Launch feedback: no way to change a book's cover. The design decision, locked: covers are the most emotional metadata in a personal library, so the entry point is the cover itself, editions are treated as real objects rather than an image wall, capture-your-own-copy is first-class (this project began as a barcode scanner — the book is in the reader's hand), and every cover flows through one durable ingest pipeline. No hotlinking — externally-scraped image URLs rot (established: Amazon URLs break unpredictably).

## 1. Entry points

- **Tap the cover on book detail** → the cover sheet. This is the primary gesture. Also reachable from the edit form via a modest "change cover" affordance.
- **The no-cover placeholder invites:** wherever the honest placeholder renders (detail, grid — not spines), it carries a quiet "add a cover" affordance opening the same sheet. Don't restyle the placeholder itself; that's import-quality's surface.

## 2. The cover sheet — four input paths

- **Editions chooser:** fetch alternates from Hardcover editions (backend, 60 req/min, cache per book) and Google Books by ISBN falling back to title+author (existing referrer-restricted client key). Present grouped as _editions with context_ — cover, format, year — not a bare image grid. Selecting an edition's cover offers (does not force) syncing the book's format/ISBN/edition fields to match; a one-tap "also update edition details" secondary action.
- **Camera capture:** `<input type="file" accept="image/*" capture="environment">` (PWA-friendly, no native APIs), followed by a simple client-side crop UI constrained to 2:3. No deskew/perspective correction — crop only; keep it light.
- **Upload** an existing image, same crop step.
- **Paste a direct image URL.** Direct image URLs only — do not build a product-page scraper.

## 3. Ingest pipeline — one path for everything

- An edge function ingests every chosen cover regardless of source: fetch (or receive upload), validate image type and a sane size cap, normalize — webp, max ~1200px on the long edge, plus a ~300px thumbnail — and store in a user-scoped Supabase Storage path (RLS-consistent).
- Persist alongside: `source` (hardcover | google | upload | camera | url), `source_url` where applicable (provenance / re-fetch), and a `user_chosen` flag.
- **User choice is never overwritten** by the enrichment chain — same non-overwrite principle as series data. Enrichment fills only where no user-chosen cover exists.
- Grids, spines, shelves, and home all consume the stored asset (thumb where appropriate), never the external URL.
- Migrate/backfill pragmatically: existing covers keep working as-is; ingest lazily on next access or via a low-priority sweep — your call on mechanism, report it. Do not block the task on a full-library backfill.

## 4. Spine tint (small, cuttable)

- At ingest, extract the cover's dominant color client-side (canvas sampling is fine) and store it per book. Feed it as a per-book tint into the generated spine treatment so shelves take on the palette of the user's actual editions.
- Constraints: the tint must compose with skin tokens (a tint parameter the skin's spine recipe consumes, not a hardcoded override) and must not break the registry-keyed contrast test — if a tint would violate contrast for spine text, clamp or fall back to the skin default.
- **If the spine system resists per-book tinting cleanly, cut this section and say so in the report** rather than forcing it. The pipeline still stores the color for later.

## Out of scope

Placeholder redesign (import-quality). Barcode-scan-to-add flows. Batch cover management UI. Any perspective correction / image enhancement beyond crop.

## Acceptance / eyeball checklist

- [ ] Tap a cover → sheet opens; choose an API edition → new cover everywhere (grid, spine flip, shelf, home) after ingest; "also update edition details" works and is optional
- [ ] Camera path on a real phone: shoot a physical book, crop, save; result renders crisply at grid and detail sizes
- [ ] Upload and direct-URL paths work; a non-image URL fails gracefully
- [ ] Kill the network to the original external URL (or simulate) → cover still renders from storage
- [ ] Re-running enrichment does not replace a user-chosen cover
- [ ] Spine tint visible on ≥3 skins (or the cut documented); contrast test green
- [ ] Placeholder's "add a cover" affordance opens the sheet
- [ ] Full suite + axe green

## Completion report

Report: storage schema/paths, edge function behavior (validation, normalization, limits), backfill mechanism chosen, edition-sync implementation, spine-tint outcome (shipped or cut, with reasoning), phone model used for the camera eyeball, test results.
