-- The deploy-window backfill (fix/plan-date-backfill). Four states go in, and only one of them may
-- change: a plan that exists ONLY in plan_date. Everything else is either already correct or
-- ambiguous, and this migration must leave both alone.
--
-- WHAT THESE ASSERTIONS CAN AND CANNOT PROVE. The migration has already run by the time pgTAP
-- executes, and on a fresh local database it found nothing to convert — so asserting "the window's
-- rows were converted" against this database would be vacuous and pass for the wrong reason. What is
-- proven instead is the STATEMENT: rows are built in each of the four shapes, the migration's update
-- is re-executed verbatim against them, and the result is checked. Its post-check is exercised the
-- same way. The evidence for the real run is its RAISE NOTICE in the deploy output.
--
-- No role switching: table-level UPDATEs behave identically for every role, so there is no
-- RLS-hidden-row failure mode to defend against here. Every assertion runs as the session role.

begin;
select plan(13);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('aaaaaaaa-4444-4444-4444-444444444444', 'authenticated', 'authenticated',
        'plan-backfill@example.com', '{}'::jsonb, '{}'::jsonb, now(), now());

-- ── The four states ─────────────────────────────────────────────────────────────────────────────
insert into public.books (id, owner_id, title, plan_date, plan_y, plan_m, plan_d)
values
  -- LEGACY: written by the pre-#116 app during the deploy window. The only convertible row.
  ('cccccccc-0000-0000-0000-00000000000a', 'aaaaaaaa-4444-4444-4444-444444444444',
   'Legacy Only', date '2026-03-14', null, null, null),
  -- BOTH: touched by both writers, disagreeing on purpose so an overwrite is unmistakable.
  ('cccccccc-0000-0000-0000-00000000000b', 'aaaaaaaa-4444-4444-4444-444444444444',
   'Both Set', date '2019-01-01', 2030, 6, 9),
  -- TRIO-ONLY, PARTIAL: "sometime in 2026" under the lossless-only rule — plan_date is correctly
  -- null. This is the reverse case, and the one a wider guard would be most likely to damage.
  ('cccccccc-0000-0000-0000-00000000000c', 'aaaaaaaa-4444-4444-4444-444444444444',
   'Year Only', null, 2027, null, null),
  -- NEITHER: no plan at all.
  ('cccccccc-0000-0000-0000-00000000000d', 'aaaaaaaa-4444-4444-4444-444444444444',
   'No Plan', null, null, null, null);

-- The migration's update, verbatim.
update public.books
   set plan_y = extract(year  from plan_date)::smallint,
       plan_m = extract(month from plan_date)::smallint,
       plan_d = extract(day   from plan_date)::smallint
 where plan_date is not null
   and plan_y is null and plan_m is null and plan_d is null;

-- ── 1. The legacy row converts ──────────────────────────────────────────────────────────────────
select is(
  (select plan_y::text || '-' || plan_m::text || '-' || plan_d::text
     from public.books where id = 'cccccccc-0000-0000-0000-00000000000a'),
  '2026-3-14',
  'a plan that existed only in plan_date is converted to the trio — the window''s rows');

select ok(
  (select plan_date = date '2026-03-14' from public.books where id = 'cccccccc-0000-0000-0000-00000000000a'),
  'and plan_date is left in place, since the app still reads it until a later branch');

-- ── 2. A row already carrying a trio is untouched ───────────────────────────────────────────────
-- The values disagree with plan_date deliberately: if the guard were dropped, the trio would become
-- 2019-1-1 and this fails loudly rather than subtly.
select is(
  (select plan_y::text || '-' || plan_m::text || '-' || plan_d::text
     from public.books where id = 'cccccccc-0000-0000-0000-00000000000b'),
  '2030-6-9',
  'a row carrying BOTH keeps its trio — the migration never rewrites a plan the reader can see');

select ok(
  (select plan_date = date '2019-01-01' from public.books where id = 'cccccccc-0000-0000-0000-00000000000b'),
  'and its plan_date is not reconciled either — this migration only ever fills empty trios');

-- ── 3. The reverse case: a trio with no plan_date ───────────────────────────────────────────────
select ok(
  (select plan_y = 2027 and plan_m is null and plan_d is null
     from public.books where id = 'cccccccc-0000-0000-0000-00000000000c'),
  'a partial trio written by the current app is untouched — no month or day is invented for it');

select ok(
  (select plan_date is null from public.books where id = 'cccccccc-0000-0000-0000-00000000000c'),
  'and no plan_date is written back for it — the lossless-only rule still holds');

-- ── 4. A row with neither ───────────────────────────────────────────────────────────────────────
select is(
  (select count(*)::int from public.books
    where id = 'cccccccc-0000-0000-0000-00000000000d'
      and plan_date is null and plan_y is null and plan_m is null and plan_d is null),
  1,
  'a book with no plan of any kind is left completely alone');

-- ── 5. Idempotence — a second run changes nothing ───────────────────────────────────────────────
-- Not "the statement matches zero rows", which would be true even if it had already done damage:
-- the whole table is snapshotted, re-run, and compared. Any change anywhere fails this.
create temporary table plan_snapshot as
  select id, plan_date, plan_y, plan_m, plan_d from public.books order by id;

update public.books
   set plan_y = extract(year  from plan_date)::smallint,
       plan_m = extract(month from plan_date)::smallint,
       plan_d = extract(day   from plan_date)::smallint
 where plan_date is not null
   and plan_y is null and plan_m is null and plan_d is null;

select is(
  (select count(*)::int from public.books b
     join plan_snapshot s using (id)
    where b.plan_date is distinct from s.plan_date
       or b.plan_y is distinct from s.plan_y
       or b.plan_m is distinct from s.plan_m
       or b.plan_d is distinct from s.plan_d),
  0,
  'running the backfill a second time changes no column of any row');

select is(
  (select count(*)::int from public.books),
  (select count(*)::int from plan_snapshot),
  'and adds or removes no rows');

-- ── 6. The post-check's condition ───────────────────────────────────────────────────────────────
-- After the update, nothing built above may satisfy the abort condition.
select is(
  (select count(*)::int from public.books where plan_date is not null and plan_y is null),
  0,
  'no row is left holding a plan_date with no plan_y — the migration''s own abort condition is clear');

-- The shape that condition exists to catch: plan_date set, trio partial, no year. The narrow guard
-- deliberately does NOT convert it, which is exactly why the post-check must see it.
insert into public.books (id, owner_id, title, plan_date, plan_y, plan_m, plan_d)
values ('cccccccc-0000-0000-0000-00000000000e', 'aaaaaaaa-4444-4444-4444-444444444444',
        'Orphan Partial', date '2026-05-05', null, 5, null);

update public.books
   set plan_y = extract(year  from plan_date)::smallint,
       plan_m = extract(month from plan_date)::smallint,
       plan_d = extract(day   from plan_date)::smallint
 where plan_date is not null
   and plan_y is null and plan_m is null and plan_d is null;

select ok(
  (select plan_y is null and plan_m = 5
     from public.books where id = 'cccccccc-0000-0000-0000-00000000000e'),
  'a partial trio with no year is NOT converted — the guard requires all three columns empty');

select is(
  (select count(*)::int from public.books where plan_date is not null and plan_y is null),
  1,
  'and it trips the post-check, so the migration aborts rather than leaving it to be dropped silently');

-- ── 7. The conversion itself is date-correct ────────────────────────────────────────────────────
-- Single-digit month and day, to pin that extract() is used rather than any string slicing that
-- would carry zero padding into a smallint column.
insert into public.books (id, owner_id, title, plan_date)
values ('cccccccc-0000-0000-0000-00000000000f', 'aaaaaaaa-4444-4444-4444-444444444444',
        'Single Digits', date '2027-01-05');

update public.books
   set plan_y = extract(year  from plan_date)::smallint,
       plan_m = extract(month from plan_date)::smallint,
       plan_d = extract(day   from plan_date)::smallint
 where plan_date is not null
   and plan_y is null and plan_m is null and plan_d is null;

select is(
  (select plan_y::text || '-' || plan_m::text || '-' || plan_d::text
     from public.books where id = 'cccccccc-0000-0000-0000-00000000000f'),
  '2027-1-5',
  'January 5th converts to 2027/1/5 — extract(), not a padded string');

select * from finish();
rollback;
