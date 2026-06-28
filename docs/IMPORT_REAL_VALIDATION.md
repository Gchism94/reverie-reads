# Import — real Library file validation (ground truth)

Derived from the real Library_App_list.xlsx (490 rows), which is NOT in coding agent's repo. I1-I3 were
validated against the real Chism vocab + a SIMPLIFIED Royal Elite fixture. These are the two structures
in the real Library file the fixtures did not cover, with expected results to validate against.

## Ground truth (490 rows)
- DOMINANT-genre tally: Romance 484 / Fantasy 5 / 1 unresolved.
- The 1 unresolved: "The Way We Rot" (Black) has genre = "standalone" (a series-type leaked into the
  genre column) -> should resolve to NULL/enrichment, NOT a genre.
- 128 rows carry TWO core genres: "romance; fantasy" x123 (dominant romance) + "fantasy; romance" x5
  (dominant fantasy) = romantasy -> BOTH genres should be retained.
- 13 rows: genre "romace" (typo) -> romance.
- 110 connected-universe rows (have global order); 14 authors; 47 standalones (no series).

## FLAG 1 — multi-value genre (I1)
Real genre fields are ";"-delimited and dual-core; I1 was grounded on the Chism vocab (single-value).
Confirm I1 splits on ";"/"," , maps the dominant (first) token -> primary core genre, and RETAINS the
secondary core genre (romantasy keeps both). Expected dominant tally above. If "romance; fantasy" is
treated as one unmapped token, the tally breaks.

## FLAG 2 — tied (non-unique) global-order values (I3)
The Royal Elite fixture was a clean, unique, monotonic sequence. The REAL connected data has NON-UNIQUE
global order. Rina Kent's universe: 41 books, 11 series, global order 1-23 -- but positions 1 THROUGH 9
each have THREE books tied (3 at go1, 3 at go2, ... 3 at go9); 10-23 are singletons. Confirm I3 handles
repeated global-order values deliberately (concurrent tiers in one order, or separate universes) rather
than colliding / last-write-wins / dropping. detectUniverses must NOT assume global order is unique.

## Fixture (permanent regression test)
data/fixtures/library_connected_series.csv (110 rows) = all real connected-universe rows, incl. the
full 41-book Rina Kent case with the 3-way ties. Use it to make Flag 2 a standing test.

## Action
Drop the real Library_App_list.xlsx into coding agent's data/raw/ (gitignored) and run I1-I3:
1. Genre tally = Romance 484 / Fantasy 5 / 1 -> enrichment; romantasy (128) keeps both genres.
2. Rina Kent's universe materializes sensibly WITH the ties (not collapsed to one book per position).
