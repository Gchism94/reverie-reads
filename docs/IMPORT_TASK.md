# Import enhancement — real-export ingest — Claude Code task

# Implements docs/IMPORT_MAPPING.md (decisions locked 2026-06-27)

Paste into Claude Code. Extends the Phase 5 CSV import to robustly ingest real library exports,
validated against Library_App_list.xlsx (490 rows) and Chism_Books CSV (1073 rows). Pairs with Phase 7
H1: new users start EMPTY, so import is the populate path. Builds on D1 normalization, D2 contributors,
and D3 reading orders (all landed). Working agreement: pure logic unit-tested (use the two real exports
as fixtures); typecheck/lint/build/axe green; RLS preserved; idempotent re-import via the existing
match/merge path; user-authored fields always win; never pollute the dev-only seed; stage source only;
docs/design untouched; report commit + acceptance per checkpoint.

## I1 — Genre/tag normalization engine (pure, in @reverie/core)

- Canonical CORE set (= the 9 skins): Romance, Fantasy, Sci-Fi, Horror, Mystery, Literary, Cozy,
  Nonfiction, YA. Alias/typo map per IMPORT_MAPPING.md B (romace->Romance; Fantays/Fantast->Fantasy;
  scifi/sci-fi->Sci-Fi; Thriller->Mystery; Fiction/Poetry/Historical Fiction/Short Stories->Literary
  with a descriptive tag; ya->YA). Case-insensitive; split on ; / , and the stray ":".
- Output: primary `genre` = first core token (skin/adaptive signal); all cores -> genres[]; every
  non-core token -> tags. Drop "standalone" from the genre column.
- INTENSITY: "spicy" (+ spice-ish tokens) -> the intensity signal AND kept as a tag.
- Tags: lowercase, fix the "dark: spicy" colon, split, trim, dedupe.
- Tests: real vocab from both files; assert the confirmed tally (Library -> ~Romance 484 / Fantasy 5;
  Chism -> Fantasy/Horror/Romance/Nonfiction/Sci-Fi/Literary/Mystery), blanks stay null, non-core ->
  tags, spicy -> intensity.

## I2 — Column mapping + ingest (both shapes + generic)

- Configurable column map so varied exports work, with built-in profiles for the two real shapes:
  Library (title; author first/last; series; series order; Series #; global order; series type; genre;
  tags; release date) and Chism (Title; Author First/Last; Series; Genre; Tags; GC Read; TC Read;
  Duplicate; IGNORE Completed/Standalones + Unnamed:7/11/12).
- Map: title; author first+last -> one contributor (role author) via D2 (co-authors when present);
  release date -> pub date; genre/tags via I1; series + series order -> series + intrinsic
  series_position (fractional ok, e.g. 0.5).
- READ STATUS (Chism): GC Read X -> read, IP -> currently reading; IGNORE TC.
- DEDUPE: route the "Duplicate" flag + normal intake through match.ts / the merge path (auto strong,
  review fuzzy). Re-import is idempotent (no duplicate explosion).
- Tests: both files import to the right counts; contributors/series/pub date/read-status correct;
  re-import is a no-op; ignored columns dropped.

## I3 — Connected series -> D3 reading orders

- Detect connected universes: rows with `global order` set (and/or series type = "interconnected
  standalone" / a shared Series # family). Group each universe into ONE reading_order named
  "<universe> -- reading order".
- Add each book as a reading_order_item at position = `global order`; keep each book's own series +
  series_position intact (OVERLAY, not replacement). `Series #` -> series-order-within-universe metadata.
- The sequence must be the EXACT human order (e.g. Royal Elite Epilogues at global 11, AFTER the
  Kingdom Duet 8-10) — never recomputed from series position.
- Tests: the Royal Elite universe imports as one reading order with the exact global-order sequence
  incl. the epilogue placement; books still belong to their own series; owner-scoped RLS.

## Checkpoints

- I1 normalization engine · I2 mapping + ingest + dedupe + read-status · I3 connected-series reading
  orders.

## Guardrails

Pure logic unit-tested with the real exports as fixtures; user-authored fields always win; idempotent
re-import via the existing merge path; never pollute the dev-only seed; RLS preserved; gate green;
stage source only; docs/design untouched.
