# Backlog task: series truth and Library experience overhaul

Priority: **P1 after CI/CD simplification**.

Status: **Phase 2A merged and live on 2026-08-30** (`a40464d`, migration
`20260909010000`, main-domain build `a40464dcba97`). Phase 1's code-path audit is recorded in
`docs/audits/series-truth-phase-1.md`; the aggregate-only owner-run inventory remains staged in
`docs/queries/series-truth-audit.sql`. Phase 2A was deliberately forward-only: typed personal series
provenance, corrected writers, and fail-closed legacy writes. It inferred or rewrote no historical
series value.

**Phase 2B is implemented on `codex/series-truth-phase-2b-membership`, pending review and
rollout.** It makes structured rows authoritative, adds explicit primary/secondary membership,
separates membership/order provenance, removes write-on-read admission, carries the model through
merge and backup/restore, and adds the narrow public effective-Pro host seam. It deliberately
classifies no historical row. The connected-series universe blueprint is recorded in
`docs/tasks/task-series-universes.md`; its Pro implementation is sequenced after Phase 2B and after
the private subscription/entitlement seam exists. Designing the universe now does not authorize a
historical series backfill or move premium implementation into this public repository.

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

### Phase 2A — provenance foundation

- Add a typed current-value claim to personal books: `unknown`, `reader`, `import`, `enrichment`,
  or `corpus`, with optional source/ref/confidence/timestamp detail.
- Leave every pre-migration row `unknown`; `series_user_chosen=false` is not evidence of a source.
- Carry the winning claim through Add, import, enrichment, series editing/building/removal, shared
  adoption, delegated household Add, and client-side duplicate selection.
- At the database boundary, any uninstrumented series rewrite fails closed to `unknown` instead of
  retaining a stale claim about a replaced value.
- This phase does **not** canonicalize old rows, introduce automatic admission/removal, or make the
  scalar string canonical. Those require the private aggregate inventory and the remaining Phase 2
  decisions.

Rollout order is schema first, application second. After merge, the owner deploys migration
`20260909010000` through the guarded, interactive migration command; only after it succeeds should
the matching Vercel build be promoted to production. The application writes `series_claim`, so
reversing that order would make series-bearing Add/edit requests fail against the old schema.

**Rollout complete:** production has the migration and `reveriereads.app/version.json` reports the
matching `a40464dcba97` build.

- Default to **no series membership** unless a trusted source or the reader positively establishes
  it. Absence is not an error to fill.
- Record source, confidence, and reader override provenance. Never silently overwrite a
  reader-edited membership or order.
- Decide one canonical authority between legacy book strings and structured series records; any
  compatibility copy must be derived and transactionally synchronized.
- Handle multiple-series membership, companion/spinoff relationships, omnibuses, novellas, decimal
  order, unknown order, and editions without pretending one total order answers every case.
- Bring conflicting or low-confidence claims to a review queue rather than auto-assigning them.

### Phase 2B — structured membership authority

Implementation status: **complete in the Phase 2B follow-up branch; production pending.** Database
coverage exercises trusted forward admission, unknown-history review, multiple membership,
primary selection/removal, scalar projection repair, merge preservation, owner boundaries, and
anonymous refusal. The app exposes primary/secondary membership coherently on series and book
details, and backup v7 preserves the full structured graph.

- Make `series` + `series_entries` the reliable personal membership authority; a page view must not
  manufacture a structured claim from an unproven compatibility string.
- Decide the explicit primary projection back to `books.series` while legacy consumers remain.
- Support more than one justified series membership without pretending the scalar string can carry
  all of them.
- Keep membership provenance separate from entry-order provenance: learning where a book belongs
  must not claim that its numeric position is trusted.
- Preserve ghosts, tombstones, reader order, and existing consolidation rulings.
- Do not classify or rewrite historical `unknown` claims until the owner-run aggregate inventory is
  reviewed.

This phase is the public data prerequisite for the Pro connected-series universe layer. A universe
will reference structured entries and leave their in-series positions unchanged; it must not build
on the legacy scalar as if Phase 1 had proven it authoritative.

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
