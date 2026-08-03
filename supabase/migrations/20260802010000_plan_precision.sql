-- Plan-date precision — schema only, deploys BEFORE any app change.
--
-- `books.plan_date` is a bare `date`, so it can only say "the 14th of March" or say nothing. But
-- "sometime in March" is real reading behaviour, and the calendar needs to render it as a month-level
-- intent rather than a fake day or a NULL. A bare date forces the reader to lie about precision they
-- do not have.
--
-- This is the same problem the publish date already solved on this same table, so it gets the same
-- shape rather than a second invention: `pub_y / pub_m / pub_d` smallints, any part nullable, with a
-- PubDate type, mapper, editor, formatter and import parser already built around that trio. A
-- divergence between two sibling column sets on one table is a future bug, so the CHECKs below are
-- COPIED from what `pub_*` actually carries in the catalog, not written fresh:
--
--   books_pub_m_check  CHECK (((pub_m >= 1) AND (pub_m <= 12)))
--   books_pub_d_check  CHECK (((pub_d >= 1) AND (pub_d <= 31)))
--   pub_y              -- no CHECK at all
--
-- `pub_y` being unconstrained is mirrored DELIBERATELY. Inventing a year range for `plan_y` alone
-- would be exactly the sibling divergence this migration is trying not to create; if a year bound is
-- ever wanted it belongs on both columns, in its own migration, with its own reason.
--
-- `pub_d`'s 1..31 does not know which months are short — Feb 31 passes the CHECK. That is inherited
-- knowingly: the constraint's job is to reject an impossible ORDINAL, and calendar validity of a
-- partial date is the application's (a y+m plan has no day to validate at all).
--
-- ── plan_date IS NOT DROPPED HERE, and that is the whole ordering ────────────────────────────────
-- The app still reads and writes `plan_date` (mappers.ts, the book page's <input type="date">, the
-- merge RPC's field list). This migration deploys before any of that moves, so dropping the column
-- now would break production the moment it landed. Its removal is a LATER branch, after the app is
-- reading the trio — the same app-first-then-schema order the reading_orders demolition used
-- (S1 "stop touching it, app-side", then S2 "drop it"). Until then both representations coexist and
-- the app remains the only writer of either.

-- ── 1. The trio ─────────────────────────────────────────────────────────────────────────────────
-- Nullable with no default, like pub_*: absence of a part means "not stated at this precision", which
-- is the entire point. A plan may be a year, a year+month, or a full date.
alter table public.books
  add column if not exists plan_y smallint,
  add column if not exists plan_m smallint check (plan_m between 1 and 12),
  add column if not exists plan_d smallint check (plan_d between 1 and 31);

comment on column public.books.plan_y is
  'Planned-read year. Flexible plan-date precision, mirroring pub_y/pub_m/pub_d — any part may be null, and a year alone is a legitimate plan.';
comment on column public.books.plan_m is
  'Planned-read month (1-12), or null when the plan is only a year. "Sometime in March" is y+m with no day.';
comment on column public.books.plan_d is
  'Planned-read day (1-31), or null when the plan is month- or year-level. 1..31 mirrors pub_d and does not check month length.';

comment on column public.books.plan_date is
  'LEGACY, superseded by plan_y/plan_m/plan_d. Still the column the app reads and writes; kept so this schema change can deploy before the app moves. Removed in a later migration, after the app reads the trio.';

-- ── 2. Backfill from plan_date, and report what was actually there ──────────────────────────────
-- plan_date is a `date`, so every existing value is a FULL date — there is no partial-precision plan
-- to preserve yet, and each row backfills to y+m+d. The reverse (trio → date) is lossy and is not
-- attempted in either direction here.
--
-- Guarded on the trio being empty, so a re-run matches zero rows and cannot stamp a stale date over a
-- reader's later correction (idempotent). Counts come from the deploy output rather than a local
-- guess — the seed's numbers are not production's.
do $$
declare
  n_books       integer;
  n_plan_date   integer;
  n_trio_before integer;
  n_filled      integer;
  n_trio_after  integer;
  n_missed      integer;
begin
  select count(*),
         count(*) filter (where plan_date is not null),
         count(*) filter (where plan_y is not null)
    into n_books, n_plan_date, n_trio_before
  from public.books;

  raise notice 'plan precision before: % book(s), % with plan_date, % already carrying plan_y',
    n_books, n_plan_date, n_trio_before;

  update public.books
     set plan_y = extract(year  from plan_date)::smallint,
         plan_m = extract(month from plan_date)::smallint,
         plan_d = extract(day   from plan_date)::smallint
   where plan_date is not null
     and plan_y is null and plan_m is null and plan_d is null;

  get diagnostics n_filled = row_count;

  select count(*) filter (where plan_y is not null),
         count(*) filter (where plan_date is not null and plan_y is null)
    into n_trio_after, n_missed
  from public.books;

  raise notice 'plan precision after: % row(s) backfilled, % now carrying plan_y, % plan_date row(s) unconverted',
    n_filled, n_trio_after, n_missed;

  -- The one thing that could actually fail: a row that had a plan_date but came out without a trio.
  -- Nothing else writes between the UPDATE above and this check, so a non-zero count here means the
  -- backfill's own guard or expression is wrong, not that a concurrent writer raced it.
  if n_missed > 0 then
    raise exception 'plan precision: % row(s) still have plan_date with no plan_y after backfill', n_missed;
  end if;
end $$;
