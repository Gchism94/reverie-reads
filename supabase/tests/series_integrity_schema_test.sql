-- series.length — Phase 1 of feat/series-integrity-mechanism
-- (20260813010000_series_integrity_schema.sql).
--
-- SPLIT IN PHASE 2 alongside its migration: the partial unique index moved to
-- 20260816010000_series_position_uidx.sql, and its assertions moved with it to
-- series_position_uidx_test.sql. A test file that outlived the migration it covers would
-- have gone on passing against whichever half happened to be deployed.
--
-- WHAT THIS COVERS. `series.length` with check (length >= 1). The boundary must surface as
-- SQLSTATE 23514 (check_violation), not as a body-level or mocked approximation.
--
-- Role shape per the standing testing rules: writes run as `authenticated` (the real client
-- role, RLS active — the path production writers take), value assertions run after
-- `reset role` so RLS can never hide a row and collapse `is(x, expected)` into a two-NULLs
-- false positive; where NULL is the expected value, `ok(x is null)` is used so a missing row
-- fails loudly instead of comparing NULL = NULL.

begin;
select plan(6);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('99999999-1111-2222-3333-444444444444', 'authenticated', 'authenticated',
        'series-integrity@example.com', '{}'::jsonb, '{}'::jsonb, now(), now());

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"99999999-1111-2222-3333-444444444444","role":"authenticated"}', true);

insert into public.series (id, owner_id, name)
values ('aaaa1111-0000-0000-0000-000000000001', '99999999-1111-2222-3333-444444444444', 'Integrity Saga');

-- ── series.length boundary ──────────────────────────────────────────────────────────────
select throws_ok(
  $$update public.series set length = 0 where id = 'aaaa1111-0000-0000-0000-000000000001'$$,
  '23514', null, 'length 0 rejected as 23514');

select throws_ok(
  $$update public.series set length = -3 where id = 'aaaa1111-0000-0000-0000-000000000001'$$,
  '23514', null, 'length -3 rejected as 23514');

select lives_ok(
  $$update public.series set length = 5 where id = 'aaaa1111-0000-0000-0000-000000000001'$$,
  'length 5 accepted');

reset role;

select is(
  (select length::int from public.series where id = 'aaaa1111-0000-0000-0000-000000000001'),
  5, 'length 5 stored');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"99999999-1111-2222-3333-444444444444","role":"authenticated"}', true);

select lives_ok(
  $$update public.series set length = null where id = 'aaaa1111-0000-0000-0000-000000000001'$$,
  'length null accepted — null means "not set", outside the check');

reset role;

select ok(
  (select length from public.series where id = 'aaaa1111-0000-0000-0000-000000000001') is null,
  'length null stored — ok(x is null), so a missing row fails instead of comparing NULL = NULL');

select * from finish();
rollback;
