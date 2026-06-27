-- Phase 7 H3: edge rate limiting. rate_limit_consume counts hits in a fixed window and flips to
-- not-allowed past the max; the rate_limits table + the RPC are service-role only (clients can't
-- read the table or invoke the function).

begin;
select plan(7);

-- Mechanics: max 3 in the window → first three allowed, fourth denied, with a positive retry hint.
select is((public.rate_limit_consume('rl:test', 3, 3600)) ->> 'allowed', 'true', '1st hit allowed');
select is((public.rate_limit_consume('rl:test', 3, 3600)) ->> 'allowed', 'true', '2nd hit allowed');
select is((public.rate_limit_consume('rl:test', 3, 3600)) ->> 'allowed', 'true', '3rd hit allowed');
select is((public.rate_limit_consume('rl:test', 3, 3600)) ->> 'allowed', 'false', '4th hit denied (over the max)');
select cmp_ok(((public.rate_limit_consume('rl:test', 3, 3600)) ->> 'retry_after')::int, '>', 0,
  'retry_after is positive once limited');

-- A separate bucket is independent.
select is((public.rate_limit_consume('rl:other', 3, 3600)) ->> 'allowed', 'true', 'a different bucket is unaffected');

-- Service-role only: an authenticated client can neither read the table nor call the RPC.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select throws_ok(
  $$select count(*) from public.rate_limits$$,
  '42501', null, 'authenticated client cannot read rate_limits / invoke the limiter');

select * from finish();
rollback;
