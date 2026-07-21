-- Series status widening (docs/task-series-defects.md §3): add two values to the series-status enum,
-- confirmed by the owner. Romance especially lives in interconnected-standalone territory (each book
-- stands alone but shares a world), and interconnected-series (linked full series in one universe).
--
-- The status lives on BOTH books.status (the book-editing enum) and series.status (the series page),
-- so both CHECK constraints widen. Purely additive — no existing row changes, no data migration. The
-- (parked) multi-series universe/saga layer is deliberately NOT modeled here; nothing below forecloses
-- adding a `series_group`/`universe` relation later.

alter table public.books drop constraint if exists books_status_check;
alter table public.books add constraint books_status_check
  check (status in (
    'standalone', 'ongoing', 'completed', 'on_hiatus', 'cancelled',
    'interconnected_standalone', 'interconnected_series'
  ));

alter table public.series drop constraint if exists series_status_check;
alter table public.series add constraint series_status_check
  check (status in (
    'standalone', 'ongoing', 'completed', 'on_hiatus', 'cancelled',
    'interconnected_standalone', 'interconnected_series'
  ));
