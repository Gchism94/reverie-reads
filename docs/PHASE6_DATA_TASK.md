# Phase 6 — Data track (enrichment aggregator + multiple authors + reading orders)
# coding agent task

Paste into coding agent. A parallel data-layer track alongside the skin track (C2–C4). Same working
agreement: pure logic unit-tested; typecheck/lint/build/axe green; tokens-only; RLS + the
server-enforced spoiler gate preserved; migrate + backfill, never drop the 290-book seed; stage
source only; report at each checkpoint with commit + acceptance.

STATUS: the skin track (C1–C4b) is COMPLETE, so the earlier coordination caveat is moot — this
track is clear to start. Do D0 first, then D1 → D2 → D3.

────────────────────────────────────────────────────────
## D0 — Opening hardening beat (small carry-overs; land before D1)
- Romance-skin RENAME Reverie -> Tryst. Decision: "Reverie" is now the umbrella APP name, so the
  romance skin takes the other cleared finalist, Tryst. Rename the registry entry label/id in
  core/skins.ts, the label-map key, the default-skin reference, and any "Reverie skin" copy/tests.
  VISUALS UNCHANGED — same gothic-NOLA palettes (Nocturne/Magnolia Dawn), fonts, divider; only the
  name moves. The app wordmark elsewhere stays "Reverie". (Default skin remains this one.)
- Cron math GOLDEN-FIXTURE contract test (C4b follow-up): run identical fixtures through both the
  core blend/shift implementation and the Deno evolve-skins copy; assert identical output so CI
  catches drift between the hand-synced copies.
- "Not now" COOLDOWN (C4b follow-up): when a reader dismisses an evolving-skin reveal, remember the
  dismissed target (or set a cooldown) so the monthly cron doesn't re-surface the same material
  shift next run. Lock = never ask; "Not now" needs a memory too (the merge_verdicts pattern).

────────────────────────────────────────────────────────
## D1 — Enrichment aggregator (implements docs/ENRICHMENT_STRATEGY.md)
Grow the enrich Edge Function into a source-pluggable aggregator.
- Source adapters, one per source (Open Library, Google Books, Hardcover [backend token,
  best-effort, beta], ISBNdb [paid, config-gated OFF by default]), each normalizing to a common
  record shape. Enabled set + keys via env, ISBNdb behind a flag like the buy-link attributionMode.
- Merge engine (PURE, in core): field-level precedence per the strategy's map; UNION fields
  (categories/tags, ISBNs/editions, contributors); longest-non-empty for description; user-authored
  fields ALWAYS win; store per-field provenance + fetched_at.
- Identity: ISBN-10<->13 normalize (exists); resolve work + edition; cross-ref source ids.
- Global shared cache table (enrichment_cache) keyed by ISBN-13 AND resolved work/edition id,
  holding the normalized record + provenance + fetched_at. Access ONLY via the Edge Function
  (service role); RLS blocks direct client access. Reference data, not per-user — the Nth user
  scanning a book makes zero external calls.
- Populate the top-level `genre` from the mapped categories during enrichment (closes the C1
  carry-item), with a user override in Add/Edit; seed stays genre='romance'.
- Sync fast pass (one source by ISBN -> title/author/cover, book shows "completing") + async full
  merge -> "complete". Reuse C1 retry windows (3-day incomplete / 30-day complete) and the A4
  per-run/429 controls per source; Open Library throttle + User-Agent; Hardcover low-volume backoff;
  ISBNdb honor ratelimit headers.
- Run the normalized record through match.ts/decideIntake so completeness + dedupe happen together.
Tests: merge precedence + union + user-field-wins + longest-description; ISBN normalize; each
adapter's normalization (mocked fixtures); cache-hit path.
Acceptance: scanning an ISBN yields a record filled across sources per precedence; second scan is a
cache hit (no external calls); user edits never overwritten; all-miss degrades to partial + queued.

## D2 — Multiple authors / contributors
Generalize the single `author` to ordered, multi-contributor.
- Model (normalized): authors(id, name, ...) + book_authors(book_id, author_id, position, role).
  Role enum: author, co_author, translator, illustrator, narrator, editor. Ordered by position.
  Normalized (not a JSON blob) so "all books by author", author filters, and Wrapped most-read
  authors are real queries and name variants can be deduped. Optional denormalized display string
  cached on the book for cheap rendering.
- Migration + backfill: every existing book's `author` -> one authors row (dedup by normalized
  name) + one book_authors row at position 0, role 'author'. Preserve original; re-run safe; keep
  the old column readable during transition, then switch reads to the join.
- Recreate the merge_books RPC + match.ts to reconcile author LISTS (match on primary-author
  overlap; merge unions contributors, dedupes, preserves order; user edits win).
- Enrichment (D1) maps multi-author/contributor arrays (Google authors[], OL authors, Hardcover
  contributions[] incl. translators/narrators) into the contributor list with roles.
- UI: Add/Edit supports add / remove / reorder (drag) / set role, with autocomplete against existing
  authors (dedupe). Display "by A, B & C" (roles like translator shown subtly); author chips filter
  the library; Stats + Wrapped count each author.
- NOTE: narrator is really audiobook-edition-scoped — keep it as a role for now, flag edition-scoping
  as a later refinement.
Tests: name normalize/dedup; "by ..." formatting; multi-author matcher; merge author reconciliation;
backfill idempotency.
Acceptance: a co-authored book (and an author+translator) stores all contributors with role+order;
display/filter/stats correct; enrichment fills multiple; merges reconcile; single-author data intact.

## D3 — Reading orders (complex / interconnected series sequencing)
A new concept distinct from series and collections: a user-defined, named, ORDERED sequence that can
span multiple series + standalones — e.g. two interconnected series read in a specific interleaved
order.
- Model: reading_orders(id, user_id, name, description) + reading_order_items(id, reading_order_id,
  position, book_id?, series_id?, note?). An item is a BOOK (core) or a SERIES reference
  (convenience: expands to that series' books in series order at that slot). Ordered by `position`;
  use a fractional/insertable scheme (or integer positions re-normalized on reorder) so drag-insert
  between two items never collides. Per-item `note` (e.g. "read to ch.20 before B2").
- A book keeps its intrinsic series + position; a reading order is an OVERLAY that interleaves — a
  book may appear in its series AND in one or more reading orders at different positions.
- v1 = user input (cross-series read order is fan/community knowledge, not in the APIs). Leave a seam
  to import a pasted/numbered list later.
- UI: a Reading Order editor (create, add books/series, drag to sequence, insert between, notes); a
  linear "what's next in this order" that respects read status; surface "Part of reading order:
  [name]" on book detail + series view; progress along the order.
- RLS: owner-scoped, with a test (like merge_prefs).
Tests: ordering/insert/reorder stability (no collisions), spanning two series + a standalone,
next-to-read respecting read status, series-item expansion, no dupes.
Acceptance: user builds an order interleaving two connected series + a standalone in a custom
sequence; reorders by drag cleanly; "next" respects reads; a book sits in its series AND the order;
persists per user with RLS.

────────────────────────────────────────────────────────
## Checkpoints (report commit + acceptance at each)
- D0: opening hardening beat (Reverie->Tryst skin rename, cron golden test, "Not now" cooldown).
- D1: enrichment aggregator (adapters + pure merge engine + global cache + sync/async + genre fill).
- D2: multiple authors/contributors (model + migration + RPC/matcher + UI + enrichment mapping).
- D3: reading orders (model + editor + surfacing + progress).

## Guardrails
Tokens-only; AA preserved; RLS on every new table — enrichment_cache = service-role only;
authors/book_authors + reading_orders/items = owner-scoped — each with a test; migrate + backfill,
never drop the seed; user-authored fields always win in any merge; stay within docs/SCALING.md cost
ceilings (global caches keyed by work, not per-user).
