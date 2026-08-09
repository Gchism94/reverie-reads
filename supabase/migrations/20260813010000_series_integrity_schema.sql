-- Series-integrity schema — Phase 1 of feat/series-integrity-mechanism
-- (docs/tasks/task-series-integrity-mechanism.md).
--
-- ▌SPLIT IN PHASE 2, DELIBERATELY. This file originally carried TWO guards: `series.length`
-- ▌and the partial unique index `series_entries_position_uidx`. The index now lives in its own
-- ▌migration (20260816010000_series_position_uidx.sql) and is the LAST thing in the deploy
-- ▌order. The two have opposite deploy constraints and could not share a file:
-- ▌
-- ▌  · `series.length` must exist BEFORE Phase 2's set_series_order RPC, which writes it.
-- ▌  · the index must not exist UNTIL the re-pointed web app has shipped — the deployed
-- ▌    client's drag-reorder is a loop of single-row updates, each its own transaction, and
-- ▌    entries passing through each other's positions commit intermediate colliding states
-- ▌    that the index rejects mid-flight. That turns today's silently-tolerated inconsistency
-- ▌    into a user-visible, PARTIALLY-APPLIED reorder.
-- ▌
-- ▌Keeping both here meant one `db push` applying both, leaving that hazard live for the whole
-- ▌gap between the migration push and the app deploy. Owner ruling, Phase 2 report, 2026-08-09:
-- ▌"'after' is clearly the safer reading — split it." Never re-merge these two files.
--
-- `series.length` — the canonical home for series length ("Series of N"). smallint to round-trip
-- losslessly into the synced copy `books.series_count` (same domain, no cast surprises); nullable
-- with NULL = "not set", matching books.series_count's documented semantics; check (length >= 1)
-- because a zero-or-negative length is meaningless and NULL already expresses "unknown".
-- books.series_count becomes a synced copy written only by set_series_order
-- (20260814010000_set_series_order.sql), never independently.

alter table public.series
  add column length smallint check (length >= 1);

comment on column public.series.length is
  'Claimed series length ("Series of N"), the canonical home; NULL = not set. '
  'books.series_count is a synced copy, written atomically alongside this by '
  'set_series_order, never independently.';
