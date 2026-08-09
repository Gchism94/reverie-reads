-- Series-integrity schema — Phase 1 of feat/series-integrity-mechanism
-- (docs/tasks/task-series-integrity-mechanism.md).
--
-- Two guards, both closing gaps established by docs/audits/series-count-schema.md:
--
--   1. `series_entries_position_uidx` — one LIVE entry per (series_id, position). A
--      series_entries row means "this slot in the reading order is filled" (one physical
--      book = one slot, regardless of formats owned), so ghosts (book_id null) occupy the
--      uniqueness space deliberately — no book_id carve-out. Tombstones (removed_at set)
--      are excluded: a removed slot must not block the position's reuse. This alone would
--      have caught the ACOTAR collision (two books both claiming #4) at write time.
--      Partial unique INDEX, not a constraint: UNIQUE constraints cannot carry WHERE;
--      same idiom as series_entries_book_uidx (20260716010000_series_experience.sql:52).
--
--   2. `series.length` — the new canonical home for series length ("Series of N").
--      smallint to round-trip losslessly into the synced copy `books.series_count`
--      (same domain, no cast surprises); nullable with NULL = "not set", matching
--      books.series_count's documented semantics; check (length >= 1) because a
--      zero-or-negative length is meaningless and NULL already expresses "unknown".
--      books.series_count becomes a synced copy written only by Phase 2's RPC, not an
--      independent source.
--
-- ▌DEPLOY SEQUENCING — DO NOT push this migration to production before Phase 2's
-- ▌atomic write RPC has re-pointed the client reorder path. `useMoveEntry`
-- ▌(apps/web/src/data/series.ts) applies a drag-reorder as a loop of single-row
-- ▌PostgREST updates, each its own transaction; entries passing through each other's
-- ▌positions commit intermediate colliding states, which this index would reject
-- ▌mid-flight — turning today's silently-tolerated inconsistency into a user-visible,
-- ▌PARTIALLY-APPLIED reorder. Deploy only alongside (or after) the Phase 2 RPC.
-- ▌Owner ruling, Phase 1 report, 2026-08-08.
--
-- Precondition: production data must already satisfy the index — CREATE UNIQUE INDEX
-- fails outright against violating rows (loud by design; nothing is dropped or
-- rewritten here). The owner runs docs/queries/series-position-collision-preview.sql
-- first; any violating set gets resolved via the staged incident-file workflow
-- (docs/queries/, owner-run) BEFORE this deploys. Local/dev verified clean.
--
-- Phase 2 footgun, flagged not fixed here: series_entries.position is `not null
-- default 0`, so any second insert that falls back to the default collides at 0 —
-- the page-open seeding fallback (`position: seeded.get(b.id) ?? 0`, series.ts) is a
-- live instance. Phase 2 drops the default when it re-points the insert sites through
-- the RPC; this migration deliberately does not touch insert paths.

alter table public.series
  add column length smallint check (length >= 1);

comment on column public.series.length is
  'Claimed series length ("Series of N"), the canonical home; NULL = not set. '
  'books.series_count is a synced copy, written atomically alongside this by the '
  'series write RPC (Phase 2), never independently.';

create unique index series_entries_position_uidx
  on public.series_entries (series_id, position)
  where removed_at is null;
