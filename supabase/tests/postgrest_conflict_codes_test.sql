-- Application conflicts must return once. SQLSTATE 40001 tells PostgREST that the whole
-- transaction is retryable and can turn a permanent stale-context refusal into an infinite loop.
begin;
select plan(3);

select is(
  (
    select count(*)::int
    from pg_proc function
    join pg_namespace namespace on namespace.oid = function.pronamespace
    where namespace.nspname = 'public' and function.prosrc like '%40001%'
  ),
  0,
  'no public function misclassifies an application conflict as a serialization failure'
);

select is(
  (
    select count(*)::int
    from pg_proc function
    join pg_namespace namespace on namespace.oid = function.pronamespace
    where namespace.nspname = 'public' and function.prosrc like '%PT409%'
  ),
  23,
  'all twenty-three conflict-bearing functions return a bounded HTTP conflict'
);

select is(
  (
    select sum(regexp_count(function.prosrc, 'PT409'))::int
    from pg_proc function
    join pg_namespace namespace on namespace.oid = function.pronamespace
    where namespace.nspname = 'public'
  ),
  29,
  'all twenty-nine remaining stale-context paths use the non-retryable conflict code'
);

select * from finish();
rollback;
