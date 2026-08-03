-- merge_books and the plan trio. The property under test is the one the pre-20260803010000
-- `case when p_fields ? 'plan_date'` did not have: a merge can ADD a plan to a book that lacks one,
-- and can never REMOVE or rewrite one that a book already has.
--
-- WHY A NULL INCOMING PLAN IS THE CENTRAL CASE. The assertions that matter send an all-null plan
-- while the primary has a stored one. Under the replaced expression that combination wrote null over
-- the stored value — the key was always present, so the `case` always fired. Under `take_plan` it
-- cannot, because `take_plan` is false the moment the primary has a plan.
--
-- THREE ASSERTIONS WERE DELETED WHEN `plan_date` WAS DROPPED (20260805010000), not rewritten into
-- something weaker. They covered the second half of `take_plan`'s old condition: a row written by the
-- pre-trio app carried a plan in `plan_date` with an empty trio, and `plan_y is null` alone would
-- have read that as "no plan" and overwritten it. That row shape is now unconstructible — the column
-- is gone, no writer can produce one, and 20260804010000 converted every one that existed. A test for
-- it would have had to fabricate the very state the schema now forbids. `take_plan` is keyed on
-- `plan_y is null` alone, and what remains here is what still has meaning: the plan unions through
-- the trio, or it does not move at all.
--
-- ASSERTIONS READ AS THE SESSION ROLE, THE RPC RUNS AS `authenticated`. Same reason
-- series_removal_test.sql gives: a books row invisible to the querying role under RLS reads
-- identically to an unmodified one for a whole class of assertion shapes. Only the calls are
-- role-scoped; every check runs after `reset role`, where nothing is filtered.
--
-- The ACL this migration's `create or replace` could silently have reset is guarded in
-- merge_test.sql, which asserts anon gets SQLSTATE 42501 — grant-layer, never a body-level P0001.
begin;
select plan(7);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('aaaaaaaa-5555-5555-5555-555555555555', 'authenticated', 'authenticated',
        'merge-plan@example.com', '{}'::jsonb, '{}'::jsonb, now(), now());

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-5555-5555-5555-555555555555","role":"authenticated"}', true);

-- ── 1. A plan survives a merge whose incoming fields carry none ─────────────────────────────────
-- The regression. Primary holds a full plan; the merge sends an all-null one, exactly as a stale
-- client would. Nothing about the plan may change.
insert into public.books (id, owner_id, title, plan_y, plan_m, plan_d)
values ('ffffffff-0000-0000-0000-000000000001', 'aaaaaaaa-5555-5555-5555-555555555555',
        'Keeper', 2026, 3, 14);
insert into public.books (id, owner_id, title)
values ('ffffffff-0000-0000-0000-000000000002', 'aaaaaaaa-5555-5555-5555-555555555555', 'Dupe');

select lives_ok(
  $$ select public.merge_books(
       'ffffffff-0000-0000-0000-000000000001',
       'ffffffff-0000-0000-0000-000000000002',
       '{"title":"Keeper","plan_y":null,"plan_m":null,"plan_d":null}'::jsonb) $$,
  'a merge sending an all-null plan is accepted');

reset role;
select is(
  (select plan_y::text || '-' || plan_m::text || '-' || plan_d::text
     from public.books where id = 'ffffffff-0000-0000-0000-000000000001'),
  '2026-3-14',
  'the primary KEEPS its plan when the merge carries none — the defect this replaces');

-- ── 2. A merge can still ADD a plan to a book that has none ─────────────────────────────────────
-- The fix must not be "never write the plan". A blank primary still takes the incoming one.
set local role authenticated;
insert into public.books (id, owner_id, title)
values ('ffffffff-0000-0000-0000-000000000003', 'aaaaaaaa-5555-5555-5555-555555555555', 'Blank Primary'),
       ('ffffffff-0000-0000-0000-000000000004', 'aaaaaaaa-5555-5555-5555-555555555555', 'Planned Dupe');

select lives_ok(
  $$ select public.merge_books(
       'ffffffff-0000-0000-0000-000000000003',
       'ffffffff-0000-0000-0000-000000000004',
       '{"title":"Blank Primary","plan_y":2027,"plan_m":1,"plan_d":5}'::jsonb) $$,
  'a merge carrying a plan onto a plan-less primary is accepted');

reset role;
select is(
  (select plan_y::text || '-' || plan_m::text || '-' || plan_d::text
     from public.books where id = 'ffffffff-0000-0000-0000-000000000003'),
  '2027-1-5',
  'a plan-less primary ADOPTS the incoming plan — the union still unions');

-- ── 3. The plan lands as ONE OBJECT, never assembled from parts ─────────────────────────────────
-- A month-only incoming plan must arrive as year+month with the day still NULL. Three independent
-- coalesces could leave a day behind from elsewhere; `take_plan` cannot.
set local role authenticated;
insert into public.books (id, owner_id, title)
values ('ffffffff-0000-0000-0000-000000000005', 'aaaaaaaa-5555-5555-5555-555555555555', 'Month Primary'),
       ('ffffffff-0000-0000-0000-000000000006', 'aaaaaaaa-5555-5555-5555-555555555555', 'Month Dupe');

select lives_ok(
  $$ select public.merge_books(
       'ffffffff-0000-0000-0000-000000000005',
       'ffffffff-0000-0000-0000-000000000006',
       '{"title":"Month Primary","plan_y":2026,"plan_m":3,"plan_d":null}'::jsonb) $$,
  'a month-only plan is accepted through the RPC');

reset role;
select ok(
  (select plan_y = 2026 and plan_m = 3 and plan_d is null
     from public.books where id = 'ffffffff-0000-0000-0000-000000000005'),
  'a month-only plan lands as y+m with the day still NULL — no fabricated day');

-- ── 4. The loser is still gone ──────────────────────────────────────────────────────────────────
-- Cheap, but it keeps every assertion above honest: they would all pass trivially if the RPC had
-- quietly stopped doing its actual job.
select is(
  (select count(*)::int from public.books
    where id in ('ffffffff-0000-0000-0000-000000000002', 'ffffffff-0000-0000-0000-000000000004',
                 'ffffffff-0000-0000-0000-000000000006', 'ffffffff-0000-0000-0000-000000000008')),
  0,
  'every loser row is deleted — the merges above really merged');

select * from finish();
rollback;
