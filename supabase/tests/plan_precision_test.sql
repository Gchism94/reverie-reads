-- plan_y / plan_m / plan_d (feat/plan-precision-schema). Four things: the CHECKs reject an impossible
-- month and day; a plan can be carried at any of the three precisions; the backfill's expression turns
-- a plan_date into the trio and leaves everything else alone; and the trio has not DIVERGED from the
-- pub_* columns it was copied from.
--
-- NO ROLE SWITCHING HERE, deliberately, and that is not the same shortcut series_removal_test.sql
-- warns about. Nothing under test is RLS-shaped: these are table CHECK constraints and a data
-- backfill, which behave identically for every role, so there is no "hidden row read as unmodified"
-- failure mode to defend against. Every assertion runs as the session role, where nothing is filtered.
--
-- WHAT THE BACKFILL ASSERTIONS DO AND DO NOT PROVE. The migration has already run by the time pgTAP
-- executes, so its historical UPDATE is not observable from here — and on a fresh local database there
-- were zero plan_date rows for it to touch, so asserting "the two production rows survived" against
-- this database would assert nothing at all and pass vacuously. What is proven instead is the
-- EXPRESSION: rows are constructed in the pre-migration shape (plan_date set, trio null), the
-- migration's own UPDATE is re-executed verbatim against them, and the result is checked. A drift
-- between this copy and the migration's would defeat that, which is why the sibling-divergence
-- assertions at the end exist in the same file — they fail on a schema change this file did not follow.
-- The real backfill's evidence is its RAISE NOTICE in the deploy output, not this test.

begin;
select plan(17);

-- One reader. The on_auth_user_created trigger gives them a profile, which books.owner_id needs.
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('aaaaaaaa-9999-9999-9999-999999999999', 'authenticated', 'authenticated',
        'plan-precision@example.com', '{}'::jsonb, '{}'::jsonb, now(), now());

-- ── The CHECKs reject an impossible ordinal ─────────────────────────────────────────────────────
-- 23514 = check_violation. Asserted by SQLSTATE rather than message text, so a rename of the
-- auto-generated constraint cannot quietly turn these green for the wrong reason.
select throws_ok(
  $$ insert into public.books (owner_id, title, plan_y, plan_m)
     values ('aaaaaaaa-9999-9999-9999-999999999999', 'Month Zero', 2026, 0) $$,
  '23514', null, 'plan_m = 0 is refused — a month is 1-based');

select throws_ok(
  $$ insert into public.books (owner_id, title, plan_y, plan_m)
     values ('aaaaaaaa-9999-9999-9999-999999999999', 'Month Thirteen', 2026, 13) $$,
  '23514', null, 'plan_m = 13 is refused — there is no thirteenth month');

select throws_ok(
  $$ insert into public.books (owner_id, title, plan_y, plan_m, plan_d)
     values ('aaaaaaaa-9999-9999-9999-999999999999', 'Day Zero', 2026, 3, 0) $$,
  '23514', null, 'plan_d = 0 is refused — a day is 1-based');

select throws_ok(
  $$ insert into public.books (owner_id, title, plan_y, plan_m, plan_d)
     values ('aaaaaaaa-9999-9999-9999-999999999999', 'Day Thirty-Two', 2026, 3, 32) $$,
  '23514', null, 'plan_d = 32 is refused — no month has a 32nd');

-- ── A plan is legal at all three precisions ─────────────────────────────────────────────────────
-- The point of the trio: "next year", "sometime in March", and "the 14th" are all sayable, and the
-- unstated parts stay NULL rather than being invented.
select lives_ok(
  $$ insert into public.books (id, owner_id, title, plan_y)
     values ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-9999-9999-9999-999999999999', 'Year Only', 2027) $$,
  'a plan can be a year alone');

select lives_ok(
  $$ insert into public.books (id, owner_id, title, plan_y, plan_m)
     values ('eeeeeeee-0000-0000-0000-000000000002', 'aaaaaaaa-9999-9999-9999-999999999999', 'Year And Month', 2026, 3) $$,
  'a plan can be a year and a month, with no day');

select lives_ok(
  $$ insert into public.books (id, owner_id, title, plan_y, plan_m, plan_d)
     values ('eeeeeeee-0000-0000-0000-000000000003', 'aaaaaaaa-9999-9999-9999-999999999999', 'Full Date', 2026, 3, 14) $$,
  'a plan can be a full date');

-- Accepting the insert is not the same as storing the absence. These read the unstated parts back,
-- so a future NOT NULL or a DEFAULT 1 on either column fails here rather than silently fabricating
-- "January" and "the 1st" for every year-level plan in the library.
select is(
  (select plan_m::text || '/' || plan_d::text from public.books where id = 'eeeeeeee-0000-0000-0000-000000000001'),
  null,
  'a year-alone plan leaves month and day NULL — no fabricated January 1st');

select ok(
  (select plan_m = 3 and plan_d is null from public.books where id = 'eeeeeeee-0000-0000-0000-000000000002'),
  'a year+month plan keeps its month and leaves the day NULL');

-- ── The backfill expression ─────────────────────────────────────────────────────────────────────
-- Two rows in the pre-migration shape, matching production's two plan_date rows, plus a third row
-- that has no plan at all and must not be touched.
insert into public.books (id, owner_id, title, plan_date)
values
  ('eeeeeeee-0000-0000-0000-000000000010', 'aaaaaaaa-9999-9999-9999-999999999999', 'Legacy Plan A', date '2026-03-14'),
  ('eeeeeeee-0000-0000-0000-000000000011', 'aaaaaaaa-9999-9999-9999-999999999999', 'Legacy Plan B', date '2027-01-05');
insert into public.books (id, owner_id, title)
values ('eeeeeeee-0000-0000-0000-000000000012', 'aaaaaaaa-9999-9999-9999-999999999999', 'No Plan At All');

-- Verbatim copy of the migration's UPDATE, including its guard.
update public.books
   set plan_y = extract(year  from plan_date)::smallint,
       plan_m = extract(month from plan_date)::smallint,
       plan_d = extract(day   from plan_date)::smallint
 where plan_date is not null
   and plan_y is null and plan_m is null and plan_d is null;

select is(
  (select plan_y::text || '-' || plan_m::text || '-' || plan_d::text
     from public.books where id = 'eeeeeeee-0000-0000-0000-000000000010'),
  '2026-3-14',
  'a plan_date backfills to y+m+d — a full date loses no precision');

select is(
  (select plan_y::text || '-' || plan_m::text || '-' || plan_d::text
     from public.books where id = 'eeeeeeee-0000-0000-0000-000000000011'),
  '2027-1-5',
  'a second plan_date backfills independently — single-digit month and day are not zero-padded away');

-- plan_date is NOT cleared by the backfill. This is the whole reason the column survives this
-- migration: the app still reads it, and this deploys first.
select ok(
  (select plan_date = date '2026-03-14' from public.books where id = 'eeeeeeee-0000-0000-0000-000000000010'),
  'the backfill leaves plan_date in place — the app still reads it until a later branch drops it');

select is(
  (select count(*)::int from public.books
    where id = 'eeeeeeee-0000-0000-0000-000000000012' and plan_y is null and plan_m is null and plan_d is null),
  1,
  'a book with no plan_date gets no trio — the backfill invents nothing');

-- Idempotence: the guard means a re-run matches nothing, so a reader's later correction to the trio
-- survives a repeated migration instead of being stamped back to the legacy date.
update public.books set plan_y = 2030, plan_m = null, plan_d = null
 where id = 'eeeeeeee-0000-0000-0000-000000000010';

update public.books
   set plan_y = extract(year  from plan_date)::smallint,
       plan_m = extract(month from plan_date)::smallint,
       plan_d = extract(day   from plan_date)::smallint
 where plan_date is not null
   and plan_y is null and plan_m is null and plan_d is null;

select ok(
  (select plan_y = 2030 and plan_m is null from public.books where id = 'eeeeeeee-0000-0000-0000-000000000010'),
  're-running the backfill does not overwrite a trio that is already set, even a coarser one');

-- ── The trio has not diverged from pub_* ────────────────────────────────────────────────────────
-- The stated reason for copying rather than inventing. Compared by rendered constraint definition
-- with the column name normalised away, so a change to either side's bounds fails here.
--
-- `ok(a = b)`, NOT `is(a, b)`: is() is null-safe, so if BOTH constraints vanished it would compare
-- NULL to NULL and pass — certifying a mirror between two things that no longer exist. Under `ok`,
-- a missing constraint makes `=` yield NULL, and ok(NULL) fails.
select ok(
  (select pg_get_constraintdef(oid) from pg_constraint
    where conrelid = 'public.books'::regclass and conname = 'books_plan_m_check')
  = replace(
      (select pg_get_constraintdef(oid) from pg_constraint
        where conrelid = 'public.books'::regclass and conname = 'books_pub_m_check'),
      'pub_m', 'plan_m'),
  'plan_m''s CHECK is pub_m''s CHECK, column name aside — the sibling columns have not diverged');

select ok(
  (select pg_get_constraintdef(oid) from pg_constraint
    where conrelid = 'public.books'::regclass and conname = 'books_plan_d_check')
  = replace(
      (select pg_get_constraintdef(oid) from pg_constraint
        where conrelid = 'public.books'::regclass and conname = 'books_pub_d_check'),
      'pub_d', 'plan_d'),
  'plan_d''s CHECK is pub_d''s CHECK, column name aside — the sibling columns have not diverged');

-- pub_y carries no CHECK, so plan_y carries none either. Asserted as a PAIR: this fails both if
-- plan_y grows a year bound pub_y lacks, and if pub_y grows one plan_y was never given.
select is(
  (select count(*)::int from pg_constraint
    where conrelid = 'public.books'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ~ '\mplan_y\M'),
  (select count(*)::int from pg_constraint
    where conrelid = 'public.books'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ~ '\mpub_y\M'),
  'plan_y is constrained exactly as much as pub_y is — which is to say, not at all');

select * from finish();
rollback;
