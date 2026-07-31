-- The body refuses, not the grant.
--
-- EVERY REFUSAL BELOW IS ASSERTED WITH anon HOLDING EXECUTE. The test GRANTS anon exactly what the
-- platform bulk grant gave it in production, and only then asserts the call is refused. That is the
-- entire point and the only assertion shape that tests what this branch changed: assert a refusal
-- while the grant is revoked and you have proven the grant works, which was never in doubt — it is
-- the thing that got silently undone. A body guard is the claim; the grant must be OUT OF THE WAY
-- for the claim to be tested at all.
--
-- Concretely: if these guards were deleted and only the ACL restored, every assertion here would
-- fail, because the grant issued at the top of this file would let anon straight through.
--
-- The grants are made inside the transaction and rolled back with everything else, so this file
-- leaves the database's real ACL untouched.
--
-- SQLSTATE 42501 throughout, never a message match: `insufficient_privilege` is what the guards
-- raise, and it is also what a grant-layer refusal returns — so these tests would still pass if the
-- grant were doing the work, which is why the grant is deliberately removed as a variable first.

begin;
select plan(11);

-- A reader who exists, for the paths that need one.
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('aaaaaaaa-6161-6161-6161-616161616161', 'authenticated', 'authenticated',
        'body-defense@example.com', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.clubs (id, created_by, title, join_code, unit_type, unit_count)
values ('bbbbbbbb-6161-6161-6161-616161616161', 'aaaaaaaa-6161-6161-6161-616161616161',
        'Defense Club', 'secretcode', 'chapter', 12);

-- ── THE GRANT IS DELIBERATELY GIVEN TO anon ─────────────────────────────────────────────────────
-- Reproducing the production ACL exactly: named grants on every routine, on top of a surviving
-- PUBLIC revoke. From here on, nothing at the grant layer stands between anon and these functions.
grant execute on all routines in schema public to anon;
-- service_role too, for the positive half. `prune_rate_limits` is DORMANT in production — no caller,
-- no pg_cron schedule, and 20260801010000 deliberately left it granted to nobody but the owner. So a
-- bare `set role service_role` would be refused at the GRANT layer and prove nothing about the body.
-- Granting here (inside the rolled-back transaction) removes the ACL as a variable in BOTH
-- directions, which is the only way these assertions test the guard rather than the lock.
grant execute on all routines in schema public to service_role;

select is(
  (select count(*)::int from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'rate_limit_consume'
     and p.proacl::text like '%anon=X%'),
  1,
  'precondition: anon HOLDS execute on rate_limit_consume — the grant is not what refuses below');

-- ── 1. rate_limit_consume ───────────────────────────────────────────────────────────────────────
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$ select public.rate_limit_consume('hardcover:global', 60, 60) $$,
  '42501', null,
  'anon is refused by the BODY despite holding execute — the exposure that was live in production');

-- An authenticated reader is not privileged here either: this is infrastructure, not user data.
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-6161-6161-6161-616161616161","role":"authenticated"}', true);
select throws_ok(
  $$ select public.rate_limit_consume('hardcover:global', 60, 60) $$,
  '42501', null,
  'a signed-in reader is refused too — only service_role may consume');

-- ── 2. prune_rate_limits ────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$ select public.prune_rate_limits() $$,
  '42501', null,
  'anon cannot wipe limiter state, despite holding execute');

-- ── 3. join_club_by_code, and the ORACLE it used to be ──────────────────────────────────────────
-- Both codes must fail IDENTICALLY. Before this branch an invalid code returned NULL quietly while a
-- valid one raised a NOT NULL violation from club_members — and that difference told an
-- unauthenticated caller which join codes exist. Join codes are capability secrets.
select throws_ok(
  $$ select public.join_club_by_code('secretcode', 'Nobody') $$,
  '42501', null,
  'anon is refused on a VALID join code');

select throws_ok(
  $$ select public.join_club_by_code('nosuchcode', 'Nobody') $$,
  '42501', null,
  'anon is refused identically on an INVALID one — the enumeration oracle is closed');

-- ── 4. service_role still works — a guard that locks out its caller is worse than the gap ───────
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select lives_ok(
  $$ select public.rate_limit_consume('probe:allowed', 5, 60) $$,
  'service_role CAN consume — the three edge functions all call with SUPABASE_SERVICE_ROLE_KEY');

select is(
  (select (public.rate_limit_consume('probe:counting', 5, 60) ->> 'allowed'))::text,
  'true',
  'and it still returns a real verdict, not merely a non-error');

select lives_ok(
  $$ select public.prune_rate_limits() $$,
  'service_role can still prune');

-- ── 5. A signed-in reader can still join a club ─────────────────────────────────────────────────
-- The guard refuses an ABSENT reader, not every reader; the feature has to survive its own defence.
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-6161-6161-6161-616161616161","role":"authenticated"}', true);

select is(
  (select public.join_club_by_code('secretcode', 'A Reader')),
  'bbbbbbbb-6161-6161-6161-616161616161'::uuid,
  'a signed-in reader still joins by code — the guard blocks absence, not membership');

reset role;
select is(
  (select count(*)::int from public.club_members
    where club_id = 'bbbbbbbb-6161-6161-6161-616161616161'
      and user_id = 'aaaaaaaa-6161-6161-6161-616161616161'),
  1,
  'and the membership row really landed');

select * from finish();
rollback;
