-- merge_books and the plan trio (feat/plan-precision-merge). The property under test is the one the
-- old `case when p_fields ? 'plan_date'` did not have: a merge can ADD a plan to a book that lacks
-- one, and can never REMOVE or rewrite one that a book already has.
--
-- WHY A NULL INCOMING PLAN IS THE CENTRAL CASE. Every assertion below that matters sends
-- `plan_y: null` (or omits it) while the primary has a stored plan. Under the replaced expression
-- that combination wrote null over the stored value — the key was always present, so the `case`
-- always fired. Under `take_plan` it cannot, because `take_plan` is false the moment the primary has
-- a plan. `pub_*` was always immune to this input via `coalesce`; the plan was not.
--
-- ASSERTIONS READ AS THE SESSION ROLE, THE RPC RUNS AS `authenticated`. Same reason
-- series_removal_test.sql gives: a books row invisible to the querying role under RLS reads
-- identically to an unmodified one for a whole class of assertion shapes. Only the calls are
-- role-scoped; every check runs after `reset role`, where nothing is filtered.

begin;
select plan(12);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('aaaaaaaa-5555-5555-5555-555555555555', 'authenticated', 'authenticated',
        'merge-plan@example.com', '{}'::jsonb, '{}'::jsonb, now(), now());

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-5555-5555-5555-555555555555","role":"authenticated"}', true);

-- ── 1. A plan survives a merge whose incoming fields carry none ─────────────────────────────────
-- The regression. Primary holds a full plan; the merge sends an all-null one, exactly as a stale
-- client would. Nothing about the plan may change.
insert into public.books (id, owner_id, title, plan_y, plan_m, plan_d, plan_date)
values ('ffffffff-0000-0000-0000-000000000001', 'aaaaaaaa-5555-5555-5555-555555555555',
        'Keeper', 2026, 3, 14, date '2026-03-14');
insert into public.books (id, owner_id, title)
values ('ffffffff-0000-0000-0000-000000000002', 'aaaaaaaa-5555-5555-5555-555555555555', 'Dupe');

select lives_ok(
  $$ select public.merge_books(
       'ffffffff-0000-0000-0000-000000000001',
       'ffffffff-0000-0000-0000-000000000002',
       '{"title":"Keeper","plan_y":null,"plan_m":null,"plan_d":null,"plan_date":null}'::jsonb) $$,
  'a merge sending an all-null plan is accepted');

reset role;
select is(
  (select plan_y::text || '-' || plan_m::text || '-' || plan_d::text
     from public.books where id = 'ffffffff-0000-0000-0000-000000000001'),
  '2026-3-14',
  'the primary KEEPS its plan when the merge carries none — the defect this replaces');

select ok(
  (select plan_date = date '2026-03-14' from public.books where id = 'ffffffff-0000-0000-0000-000000000001'),
  'plan_date is kept in step with the trio, not cleared alongside it');

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
       '{"title":"Blank Primary","plan_y":2027,"plan_m":1,"plan_d":5,"plan_date":"2027-01-05"}'::jsonb) $$,
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
       '{"title":"Month Primary","plan_y":2026,"plan_m":3,"plan_d":null,"plan_date":null}'::jsonb) $$,
  'a month-only plan is accepted through the RPC');

reset role;
select ok(
  (select plan_y = 2026 and plan_m = 3 and plan_d is null
     from public.books where id = 'ffffffff-0000-0000-0000-000000000005'),
  'a month-only plan lands as y+m with the day still NULL — no fabricated day');

select ok(
  (select plan_date is null from public.books where id = 'ffffffff-0000-0000-0000-000000000005'),
  'a month-only plan writes NO plan_date — a bare date cannot say "March, no day", so it says nothing');

-- ── 4. A legacy plan_date-only row counts as HAVING a plan ──────────────────────────────────────
-- The dual-representation window: a row written by the not-yet-updated app carries plan_date with an
-- empty trio. Keying `take_plan` on plan_y alone would read that as "no plan" and overwrite a real
-- one. This is the assertion that fails if the `plan_date is null` half of the condition is dropped.
set local role authenticated;
insert into public.books (id, owner_id, title, plan_date)
values ('ffffffff-0000-0000-0000-000000000007', 'aaaaaaaa-5555-5555-5555-555555555555',
        'Legacy Primary', date '2025-12-01');
insert into public.books (id, owner_id, title)
values ('ffffffff-0000-0000-0000-000000000008', 'aaaaaaaa-5555-5555-5555-555555555555', 'Legacy Dupe');

select lives_ok(
  $$ select public.merge_books(
       'ffffffff-0000-0000-0000-000000000007',
       'ffffffff-0000-0000-0000-000000000008',
       '{"title":"Legacy Primary","plan_y":2030,"plan_m":6,"plan_d":9,"plan_date":"2030-06-09"}'::jsonb) $$,
  'a merge against a legacy plan_date-only primary is accepted');

reset role;
select ok(
  (select plan_date = date '2025-12-01' from public.books where id = 'ffffffff-0000-0000-0000-000000000007'),
  'a legacy plan_date-only plan is NOT overwritten — plan_date alone still counts as having a plan');

select is(
  (select count(*)::int from public.books
    where id = 'ffffffff-0000-0000-0000-000000000007' and plan_y is null and plan_m is null and plan_d is null),
  1,
  'and the incoming trio does not land beside it, which would leave two disagreeing plans on one row');

-- ── 5. The loser is still gone ──────────────────────────────────────────────────────────────────
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
