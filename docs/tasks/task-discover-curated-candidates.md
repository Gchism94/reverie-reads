# Task: feat/discover-curated-candidates

Branch: `feat/discover-curated-candidates` off `main`.
Read first: `docs/audits/discover-recency.md` (e0e9dc4), and
`docs/research/discover-2020plus-titles.md` (place this from the research
report before starting — it is not yet in the repo).

## What the audit established

Discover has no corpus of its own — every shelf is a live Google Books
`subject:` query. The ranking is recency-first and is exonerated: surfaced-2020+
exceeds pool-2020+ in every category, meaning the ranking amplifies what little
recent stock exists rather than suppressing it. The problem is candidate
acquisition, and it has a specific, structural cause: **every checked 2023–2025
trade title carries the bare Google category `['Fiction']`**, so it cannot match
`subject:romance`, `subject:horror`, `subject:mystery`, etc. at any ranking
weight — regardless of publisher size. This is not the indie gap Phase 0 flagged;
it is worse, because flagship trad frontlist is equally invisible.

Measured 2020+ share of the live query pool, by category:

| Category        | Pool % 2020+ |
| --------------- | -----------: |
| Romance         |         0.0% |
| Fantasy         |         0.0% |
| Science fiction |         0.0% |
| Mystery         |         0.0% |
| Horror          |        11.8% |
| Literary        |        11.8% |
| Nonfiction      |        15.0% |
| Young adult     |        42.1% |
| Cozy            |        89.5% |

The two healthy categories (Cozy, YA) carry real Google subject strings
(`cozy mysteries`, `Young Adult Fiction`) — proof of the mechanism, not a
coincidence.

## Decision, already made

**Hybrid (option c).** Curated candidate injection for the categories the audit
proved are starved: **Romance, Fantasy, Science fiction, Mystery.** Horror,
Literary, and Nonfiction stay on live query — their numbers are bad but not
catastrophic, and do not yet justify the same investment. Cozy and Young adult
are untouched; they work.

This is a **blend**, not a replacement. Live `subject:` query stays the primary
mechanism everywhere. Curated titles are additional candidates injected into
the pool for the four starved categories, ranked by the same taste/recency
logic as everything else — not pinned, not exempt from ranking, not a separate
rail.

## Phase 1 — resolve the research list to real records. Report before writing.

The research report (`docs/research/discover-2020plus-titles.md`) has ~78
titles with author, year, subgenre, and bucket (popular/cult/indie) — no ISBNs,
no bibliographic data. Filter to the four in-scope categories (Romance, Fantasy,
Science fiction, Mystery — note Cozy entries in the list are out of scope per
the decision above).

1. Resolve each title to a real record via the existing sourcing stack (Open
   Library, Wikidata, Hardcover per DATA_SOURCES.md) — ISBN, cover, subject
   headings, whatever the pipeline already knows how to fetch.
2. Report resolution failures explicitly, per title. The research report
   already flagged likely ASIN-only/KU-heavy candidates (Bonds of Hercules,
   Outlier, Metal Slinger) — confirm or overturn, and report the true failure
   rate across the full filtered list, not just the flagged ones.
3. The Wilderness (Literary — out of scope anyway) was flagged
   author-unconfirmed in the research; irrelevant here since Literary isn't in
   scope, but if any IN-SCOPE title has a similar identification problem,
   report it and drop it rather than guessing.
4. State the final resolved count per category. If a category resolves
   thinly (say, fewer than 8-10 usable titles), report that now — a starved
   category injected with 3 curated titles is barely better than the status
   quo, and I would rather know before Phase 2 builds around an undersized set.

## Phase 2 — injection mechanism

1. Store resolved curated candidates — new table or reuse existing corpus
   storage, your call, but report the schema decision and why. They need at
   minimum: category tag(s), the bibliographic fields the ranking already
   reads for live-query candidates, and a provenance marker (curated vs.
   live-query) for debugging and for item 4 below.
2. Blend curated candidates into the existing candidate pool for the four
   in-scope categories, before ranking runs — same ranking function, same
   taste/recency logic, no special-casing in the scorer itself. If the ranker
   needs to read a new field to place these correctly (e.g. publication year,
   which the audit found live-query items DO carry but corpus_seed.json does
   NOT), report that gap and resolve it for curated candidates specifically.
3. Provenance must be visible somewhere debuggable (a log line, a dev-only
   badge, whatever is cheap) — not user-facing, but Phase 3's freshness
   problem needs to be able to tell curated from live candidates later.
4. Report interaction with the pagination fix from fix/discover-pagination
   (should be merged first, or merge order noted if not) — curated injection
   changes pool composition in exactly the categories that fix also touches.

## Phase 3 — this is a decision, not a build. Report and stop; do not implement.

A one-time 78-title injection goes stale. Report options for what happens next,
with a recommendation:

- (a) Static, re-curated by hand periodically (a recurring "refresh the list"
  task, cadence TBD).
- (b) A standing pipeline — this overlaps materially with the corpus-freshness
  premium feature already scoped in docs/decisions/decision-monetization-
  boundary.md. If you think this phase should not be built until that feature
  is scoped properly, say so explicitly rather than half-building it here.
- (c) Something else you see that I have not named.

State your recommendation and the reasoning. This report becomes the seed for
a follow-up task file, not code in this branch.

## Guards

- A curated-candidate fixture: assert curated titles appear in the ranked
  output for their category alongside live-query results, ranked by the same
  logic (not pinned to top, not segregated).
- Assert the four in-scope categories show measurably improved 2020+ share
  post-injection, using the audit's methodology so the numbers are comparable.
- Assert Horror/Literary/Nonfiction/Cozy/Young adult are UNCHANGED by this
  branch — no accidental scope creep into categories that were deliberately
  left on live query.

## Standing

Investigate and report before building — resolution failures and thin
categories from Phase 1 may change what Phase 2 should even do. Full gate
including `format:check` against a clean worktree of the committed HEAD,
pinned prettier, never `npx`. Full e2e at default workers, all three projects.
No merge without explicit authorization. Phase 3 is report-only — do not
implement a refresh pipeline in this branch.
