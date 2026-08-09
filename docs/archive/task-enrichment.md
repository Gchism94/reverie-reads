# coding agent task — Enrichment + import-pipeline completion (E1-E3)

Completes the import pipeline so covers/metadata auto-populate, the two open import flags are closed, and
the onboarding/import review screen + Cover Studio have correct, display-ready data. Extends D1
(enrichment aggregator) and H2 (cover caching to Storage/CDN). See docs/reference/COVER_SOURCING_AND_STUDIO.md and
docs/archive/IMPORT_REAL_VALIDATION.md.

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

Carryover from I1/I3 (see docs/archive/IMPORT_REAL_VALIDATION.md). Fixture: data/fixtures/library_connected_series.csv.

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

---

## STATUS — 2026-06-27

- E2 DONE (d676a5b): both import flags closed + ground-truth-validated. detectUniverses stable-sorts by
  globalOrder and preserves every tied book as a repeated position (no collide/drop); locked by
  importRealValidation.test.ts. Multi-genre split + dominant/secondary retained; tally validated.
  RESIDUAL -> fold into E1: secondary sort within a tie should be SERIES ORDER -> TITLE (deterministic,
  export-order-independent); currently keeps input order.
- E1 + E3 NOT STARTED -> the next build pass (resolution engine + review/Cover-Studio read-model).

---

## STATUS — 2026-06-27 (cont.) — E3 seam/read-model DONE

Import<->enrichment seam + review read-model built + tested. Gate: typecheck/lint/build, 198 core + 4 web
(joiner +4). Committed 11 integration source files; desktop-align WIP + docs/design untouched/unstaged.

- Import signals: genreNormalize reports unmappedGenre; importDetectedExport returns ImportItemOutcome[]
  (disposition added/merged, Duplicate flag, unmapped genre).
- Confidence: new books.cover_confidence (migration + BookRow/mappers); bulkComplete records it ONLY when
  the run filled the cover (trusted user/seed covers never mislabeled). Book.coverConfidence.
- Joiner (pure core): buildReviewModelFromImport(outcomes, freshBooks, {readingOrdersBuilt}) -> review
  model. Book authoritative; outcome supplies import-only signals. detected-duplicate = merged row;
  odd-genre flags fresh adds only; no-confidence cover = trusted (never flagged low); cover ALTERNATES
  re-fetched on demand from the cached enrichment record (kept off book rows).
- LEFT FOR UI PASS: the review screen + Cover Studio that render the model; on-demand alternate fetch.

OPEN ITEMS:

- CONFIRM E1 resolution engine: does enrichment do TITLE+AUTHOR search + ISBN self-resolution? (data has
  NO ISBNs -> ISBN-only fills ~0 covers). + confidence tiers + throttle/backoff/resume/idempotent over
  1000+ books. The seam is ready; covers only populate if this engine is in.
- CONFIRM read-model surfaces a MISSING-cover bucket (no cover at all), distinct from low-confidence ->
  the bulk of Cover Studio triage.
- PENDING: secondary-sort-within-tie (series order -> title), E2 residual.

---

## STATUS — 2026-06-27 (cont.) — E1 CONFIRMED IN + dry-run

E1 resolution engine is implemented (not just the contract):

- title+author search (searchGoogle/searchOpenLibrary/searchHardcover) -> gatherCandidates in priority
  Hardcover->Google->OpenLibrary -> selectBestMatch (high/med/low/none + wrong-book safety; pure core,
  Edge parity in resolve.ts) -> selfIsbn13 self-resolution (index.ts:289) -> re-fetch by ISBN for the
  canonical edition + best cover -> cache image to Storage/CDN.
- 1000-book run: bulkComplete passes title+author; THROTTLE_MS=220; MAX_PER_RUN=400; resumable +
  negative-cached (enriched_at recheck); pauses-without-stamping on 429; Edge backs off on 5xx; global
  cache by isbn/title -> idempotent.
  DRY-RUN (real Library file, OL-ONLY -- Google 429 on shared IP, Hardcover OFF/no token), 30/490 sample:
  cover 8/30 (27%) | ISBN-13 14/30 (47%) | confidence high 15 / med 0 / low 0 / none 15.
  Conservative floor: NOT ~0 (title-only works on no-ISBN data). The 47% ISBN vs 27% cover gap = self-
  resolution working (production fetches cover by resolved ISBN from Google/Hardcover). Wrong-book safety
  held (0 low/0 med). UNTESTED LIVE: Google + Hardcover SEARCH adapters (parse/parity-verified only).
  CONFIRMS: needsLook.missingCover (no cover) is a SEPARATE bucket from needsLook.lowConfidenceCover;
  coverTriage = both. E2 secondary-sort-within-tie DONE (9eea651): ties sort globalOrder->seriesNumber->
  seriesOrder->title, order-independence tested.
  PUSHED: f32b065..7c68cae (8 commits: code + docs/design record).

## NEXT GATE (before triage UI) — live full-run with Hardcover + Google ON

- OWNER: set HARDCOVER_TOKEN (free; runbook) + Google key/quota; deploy enrich; run bulkComplete over the
  real file; read true coverage + confidence split from books.cover_confidence.
- WHY: proves the two live adapters (Google + Hardcover search) AND gives the REAL tail size to design
  the Cover Studio against (don't build triage UI blind to whether the tail is ~80 or ~400).
- TOOLING (accepted): a repeatable hit-rate harness (source roster + sample size; OL vs +Google vs
  +Hardcover) to right-size the tail before the UI.

## REPO HYGIENE

gitignore \*.dc.html going forward (design re-exports are multi-MB + frequent -> history bloat); keep .md
handoffs versioned (they carry the framing + structural spec; bundles regenerable from the Design URLs).
Existing ~7.3M not worth a history rewrite.

---

## GO — live hit-rate run (HARDCOVER_TOKEN set 2026-06-27)

The gate before the triage UI. Run on Code's side (+ owner deploy):

1. Confirm GOOGLE_BOOKS_KEY also set as an Edge secret (run must hit all 3 sources, not just
   Hardcover+OL). Deploy enrich.
2. Build the hit-rate harness (Code's offer) if not yet built; run with the full roster
   (Hardcover+Google+OpenLibrary) on a representative SAMPLE (~50-100 rows) of BOTH real files,
   weighted toward CHISM (1073, indie-heavier = real worst case) -- not just Library (490, cleaner).
   Sample, NOT full run: ~1500 books exceeds Google's ~1000/day free quota.
3. Report: cover hit-rate, ISBN hit-rate, confidence split (high/med/low/none), tail size
   (missingCover + lowConfidence counts), + a few low-confidence cases to eyeball for wrong-book.
4. Full population of ~1500+ books runs progressively/resumably (MAX_PER_RUN=400) during the real
   import -- spans multiple days under the free Google quota; expected, not a blocker.
   GATE OUTPUT -> scopes the Cover Studio (true tail size) + greenlights the onboarding/import triage UI.
