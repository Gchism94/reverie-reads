-- Unified series removal (docs/task-series-defects.md §Removal, revised).
--
-- #65 gave the two entry points DIFFERENT removal semantics: the series page deleted the slot, the
-- book page only DETACHED the book and kept the slot as a ghost. Readers reported the second one as
-- "removing doesn't stick" — the book was still sitting in the series. Removal now means one thing
-- everywhere: the slot is gone and the book no longer names the series.
--
-- That needs a tombstone. Reconciliation can't resurrect a removed slot (clearing books.series takes
-- care of that), but a canonical SOURCE refresh would happily re-insert the ghost the reader just
-- dismissed. So a removal SOFT-deletes: the row stays, removed_at is stamped, and the source merge
-- sees it and matches against it — the reader's decision outlives the next Hardcover fetch.
--
-- A tombstone releases its book (book_id → null) so series_entries_book_uidx stays free for a later
-- re-add, and keeps title/author/position so the source merge can match it by title.

alter table public.series_entries add column if not exists removed_at timestamptz;

comment on column public.series_entries.removed_at is
  'Set when the reader removed this slot. Live entries are removed_at is null; tombstones are kept so a canonical source refresh cannot resurrect a slot the reader dismissed. Re-adding the book revives the row.';

-- Every read of the series shelf filters on this, so index the live set directly.
create index if not exists series_entries_live_idx
  on public.series_entries (series_id)
  where removed_at is null;
