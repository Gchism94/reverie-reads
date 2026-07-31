-- Plan precision, stage 4 — convert the plans written during the deploy window.
--
-- `20260802010000` backfilled every `plan_date` into the trio and proved it: its own post-check
-- raises if a single row comes out with `plan_date` set and no `plan_y`. So at the instant that
-- migration committed, the set this one targets was empty.
--
-- It did not stay empty. That migration and #116's frontend went live HOURS APART, and for the whole
-- of that gap the deployed app was the pre-#116 one, whose mapper read `plan: row.plan_date` and
-- wrote `row.plan_date = patch.plan` — `plan_date` alone, never the trio. Any plan set in that window
-- landed in `plan_date` with the trio still empty. The same is true, past the window, of any client
-- still holding the old JS bundle.
--
-- Those rows are invisible the moment `chore/drop-plan-date` removes the fallback in `toBook`, and
-- unrecoverable once the column itself is dropped. This has to land and deploy BEFORE both.
--
-- ── The conversion is 20260802010000's, mirrored ────────────────────────────────────────────────
-- That migration's logic is inline — there is no shared function to call — so this repeats it rather
-- than re-deriving it. The SET clause and the WHERE clause below are character-for-character what it
-- ran. A backfill that parsed dates differently from the original would be worse than none: two
-- conversions disagreeing about the same column is the bug this is meant to prevent, not cause.
--
-- ── Why the guard is all THREE columns, not just plan_y ─────────────────────────────────────────
-- `plan_y is null` alone would be a WIDER net than the original cast, and the difference is not
-- hypothetical. Under the new app a partial plan is legitimate: "sometime in 2026" is stored as
-- `{y, null, null}` with `plan_date` NULL, by the lossless-only rule. Widening the guard to `plan_y
-- is null` does not touch those (their `plan_y` is set), but it WOULD convert a row carrying a month
-- or day with no year — and there, taking `plan_date` as the truth means overwriting whatever the
-- newer writer put in `plan_m`/`plan_d`. Requiring the trio to be ENTIRELY empty restricts this to
-- the one unambiguous case: a plan only the old app has ever written.
--
-- Rows the guard deliberately skips, and why each is right:
--
--   plan_date SET, trio SET      Both writers have touched this row and nothing records which came
--                                last. The trio is what the app reads today and after the drop, so
--                                skipping preserves exactly what the reader currently sees. Changing
--                                it would rewrite a visible plan on a guess. Counted and reported
--                                below rather than silently passed over.
--   plan_date NULL, trio SET     The normal state under the current app, including every partial
--                                plan. Correct as it stands; touching it is the one way to break it.
--   plan_date NULL, trio NULL    No plan. Nothing to do.
--
-- ── The post-check is the real safety net ───────────────────────────────────────────────────────
-- The narrow guard leaves one shape unconverted that WOULD be lost: `plan_date` set with a partial
-- trio that has no year (`plan_y` null, `plan_m` or `plan_d` set). No writer in the app produces
-- that — `toBookRow` writes the three together, `merge_books` moves all four under `take_plan`, and
-- the plan editor refuses a month with no year — but the schema permits it, and such a row reads as
-- "no plan" (`hasDate` is anchored on the year) while still holding a `plan_date`.
--
-- 20260802010000's own post-check catches exactly that, so it is mirrored too: after the update, any
-- row with `plan_date` set and `plan_y` null aborts the migration. That is deliberate — a shape
-- nothing should be able to create is worth a human looking at it, not an automated guess about
-- which of its two disagreeing halves to believe.

do $$
declare
  n_books      integer;
  n_legacy     integer;
  n_both       integer;
  n_trio_only  integer;
  n_filled     integer;
  n_missed     integer;
begin
  select count(*),
         count(*) filter (where plan_date is not null and plan_y is null and plan_m is null and plan_d is null),
         count(*) filter (where plan_date is not null and plan_y is not null),
         count(*) filter (where plan_date is null and plan_y is not null)
    into n_books, n_legacy, n_both, n_trio_only
  from public.books;

  raise notice 'plan_date window backfill before: % book(s); % legacy (plan_date only, convertible); % carrying BOTH (left alone, trio wins); % trio-only (correct, untouched)',
    n_books, n_legacy, n_both, n_trio_only;

  -- Character-for-character 20260802010000's conversion and guard.
  update public.books
     set plan_y = extract(year  from plan_date)::smallint,
         plan_m = extract(month from plan_date)::smallint,
         plan_d = extract(day   from plan_date)::smallint
   where plan_date is not null
     and plan_y is null and plan_m is null and plan_d is null;

  get diagnostics n_filled = row_count;

  select count(*) filter (where plan_date is not null and plan_y is null)
    into n_missed
  from public.books;

  raise notice 'plan_date window backfill after: % row(s) converted, % plan_date row(s) still without a plan_y',
    n_filled, n_missed;

  -- Mirrors 20260802010000's post-check. Zero on a re-run and zero when the window produced nothing;
  -- non-zero only for the partial-trio-without-a-year shape described above, which no writer creates
  -- and which the drop would silently destroy. Abort rather than proceed past it.
  if n_missed > 0 then
    raise exception 'plan_date window backfill: % row(s) hold a plan_date with no plan_y — a partial trio the guard cannot safely resolve; inspect before dropping plan_date', n_missed;
  end if;
end $$;
