begin;
select plan(72);

-- Reproduce the legacy production project's auto-exposure before re-running the forward repair.
-- The positive dirty state ensures the local platform default cannot make the revokes pass vacuously.
grant select, insert, update, delete on table
  public.households,
  public.household_members,
  public.household_works,
  public.household_book_shares,
  public.household_work_enrichment,
  public.work_metadata_edits
  to public, anon, authenticated;

-- Keep this executable copy paired with the migration source-contract assertion. pgTAP files run
-- independently and cannot include a sibling migration from the repository filesystem.
revoke all privileges on table public.households, public.household_members,
  public.household_works, public.household_book_shares, public.household_work_enrichment,
  public.work_metadata_edits
  from public, anon, authenticated, service_role;
grant select on table public.households, public.household_members to authenticated;
grant all privileges on table public.households, public.household_members,
  public.household_works, public.household_book_shares, public.household_work_enrichment,
  public.work_metadata_edits
  to service_role;

with expected(table_name, auth_select) as (
  values
    ('households', true),
    ('household_members', true),
    ('household_works', false),
    ('household_book_shares', false),
    ('household_work_enrichment', false),
    ('work_metadata_edits', false)
), roles(role_name) as (
  values ('anon'), ('authenticated'), ('service_role')
), operations(operation) as (
  values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')
)
select ok(
  has_table_privilege(
    roles.role_name,
    format('public.%I', expected.table_name),
    operations.operation
  ) = case
    when roles.role_name = 'service_role' then true
    when roles.role_name = 'authenticated' and operations.operation = 'SELECT'
      then expected.auth_select
    else false
  end,
  format(
    '%s %s on public.%s matches the explicit API privilege matrix',
    roles.role_name,
    lower(operations.operation),
    expected.table_name
  )
)
from expected
cross join roles
cross join operations
order by expected.table_name, roles.role_name, operations.operation;

select * from finish();
rollback;
