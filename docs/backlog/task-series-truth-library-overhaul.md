# Backlog task: series truth and Library experience overhaul

Priority: **P1 after CI/CD simplification**.

## Problem statement

Books appear to acquire series membership too readily, even when the source does not justify it,
and the current Library representation does not yet feel like an intentional part of Reverie Reads.
Prior consolidation and integrity work fixed real mechanics, but it did not prove that intake,
authority, defaults, and presentation are correct as a whole.

## Phase 1 — truth audit before implementation

- Trace every writer and inference path for `books.series`, `books.position`, `books.series_count`,
  `series`, `series_entries`, aliases/rulings, import mapping, enrichment, corpus matching, and
  restore/merge.
- Measure how many books become standalone, sourced-series, reader-confirmed-series,
  low-confidence/contradictory, or structurally unlinked under the proposed rules.
- Inspect the private owner data only through an owner-run, read-only audit; commit no title-level
  results.
- Revalidate the archived consolidation and integrity briefs against current `main`; preserve their
  decisions only where the current model still supports them.

## Phase 2 — authority and admission rules

- Default to **no series membership** unless a trusted source or the reader positively establishes
  it. Absence is not an error to fill.
- Record source, confidence, and reader override provenance. Never silently overwrite a
  reader-edited membership or order.
- Decide one canonical authority between legacy book strings and structured series records; any
  compatibility copy must be derived and transactionally synchronized.
- Handle multiple-series membership, companion/spinoff relationships, omnibuses, novellas, decimal
  order, unknown order, and editions without pretending one total order answers every case.
- Bring conflicting or low-confidence claims to a review queue rather than auto-assigning them.

## Phase 3 — Library and detail experience

Research the real authenticated app before designing. Reconsider cards, rails, grouping, progress,
gaps, owner identity in household scope, empty/unknown states, and series editing as one coherent
experience across desktop/mobile and all skins. Aesthetics must follow the corrected information
model; do not polish false certainty.

## Completion gate

Known-standalone books remain standalone through add/import/enrich/restore; sourced and
reader-confirmed memberships remain stable and traceable; conflicting claims never silently win;
the old and structured models cannot diverge; and the rendered series experience is verified in
real browser flows with representative standalone, complete, partial, ghost, multi-owner, and
ambiguous fixtures.
