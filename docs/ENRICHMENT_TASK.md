# coding agent task — Enrichment + import-pipeline completion (E1-E3)

Completes the import pipeline so covers/metadata auto-populate, the two open import flags are closed, and
the onboarding/import review screen + Cover Studio have correct, display-ready data. Extends D1
(enrichment aggregator) and H2 (cover caching to Storage/CDN). See docs/COVER_SOURCING_AND_STUDIO.md and
docs/IMPORT_REAL_VALIDATION.md.

ARCHITECTURE NOTE: import != enrichment. Import adds books fast and returns; ENRICHMENT runs
asynchronously in the background (Edge, service-role, secrets), resumable, progressively updating rows as
covers/metadata resolve. The UI must handle progressive cover population (skeleton -> cover appears), not
block on it. Pure matching/selection/confidence logic lives in @reverie/core (unit-tested); network calls
live only in adapters/Edge.

---

## E1 — Enrichment resolution engine (title+author -> ISBN -> cover + confidence)
The real data has NO ISBNs and NO covers, only title+author(+series). Resolve the rest.

- Adapters support a TITLE+AUTHOR SEARCH path (not ISBN-only). Source priority for this catalog
  (romance/romantasy/fantasy/horror, indie-heavy): Hardcover -> Google Books -> Open Library.
  ISBNdb stays config-gated OFF.
- Resolution flow: normalize title+author (trim whitespace -- data has "Celia " etc., casefold,
  strip diacritics; use series/author to disambiguate) -> query sources in priority order -> pick best
  match -> SELF-RESOLVE ISBN-13 -> fetch best cover (prefer resolved ISBN; prefer larger image) ->
  cache cover to Storage/CDN (H2) -> merge other metadata via D1 field-precedence.
- CONFIDENCE SCORING per match: high (exact normalized title + author), medium (close/normalized), low
  (fuzzy / multiple candidates / ambiguous), none (no match). Store score + source + the QUERY used +
  the ALTERNATE candidates (the Cover Studio uses alternates as edition choices).
- WRONG-BOOK SAFETY: when multiple plausible matches or a common title, mark LOW-confidence rather than
  guessing. Never overwrite a user-authored field -- enrichment fills BLANKS only (D1 rule).
- Caching keyed by work (D1 enrichment_cache, service-role-only); never re-fetch cached.
- QUOTA + SCALE: Google Books ~1000/day -> throttle + backoff + rely on the global cache; batch politely;
  RESUMABLE and IDEMPOTENT (re-run picks up where it left off, no dupes) -- this runs over 1000+ books.

ACCEPTANCE E1
- title+author -> ISBN + cover + confidence resolved across Hardcover/Google Books/Open Library, cached.
- user-authored fields never overwritten; only blanks filled.
- confidence tiers assigned; alternates retained.
- pure matching/selection/confidence in core + unit tests (ambiguous + duplicate-title + author-
  whitespace cases).
- background, throttled, resumable, idempotent over a 1000+ book run.

---

## E2 — Close the two open import flags (real-data validation)
Carryover from I1/I3 (see docs/IMPORT_REAL_VALIDATION.md). Fixture: data/fixtures/library_connected_series.csv.

FLAG 1 (multi-value genre, I1): genre is ";"/","-delimited and dual-core. Split -> dominant (FIRST token)
= primary core genre; RETAIN the secondary core genre (romantasy keeps both). romace -> romance.
"standalone"-in-genre -> NULL/enrichment. Applies to Library AND Chism ("Romance; fantasy").
FLAG 2 (tied global order, I3): global order is NON-UNIQUE (Rina Kent: 3-way ties at positions 1-9).
detectUniverses must handle ties DELIBERATELY -- preserve all tied books at that position as a stable
"tier" within the one reading order (secondary sort by series order then title); NEVER collide /
last-write-wins / drop. Document the chosen tie semantics in the doc.

ACCEPTANCE E2
- multi-genre: dominant primary + retained secondary; real Library dominant tally = Romance 484 /
  Fantasy 5 / 1 -> enrichment; the 128 romantasy rows keep both genres. unit + fixture tests.
- tied order: Rina Kent's 41-book universe materializes with ties preserved (no collisions/drops);
  committed fixture is a passing regression test; Royal Elite epilogue@11 still correct (no regression).

---

## E3 — Surface results for the review screen + Cover Studio (data contract)
Produce the structured "what happened / what needs a look" read-model the onboarding/import review and the
Cover Studio consume. (UI is built later; this task provides the DATA.)

- SUMMARY: total / added / merged-deduped / in-series / standalones / reading-orders-built; genre breakdown.
- "NEEDS A LOOK", bucketed: (a) missing cover, (b) low-confidence cover/match, (c) unmapped/odd genre,
  (d) likely duplicates (Duplicate flag + detected). Each item carries title/author, reason, and (for
  covers) the ALTERNATE candidates from E1 for the picker.
- Cover Studio triage queue = the missing + low-confidence cover buckets (the Studio later adds upload /
  photo / skin-themed placeholder on top of these).

ACCEPTANCE E3
- after import+enrichment, summary + bucketed needs-a-look payload available, each item with the fields
  the review + Studio need (incl. cover alternates). pure shape + unit test; consumable by the review screen.

---

## GUARDRAILS (all checkpoints)
- pure logic in @reverie/core + unit tests; network only in adapters/Edge.
- user-authored fields always win; enrichment fills blanks only; caches keyed by work, service-role-only;
  covers to Storage/CDN (H2).
- RLS preserved; no secrets client-side; keys are Edge secrets (GOOGLE_BOOKS_KEY, HARDCOVER_TOKEN;
  ISBNDB_KEY config-gated off).
- quota-safe: throttle/backoff/cache; background, resumable, idempotent.
- prefer a LOW-confidence flag over a confident mismatch.
- dev seed untouched; gate green (typecheck/lint/unit/build/axe) each checkpoint; stage source only;
  docs/design untouched.

## FIXTURES / TESTS
- data/fixtures/library_connected_series.csv (Flag 2, committed).
- add small fixtures: multi-genre rows (Flag 1); enrichment matching (exact / fuzzy / ambiguous /
  author-whitespace); confidence tiers.
- full-tally validation against the real files in data/raw/ (gitignored).

## OUT OF SCOPE (later)
- The Cover Studio UI (book-detail cover editor, batch triage, skin-themed typographic placeholder
  generation) -- separate design + build; this task only emits the data it consumes.
