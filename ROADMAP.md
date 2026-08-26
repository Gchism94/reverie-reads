# Reverie Reads roadmap

Current as of 2026-08-25. This file is the ordered project status. Historical briefs remain in
`docs/archive/`; detailed proposals that are not yet active remain in `docs/backlog/`; only work
actually in flight belongs in `docs/tasks/`.

Priorities mean:

- **P0 — safety/blocker:** finish before the next product change or production-data write.
- **P1 — next:** the next product or engineering program after P0 is closed.
- **P2 — planned:** valuable work with no current blocking dependency.
- **P3 — deferred/monitor:** revisit on evidence, schedule, or an explicit owner decision.

## Shipped production baseline

The original prototype-to-product roadmap is complete. Reverie Reads is a React/TypeScript,
Supabase-backed application at `reveriereads.app`, with authentication, personal libraries,
imports and exports, corpus-backed works and edition identity, enrichment and cover handling,
search and discovery, shelves, series tooling, planner/calendar, stats, Match, nine skins,
accessibility coverage, offline read caching, clubs/shared lists, and a read-only household view.

The latest production release is `18f20af0fd276ca1ae2cd360f1d20ace91b1158f` (2026-08-25). It
includes ISBN-to-work matching and the household foundation plus its privacy, revocation, identity,
paused-cache, and concurrent-final-unlink hardening. Migrations `20260828010000` and
`20260829010000` are recorded remotely. The promoted deployment and public domains passed build,
HTTP, TLS, asset, console, runtime-log, authentication-entry, and owner-run Account A/Account B
smoke checks. Automatic production-domain assignment is enabled again for `main`.

## Ordered execution plan

Do these in order. A later item may be researched while an earlier one is executing, but it must
not change the same state or bypass the earlier item's completion gate.

| Order | Priority | Task                                                     | State           | Dependency and completion gate                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----: | :------: | -------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     1 |    P0    | Private recovery mirror and workspace audit              | In progress     | Create and verify the private full-Git recovery mirror; inventory every related worktree/folder; preserve unique commits and files; delete nothing until the owner approves the exact pruning set.                                                                                                                                                                                                                                      |
|     2 |    P0    | Retire Claude/vendor tooling and contributor metadata    | Blocked on 1    | Review the existing `codex/chore-retire-vendor-tooling` work, remove repository integrations/configuration, decide the exact history rewrite, include any private tracked source-data cleanup in the same one-time rewrite, and prove the recovery mirror can restore every pre-rewrite ref. All collaborators must re-clone or realign afterward. See `docs/backlog/task-contributor-history-cleanup.md`.                              |
|     3 |    P0    | Prune redundant worktrees and app-related `dev/` folders | Blocked on 1–2  | Remove only owner-approved, fully recoverable candidates. Preserve dirty/untracked state and unique commits. Prune stale Git registrations only after their paths and recovery status are verified.                                                                                                                                                                                                                                     |
|     4 |    P0    | Build independent, corpus-preserving library membership  | Ready after 2–3 | Replace the derived household union with first-class household membership and shared enrichment. Personal deletion must preserve household and corpus data; household removal must preserve personal and corpus data. Route genre/subgenre/cover options to the corpus, household tags/tropes to the household overlay, and reading/possession state to personal storage. See `docs/tasks/task-library-removal-and-reconciliation.md`.  |
|     5 |    P0    | Owner-library backup and CSV reconciliation              | Blocked on 4    | Export the affected Account A/B rows, parse the private ignored CSV, report every duplicate/unmatched row, approve an exact dry-run, then reconcile memberships. Every CSV book enters the household directly; `TC read` assigns Account A, `GC read` assigns Account B, and unmarked rows remain household-only. Non-CSV removals preserve corpus data.                                                                                |
|     6 |    P1    | CI/CD value and reliability review, then simplification  | Blocked on 5    | Measure duration, duplication, contention, flake history, and defect yield for every required check. Fix recurring breakage, remove redundant/overkill work, and keep the smallest gate that still protects types, formatting, secrets, database/RLS, accessibility, and critical browser behavior. See `docs/backlog/task-ci-cd-simplification.md`.                                                                                    |
|     7 |    P1    | Series truth and library-experience overhaul             | Blocked on 6    | Audit ingestion and current production-shaped data; default to no series unless membership is sourced or reader-confirmed; preserve provenance and reader edits; reconcile the old string and structured models; then redesign how series appear and are edited in Library. Existing consolidation/integrity records are inputs, not proof the current experience is correct. See `docs/backlog/task-series-truth-library-overhaul.md`. |
|     8 |    P1    | Landing-page capability and brand redesign               | Blocked on 7    | Re-audit the shipped capability set and build a warm, personal, Reverie-voiced landing page derived from the authenticated product. Use curated fixtures—never private production data—and show only real, current behavior across responsive and accessible layouts. See `docs/backlog/task-landing-capability-brand-redesign.md`.                                                                                                     |

## P2 — planned product and reliability work

These are ordered within P2, but they do not block the P0/P1 sequence above.

1. **Deploy/CI safety residue.** Fold production RPC ACL verification, the deploy guard's duplicate
   confirmation, bounded Supabase-start recovery/cleanup, e2e TypeScript coverage, resilient
   fixture cleanup, Deno-function execution coverage, and useful/non-corrupt browser artifacts into
   the P1 CI review rather than creating seven independent systems.
2. **Signed-out and accessibility coverage.** Extend viewport coverage to landing/auth routes, put
   the cover placeholder in the axe sweep, and retain real rendered-cover quality coverage. The
   landing redesign should close its overlapping portion.
3. **Spine reveal band.** Implement the already-decided shared, fixed-height reveal band only after
   revalidating `docs/tasks/task-spine-reveal-band.md` against the current UI.
4. **Calendar/Releases cluster.** The sparse calendar pass shipped. Revalidate the remaining
   Calendar/Releases route, density, mobile, and heatmap decisions in
   `docs/tasks/task-calendar-cluster-scope.md` before another implementation branch.
5. **Library state and synchronization.** Decide URL precedence for filters; fix realtime lifecycle
   across sign-out and assess personal-book/list subscriptions. Treat a true offline write queue as
   its own subsystem, not a quick caching patch.
6. **Reader safeguards and polish.** Add a restore preflight with real counts, eliminate fresh-device
   mode flash, resolve dense-grid state indicators, and convert the remaining risky literal glyphs
   to controlled SVGs.
7. **Reading progress.** Decide whether percent-only progress is sufficient; pages/chapters require
   schema, import/export, stats, and UI semantics together.
8. **Cover pipeline efficiency.** Remove repeated image decodes only after measuring CPU/memory and
   preserving current cover-quality guards.

## P3 — deferred, scheduled, or evidence-triggered

1. **Discover re-curation:** measure the four curated categories before the first six-month refresh;
   use `docs/tasks/task-discover-recuration.md`. Do not build a standing feed without a separate
   product/monetization decision.
2. **iOS barcode fallback:** revisit when tester/browser evidence justifies shipping a WASM decoder;
   the current unsupported-browser fallback is deliberate.
3. **Year heatmap, dedicated Wrapped experience, Cover Studio, author following, bulk trope tagging,
   writable/whole-library household sync, app-store packaging, social discovery, and premium corpus
   freshness:** separate product decisions, not launch blockers.
4. **Dead-code/tooling sweep:** consider a narrowly configured `knip` pass after CI simplification;
   do not add another permanent gate merely because a one-time audit is useful.
5. **Historical global-cover objects and licence review:** owner/data decisions; code sessions must
   not infer production counts or delete stored objects.
6. **Flake watch items:** investigate recurrence with the existing failure ledger; do not rerun a
   red job until green or raise timeouts without a diagnosed mechanism.

## Rules that apply to every item

- Corpus, household, and personal membership have independent lifecycles. Removing a personal book
  must preserve existing household membership and shared work, edition, contributor, and ISBN data;
  removing a household book must preserve every personal library and the corpus.
- Book edits are scoped: canonical genre/subgenre/cover options update the corpus; household tags,
  tropes, and similar shared enrichment update the household overlay; possession, wishlist, reading,
  rating, notes, progress, favourites, and lists remain personal.
- Production-data changes require a scoped backup, a deterministic dry-run, explicit owner review,
  and post-write verification. Code sessions do not write production data.
- Re-check task text against the current tree and `origin/main`; historical confidence is not
  current evidence.
- Use one focused branch per reviewable outcome. No merge, deployment, history rewrite, branch
  deletion, or directory pruning without its own verified gate and owner authorization.
