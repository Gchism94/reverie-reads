# Phase 5 — code task (Tracks A & B, in parallel)

Two independent tracks; build them simultaneously, each step-at-a-time with a check, each
as an explicitly-scoped commit (no `git add -A`). Full spec: `PHASE5_ENHANCEMENTS.md`.
Desktop/PWA (P3) is a separate Design-then-build workstream — not in this task.

## Paste-to-start prompt

> Read `docs/archive/PHASE5_ENHANCEMENTS.md` and `docs/archive/task-phase5-code.md`. Build Track A
> (auto import + enrichment + merge) and Track B (find local indie bookstore) in parallel,
> one step at a time, scoped commits, stopping at each checkpoint for review. Auto-merge
> only strong matches (ISBN / exact title+author); fuzzy → review. Never clobber
> user-authored fields. Reuse the atomic `merge_books` RPC. Don't touch P3 (desktop/PWA).

---

## Track A — Auto import + enrichment + merge

**A1 — Enrichment completes the record.** Extend the enrichment Edge Function beyond
covers to a full normalized record (series + position, pub date + precision, page count,
ISBN-10/13, language, genres, description, best cover). Fallback Google Books → Open
Library → Hardcover; cache (metadata cache keyed by ISBN/work); throttle + backoff.

- _Check:_ add-by-ISBN returns a full record; 2nd call hits cache; missing-cover degrades
  to manual without failing.

**A2 — Match + merge at every intake path.** Add duplicate detection to manual add,
barcode, ISBN/title search, bulk paste, CSV import, and enrichment results. Match keys:
ISBN exact → normalized title+author → title+series+position → fuzzy (soft → review).
Pick the **most complete** record as primary (reuse `richness()`), fold the other in via
the atomic `merge_books` RPC; multi-value fields union, single-value fill-blanks, and
**user-authored fields (`myRating`, notes, curated tropes, `owned`) always win**.

- _Check:_ a CSV overlapping the library auto-merges strong matches, routes a fuzzy
  near-match to review, loses no data, preserves user fields; bulk merge stays atomic
  per pair and re-runnable.

**A3 — Auto vs review UX.** Settings default "auto-merge duplicates" = on for **strong**
matches; review queue with side-by-side preview (kept / added) + Merge · Keep both ·
Always; single-add inline prompt; post-import summary ("merged N, added M").

- _Check:_ both auto and review paths tested; fuzzy always lands in review.

**A4 — Bulk "complete missing covers/info."** A library action that enriches records with
missing fields only, throttled + cached, with progress.

- _Check:_ runs across the library, fills blanks without clobbering, respects rate limits.

---

## Track B — Find your local indie bookstore

**B1 — Location.** Browser geolocation (consented) + manual ZIP/city fallback; ephemeral,
not persisted server-side.

- _Check:_ both inputs resolve to a usable location; declining geolocation falls back to
  manual cleanly.

**B2 — Nearby discovery.** v1 source = OpenStreetMap Overpass `shop=books` near location →
name/address/hours/phone/website/distance; bias to independents via a maintained
chain-exclusion list; render **map + list** in both themes.

- _Check:_ a test location returns nearby stores; chains excluded; map + list render in
  Nocturne and Magnolia Dawn; non-US / no-results shows a graceful empty state.

**B3 — Buy / support.** Bookshop.org affiliate links for print/ebook (choose-a-store
model); Libro.fm for audiobooks; format-aware "Buy at an indie" on book detail; user can
set a **default local store** that persists and shows on book pages.

- _Check:_ links open the correct affiliate URL per format; default store persists across
  sessions/devices.

**B4 — Honesty + edges.** Clearly label "discover + support, not live inventory"; handle
non-US and no-results; degrade to a plain Bookshop.org link when no nearby data.

- _Check:_ messaging is clear; no path implies live stock.

> **Owner actions before B ships:** Bookshop.org affiliate ID, Libro.fm affiliate, and
> (if upgrading B2 to Google Places) a Places API key + billing. Verify current terms.

---

## Shared definition of done

- `pnpm lint`, `typecheck`, `test`, `build` green; the both-themes axe smoke extended to
  the new screens (review queue, indie-bookstore view).
- New fields round-trip through backup/export.
- Each deferral or owner-action dependency listed explicitly for sign-off.

---

## Checkpoint-1 review refinements (apply in A2 / B2)

### A2

- **Surviving row on import = the EXISTING library record.** Keep its `id`, list/club
  memberships, reads, and calendar attribution; apply the _most-complete field values_
  into it (user-authored fields still win). Only promote a different primary when merging
  **two pre-existing** library records (the dedupe-your-library case). This avoids
  migrating memberships on every import. ("Most complete as starting point" = field
  values, not necessarily which row survives.)
- **Normalize ISBN-10 ↔ ISBN-13** so the same book matches regardless of which form each
  record stored.
- **Enrich the incoming record before matching** so ISBN-based strong matching can fire —
  but match only on real shared keys; never let enrichment fabricate a match.
- **Idempotency:** re-running the same CSV/import is a no-op (matches → merge into
  self / skip; no new duplicates). Add a test.
- **Fuzzy = same author + title equal ignoring subtitle/punctuation/case.** Conservative;
  always routes to review, never auto-merges.

### B2

- **Overpass:** query `shop=books` as node AND way/relation; use center coords for
  ways/areas; sort by distance.
- **Themed map tiles:** raw OSM tiles are single-style and not meant for heavy embedding —
  pick a tile provider with terms and a **dark style for Nocturne + light style for
  Magnolia Dawn**; flag the key as an owner-action.
- **Production hardening (same as Nominatim):** proxy Overpass through an Edge Function
  with a contact User-Agent + caching/rate-limit. OSM often lacks hours/phone → degrade
  gracefully.
- **Chain-exclusion is heuristic** — keep the list maintainable; note that some indies may
  be missed and some chains may slip through.

---

## Checkpoint-2 review refinements (apply in A3 / A4 / B3 / B4)

### A3 — auto-merge toggle + review queue

- **Remember "Keep both" / dismissed decisions.** Persist a "not a duplicate" verdict for
  a pair so it isn't re-flagged on every future import — otherwise the queue nags forever.
- **Batch-friendly queue:** a large import yields many candidates — support select-all →
  merge / keep-both / dismiss, not one-at-a-time only.
- **Clarify "Always merge":** decide and label whether it means "merge this pair, don't
  ask again" vs. flipping the **global** auto-merge setting; keep the Settings toggle
  separate and explicit.
- **Per-candidate, show what's KEPT vs what's newly ADDED** (highlight incoming fields
  being folded in); the existing row is clearly the survivor.
- **Post-import summary:** "merged N · added M new · K to review," linking into the queue.

### A4 — bulk "complete missing covers/info"

- **Throttle + respect daily caps** (Google ~1000/day, OL 100/IP/5min): queue with
  backoff; a 1,000-book run must not blow limits.
- **Resumable:** persist progress; on rerun skip already-complete books and **cache
  negative results** (no cover found) so failures aren't re-hammered.
- **Fill-only-missing** (same no-clobber guardrail); show progress + a final summary.

### B3 — Bookshop.org / Libro.fm buy links

- **Affiliate IDs via config/env;** degrade to plain links if unset so the feature works
  before sign-ups land.
- **Format routing:** print/ebook → Bookshop.org (link by ISBN-13); audiobook → Libro.fm.
  Verify current URL formats at build.
- **RESOLVED — attribution is a config-driven strategy (scaffold for growth):** build the
  buy-link layer as one module with `attributionMode: 'store' | 'affiliate'` + affiliate
  IDs in config. **Ship `store`** (route to the user's chosen local store; store keeps full
  profit; app earns nothing). Keep affiliate IDs present-but-unused so switching to
  `affiliate` later (to offset hosting/API costs as users grow) is a config change + an
  honest disclosure line, not a refactor. See `docs/reference/SCALING.md`.
- Keep copy honest: Bookshop/Libro.fm are the store's **online** storefront — don't imply
  physical in-store stock.

### B4 — honesty / edges

- Non-US coverage varies (Bookshop has some non-US storefronts) — degrade gracefully,
  never dead-end. Buy-link copy stays "support this indie online," consistent with the
  no-live-inventory banner.

---

## PHASE 5 — COMPLETE (all four tracks landed; gate green) · 2026-06-25

Commits: A3 06cc7c5 (auto-merge toggle + persisted-verdict review queue) · A4 f9dc1f6 (bulk
fill-missing enrichment) · B3 e5a605b (indie buy links, config-driven attribution) · B4 f066679
(honest degraded states).
Gate: core 51 tests, web typecheck + lint + build, both-themes axe smoke — all green.
New migrations (applied locally): merge_prefs, enriched_at, default_store. Source-only staged;
docs/ untouched.

Acceptance vs Checkpoint-2 refinements — all met:

- A3: persisted per-pair verdicts (keep-separate / always-merge) so dismissed/keep-both don't
  re-flag on re-import; "always merge" per-pair, distinct from the global auto_merge_duplicates
  toggle; batch review (select-all -> Merge / Keep both / Dismiss); pure tested decideIntake
  matrix + importKey; AddForm inline prompt when toggle off.
- A4: fill-only-missing; throttled ~220ms; resumable + negative-cached via books.enriched_at
  (30-day skip; dead-ends not re-hammered); live progress + Stop + summary.
- B3: one module, attributionMode store|affiliate; ships store mode (store full profit, app earns
  nothing); affiliate IDs present-but-unused -> flip = config + disclosure; format routing
  Bookshop.org print/ebook by ISBN-13, Libro.fm audio; persisted cross-device default store.
  Libro.fm model verified (purchases fund buyer's chosen indie; Awin = separate affiliate mode).
- B4: no-results / non-US / Overpass-error / no-location all degrade to "buy from indies online"
  (Bookshop + Libro.fm); never a dead-end; copy consistent with the no-live-inventory banner.

DECISION ACCEPTED (OSM default store -> by-ISBN Bookshop links): OSM persists id/name/website
only; no Bookshop store ID in OSM, so store-mode Bookshop links are plain by-ISBN. Bookshop's own
model still funds indies. Per-store Bookshop ID wiring (ABA/Bookshop directory cross-ref) stays a
documented LATER upgrade — not a ship blocker.

OWNER ACTIONS (non-blocking; only to switch to affiliate mode): Bookshop.org affiliate ID +
Libro.fm/Awin affiliate ID, then set VITE_BUY_ATTRIBUTION_MODE=affiliate.

FOLLOW-UPS to confirm (carry into Phase 6 hardening):

1. RLS — confirm per-user policies on the new merge_verdicts and default_store migrations (report
   lists migrations, not policies). New tables without RLS leak or deny under the app's model.
2. A4 quota — confirm the bulk fill respects a per-run/day ceiling (Google Books ~1000/day per
   SCALING.md; Open Library per-IP courtesy) and degrades gracefully on 429 (clean resumable stop).
3. Partial enrichment — a book filling some but not all missing fields is stamped enriched_at and
   won't retry still-missing fields for 30 days. Confirm intended (vs shorter retry when a cover/
   series is still absent).
