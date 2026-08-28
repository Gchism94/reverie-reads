begin;
select plan(12);

-- Reproduce the legacy production project's auto-exposure before re-running the idempotent repair.
-- Without this positive precondition, the newer local default would make every negative assertion
-- pass even if the migration forgot its revokes.
grant select, insert, update, delete on table public.work_tropes
  to public, anon, authenticated;

-- Keep this executable repair paired with the source-contract test for the migration file. The
-- Supabase pgTAP container mounts tests independently and cannot include a sibling migration file.
revoke all privileges on table public.work_tropes
  from public, anon, authenticated, service_role;
grant select on table public.work_tropes to authenticated;
grant all privileges on table public.work_tropes to service_role;

select ok(
  not has_table_privilege('anon', 'public.work_tropes', 'SELECT'),
  'anon cannot select canonical work-trope associations'
);
select ok(
  not has_table_privilege('anon', 'public.work_tropes', 'INSERT'),
  'anon cannot insert canonical work-trope associations'
);
select ok(
  not has_table_privilege('anon', 'public.work_tropes', 'UPDATE'),
  'anon cannot update canonical work-trope associations'
);
select ok(
  not has_table_privilege('anon', 'public.work_tropes', 'DELETE'),
  'anon cannot delete canonical work-trope associations'
);

select ok(
  has_table_privilege('authenticated', 'public.work_tropes', 'SELECT'),
  'authenticated readers can select canonical work-trope associations'
);
select ok(
  not has_table_privilege('authenticated', 'public.work_tropes', 'INSERT'),
  'authenticated readers cannot insert canonical work-trope associations'
);
select ok(
  not has_table_privilege('authenticated', 'public.work_tropes', 'UPDATE'),
  'authenticated readers cannot update canonical work-trope associations'
);
select ok(
  not has_table_privilege('authenticated', 'public.work_tropes', 'DELETE'),
  'authenticated readers cannot delete canonical work-trope associations'
);

select ok(
  has_table_privilege('service_role', 'public.work_tropes', 'SELECT'),
  'service role can select canonical work-trope associations'
);
select ok(
  has_table_privilege('service_role', 'public.work_tropes', 'INSERT'),
  'service role can insert canonical work-trope associations'
);
select ok(
  has_table_privilege('service_role', 'public.work_tropes', 'UPDATE'),
  'service role can update canonical work-trope associations'
);
select ok(
  has_table_privilege('service_role', 'public.work_tropes', 'DELETE'),
  'service role can delete canonical work-trope associations'
);

select * from finish();
rollback;
