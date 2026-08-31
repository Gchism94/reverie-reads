begin;
select plan(12);

-- Reproduce the legacy production project's new-table auto-exposure, then execute the migration's
-- ACL repair. The dirty positive precondition prevents a clean local default from proving nothing.
grant select, insert, update, delete on table public.work_series_suggestions
  to public, anon, authenticated;

revoke all privileges on table public.work_series_suggestions
  from public, anon, authenticated, service_role;
grant select on table public.work_series_suggestions to authenticated;
grant all privileges on table public.work_series_suggestions to service_role;

select ok(not has_table_privilege('anon', 'public.work_series_suggestions', 'SELECT'),
  'anon cannot select corpus series suggestions');
select ok(not has_table_privilege('anon', 'public.work_series_suggestions', 'INSERT'),
  'anon cannot insert corpus series suggestions');
select ok(not has_table_privilege('anon', 'public.work_series_suggestions', 'UPDATE'),
  'anon cannot update corpus series suggestions');
select ok(not has_table_privilege('anon', 'public.work_series_suggestions', 'DELETE'),
  'anon cannot delete corpus series suggestions');

select ok(has_table_privilege('authenticated', 'public.work_series_suggestions', 'SELECT'),
  'authenticated can reach the RLS-filtered administrator read');
select ok(not has_table_privilege('authenticated', 'public.work_series_suggestions', 'INSERT'),
  'authenticated cannot insert corpus series suggestions directly');
select ok(not has_table_privilege('authenticated', 'public.work_series_suggestions', 'UPDATE'),
  'authenticated cannot update corpus series suggestions directly');
select ok(not has_table_privilege('authenticated', 'public.work_series_suggestions', 'DELETE'),
  'authenticated cannot delete corpus series suggestions directly');

select ok(has_table_privilege('service_role', 'public.work_series_suggestions', 'SELECT'),
  'service role can select corpus series suggestions');
select ok(has_table_privilege('service_role', 'public.work_series_suggestions', 'INSERT'),
  'service role can insert corpus series suggestions');
select ok(has_table_privilege('service_role', 'public.work_series_suggestions', 'UPDATE'),
  'service role can update corpus series suggestions');
select ok(has_table_privilege('service_role', 'public.work_series_suggestions', 'DELETE'),
  'service role can delete corpus series suggestions');

select * from finish();
rollback;
