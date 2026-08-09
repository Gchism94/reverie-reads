# docs/

Map of the documentation directory. Read `AGENTS.md` (repo root) first, then
`docs/reference/DATA_MODEL.md` before touching anything that stores a book.

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

Unbuilt feature proposals and design backlogs. Not commitments; no code yet.

- `BACKLOG.md` / `DESIGN_BACKLOG.md` — the working backlogs.
- `PICKS_BOOK_OF_MONTH_YEAR.md` / `SOCIAL_DISCOVERY_PHASE.md` — proposed features.

## tasks/ — what we're doing now

Active task briefs: the scope, acceptance criteria, and standing orders for a
piece of work currently in flight.

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
