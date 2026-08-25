# docs/

Map of the documentation directory. Read `AGENTS.md` (repo root) first, then
`docs/reference/DATA_MODEL.md` before touching anything that stores a book.

Project order and current completion status live in the root `ROADMAP.md`. It is the first stop for
deciding what comes next; detailed backlog and task files supply scope, not competing priority.

## reference/ — how the system is

Living docs describing the system as it currently stands. Updated in place;
never "done." Start here when you need to know what something does today.

- `DATA_MODEL.md` — DB schema and object shapes. **Read before storing anything.**
- `ARCHITECTURE.md` — app architecture and API surface.
- `FEATURES.md` / `REQUIREMENTS.md` — what the app does and the requirements behind it.
- `DEPLOY.md` — deploy discipline, the guard, prod-safety rules.
- `DATA_SOURCES.md` — cover, metadata, and release-data sources.
- `ENRICHMENT_STRATEGY.md` / `reverie-metadata-sourcing.md` — metadata enrichment
  and sourcing posture (sources, licensing, remediation queue).
- `COVER_SOURCING_AND_STUDIO.md` — cover pipeline and studio.
- `SKINS.md` / `SKIN_CHARACTER_CONTRACT.md` / `SKIN_CHARACTER_SYSTEM.md` — the
  nine skins, their tokens, and the character system.
- `SHARING.md` — sharing and book-club design.
- `OFFLINE_SYNC.md` — offline cache and sync strategy.
- `SCALING.md` — scaling posture and limits.
- `STATS_PRIVACY_AND_FEATURES.md` — stats, privacy, and feature flags.
- `TRADEMARK.md` — name history (`APP_NAME` in `@reverie/core` is current).

## backlog/ — what we might build

Unbuilt feature proposals, scheduled maintenance, and design backlogs. Not active commitments; no
code should begin from one without revalidating it against current `main` and moving it into
`docs/tasks/`.

- `BACKLOG.md` / `DESIGN_BACKLOG.md` — the working backlogs.
- `PICKS_BOOK_OF_MONTH_YEAR.md` / `SOCIAL_DISCOVERY_PHASE.md` — proposed features.
- `task-*.md` — previously scoped work that is planned or scheduled but not active.

## tasks/ — what we're doing now

Task briefs with stable paths referenced by code, migrations, and audits. Read each brief's status
line: a file may be active, planned, completed, or superseded. New work should normally move to the
backlog when it is not active, but historically referenced task paths remain here rather than
breaking their provenance links.

- `task-recovery-and-workspace-hygiene.md` — private recovery mirror and read-only pruning audit.
- `task-library-removal-and-reconciliation.md` — corpus-preserving removal and the guarded owner
  CSV reconciliation that follows recovery/history hygiene.

## archive/ — what we did (history)

Completed or superseded task briefs and handoffs. Kept for provenance, not as
a description of how the app behaves. Several carry archive banners noting
where a later decision reversed the work; read those before trusting the body.
For current behavior, read the code and `docs/reference/`.

## audits/ — investigations

Point-in-time audit reports. Each names a defect, traces its root cause, and
records what was decided. Some are open (defect unresolved), some closed.

## decisions/ — ADRs

Architecture Decision Records, numbered. Each captures a decision and its
rationale so it is not re-litigated without a reason.

## queries/ — one-shot SQL

Data-fix and audit SQL scoped to a specific incident or question. **Not
migrations** — run by hand against a target database, never added to
`supabase/migrations/`. See `AGENTS.md` ("A data-fix script is NOT a migration").

## research/ · design/

Research notes and per-skin design briefs. Reference material, not shipped code.
