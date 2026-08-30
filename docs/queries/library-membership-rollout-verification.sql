-- Owner-run, read-only verification for the membership/corpus rollout through the forward-only
-- 20260905010000 household-cover administrator review and recovery repair.
--
-- Paste this whole file into the production Supabase SQL Editor and run it. It returns catalog
-- metadata and aggregate counts only: no titles, account ids, library rows, or private annotations.
-- Every row must report ok = true before the private reconciliation dry run is approved. The
-- runtime administrator assignment check deliberately fails after a clean schema-only migration:
-- run the owner-reviewed corpus:admins operator before treating this as a rollout pass.
-- Before 20260905010000 receives independent review and an owner-run deployment, its migration and
-- exact household-cover review RPC are expected blockers; do not approve a partial result.
--
-- This verifies CURRENT postconditions, not the historical migration event. Without a verified
-- pre-migration snapshot it cannot prove that the backfill chose the same corpus identity each
-- legacy row would have chosen before deployment, preserved the former updated_at/enriched_at
-- values, preserved pre-existing row counts and private annotations, or stayed within its intended
-- production runtime. Those are pre/post or execution-history claims; current schema state cannot
-- reconstruct them after the fact.

with
expected_migrations(version) as (
  values
    ('20260830010000'), ('20260831010000'), ('20260901010000'), ('20260902010000'),
    ('20260903010000'), ('20260904010000'), ('20260905010000')
),
expected_triggers(schema_name, table_name, trigger_name) as (
  values
    ('public', 'works', 'works_validate_isbn_assignment'),
    ('public', 'works', 'works_preserve_authenticated_cover_options'),
    ('public', 'books', 'books_ensure_corpus_work'),
    ('public', 'books', 'books_validate_corpus_rebind'),
    ('public', 'household_work_enrichment', 'household_work_enrichment_set_updated_at'),
    ('public', 'books', 'books_sync_owned_household_work'),
    ('public', 'household_members', 'household_members_sync_owned_books'),
    ('public', 'books', 'books_sync_household_enrichment'),
    ('public', 'book_tropes', 'book_tropes_sync_household_enrichment'),
    ('public', 'book_tropes', 'book_tropes_promote_admin_to_corpus'),
    ('public', 'household_work_enrichment', 'household_tropes_promote_admin_to_corpus'),
    ('public', 'books', 'books_preserve_objective_metadata_before_delete'),
    ('auth', 'users', 'auth_users_preserve_account_books_before_delete')
),
expected_functions(
  signature,
  security_definer,
  anon_execute,
  authenticated_execute,
  service_execute
) as (
  values
    -- Immutable index helper: service-managed corpus inserts need only this narrow direct grant.
    ('public.library_work_key(text,text)', false, false, false, true),
    -- Internal checksum guard: household creation calls it through its definer boundary only.
    ('public.library_isbn_checksum_is_valid(text)', false, false, false, false),
    -- Internal owner fences: callable only from their security-definer parents.
    ('public.lock_library_book_owner_insert(uuid)', true, false, false, false),
    ('public.lock_library_book_owners_reconciliation(uuid[])', true, false, false, false),
    -- Authenticated reader/admin RPCs.
    -- Retained compatibility tombstone: the UUID-only form cannot bind the reviewed gesture.
    ('public.admin_review_personal_cover_for_corpus(uuid)', true, false, false, false),
    ('public.admin_review_personal_cover_for_corpus(uuid,uuid,text)', true, false, true, false),
    ('public.admin_review_household_cover_for_corpus(uuid,uuid,uuid,text)', true, false, true, false),
    -- Trigger-only accepted-option guard: no API role calls it directly.
    ('public.preserve_authenticated_corpus_cover_options()', false, false, false, false),
    ('public.add_personal_book_to_household(uuid)', true, false, true, false),
    ('public.remove_personal_book_from_household(uuid)', true, false, true, false),
    ('public.remove_household_work(uuid)', true, false, true, false),
    ('public.remove_personal_book(uuid)', true, false, true, false),
    ('public.restore_personal_book(uuid)', true, false, true, false),
    ('public.update_household_work_enrichment(uuid,text[],jsonb)', true, false, true, false),
    -- Retained internal implementation: authenticated callers must use the owner/admin wrapper.
    ('public.update_corpus_work_metadata(uuid,text,text,text[],text[],text,jsonb)', true, false, false, false),
    ('public.can_edit_corpus_work(uuid)', true, false, true, false),
    ('public.add_corpus_work_to_household(uuid)', true, false, true, false),
    ('public.create_household_catalog_work(text,text,text,text,text)', true, false, true, false),
    ('public.edit_corpus_work_metadata(uuid,text,numeric,integer,text,text,text,text[],text[],text,jsonb,integer,integer,integer)', true, false, true, false),
    ('public.set_corpus_work_cover(uuid,text,text,text,text)', true, false, true, false),
    ('public.adopt_corpus_work_metadata(uuid)', true, false, true, false),
    ('public.household_library_works()', true, false, true, false),
    ('public.household_library_books()', true, false, true, false),
    ('public.is_corpus_admin()', true, false, true, false),
    ('public.complete_corpus_work_metadata(uuid,jsonb,timestamp with time zone)', true, false, true, false),
    ('public.admin_add_corpus_work_trope(uuid,text,text)', true, false, true, false),
    ('public.admin_recover_personal_corpus_covers()', true, false, true, false),
    -- Cross-account reconciliation is owner-operated through service_role only.
    ('public.reconcile_household_library_memberships(uuid,jsonb,uuid[],uuid[],text,text)', true, false, false, true)
),
migration_checks as (
  select
    'migration'::text as area,
    m.version as invariant,
    'recorded'::text as expected,
    case when sm.version is null then 'missing' else 'recorded' end as observed,
    sm.version is not null as ok
  from expected_migrations m
  left join supabase_migrations.schema_migrations sm on sm.version = m.version
),
binding_checks as (
  select
    'personal binding'::text as area,
    'books.corpus_work_id is schema-NOT-NULL'::text as invariant,
    'true'::text as expected,
    coalesce((
      select a.attnotnull::text
      from pg_catalog.pg_attribute a
      where a.attrelid = 'public.books'::regclass
        and a.attname = 'corpus_work_id'
        and not a.attisdropped
    ), 'missing') as observed,
    coalesce((
      select a.attnotnull
      from pg_catalog.pg_attribute a
      where a.attrelid = 'public.books'::regclass
        and a.attname = 'corpus_work_id'
        and not a.attisdropped
    ), false) as ok
  union all
  select
    'personal binding',
    'personal rows with null corpus binding',
    '0',
    count(*)::text,
    count(*) = 0
  from public.books b
  where b.corpus_work_id is null
  union all
  select
    'personal binding',
    'personal rows with dangling corpus binding',
    '0',
    count(*)::text,
    count(*) = 0
  from public.books b
  left join public.works w on w.id = b.corpus_work_id
  where w.id is null
  union all
  select
    'personal binding',
    'books.corpus_work_id foreign key to works',
    'present',
    case when count(*) > 0 then 'present' else 'missing' end,
    count(*) > 0
  from pg_catalog.pg_constraint c
  where c.conrelid = 'public.books'::regclass
    and c.confrelid = 'public.works'::regclass
    and c.contype = 'f'
    and cardinality(c.conkey) = 1
    and (
      select a.attnum
      from pg_catalog.pg_attribute a
      where a.attrelid = 'public.books'::regclass and a.attname = 'corpus_work_id'
    ) = any(c.conkey)
),
trigger_checks as (
  select
    'trigger'::text as area,
    format('%I.%I.%I', e.schema_name, e.table_name, e.trigger_name) as invariant,
    'enabled'::text as expected,
    coalesce(string_agg(t.tgenabled::text, ',' order by t.oid), 'missing') as observed,
    count(t.oid) = 1 and bool_and(t.tgenabled = 'O') as ok
  from expected_triggers e
  left join pg_catalog.pg_namespace n on n.nspname = e.schema_name
  left join pg_catalog.pg_class c on c.relnamespace = n.oid and c.relname = e.table_name
  left join pg_catalog.pg_trigger t
    on t.tgrelid = c.oid and t.tgname = e.trigger_name and not t.tgisinternal
  group by e.schema_name, e.table_name, e.trigger_name
),
retired_trigger_checks as (
  select
    'trigger'::text as area,
    format('public.books.%s', retired.trigger_name)::text as invariant,
    'absent'::text as expected,
    case when count(t.oid) = 0 then 'absent' else 'present' end as observed,
    count(t.oid) = 0 as ok
  from (values
    ('books_sync_objective_metadata_to_corpus'),
    ('books_promote_admin_cover_after_insert'),
    ('books_promote_admin_cover_after_update')
  ) retired(trigger_name)
  left join pg_catalog.pg_trigger t
    on t.tgrelid = 'public.books'::regclass
   and t.tgname = retired.trigger_name
   and not t.tgisinternal
  group by retired.trigger_name
),
resolved_functions as (
  select e.*, pg_catalog.to_regprocedure(e.signature) as function_oid
  from expected_functions e
),
function_checks as (
  select
    'function privilege'::text as area,
    f.signature as invariant,
    format(
      'security-definer=%s; anon=%s authenticated=%s service_role=%s',
      f.security_definer, f.anon_execute, f.authenticated_execute, f.service_execute
    ) as expected,
    case when f.function_oid is null then 'missing' else format(
      'security-definer=%s; anon=%s authenticated=%s service_role=%s',
      p.prosecdef,
      pg_catalog.has_function_privilege('anon', f.function_oid, 'execute'),
      pg_catalog.has_function_privilege('authenticated', f.function_oid, 'execute'),
      pg_catalog.has_function_privilege('service_role', f.function_oid, 'execute')
    ) end as observed,
    f.function_oid is not null
      and p.prosecdef = f.security_definer
      and pg_catalog.has_function_privilege('anon', f.function_oid, 'execute') = f.anon_execute
      and pg_catalog.has_function_privilege('authenticated', f.function_oid, 'execute') = f.authenticated_execute
      and pg_catalog.has_function_privilege('service_role', f.function_oid, 'execute') = f.service_execute
      as ok
  from resolved_functions f
  left join pg_catalog.pg_proc p on p.oid = f.function_oid
),
owner_fence_checks as (
  select
    'owner fence'::text as area,
    'personal insert acquires shared owner fence'::text as invariant,
    'present'::text as expected,
    case when position(
      'lock_library_book_owner_insert(new.owner_id)'
      in pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.ensure_book_corpus_work()')
      )
    ) > 0 then 'present' else 'missing' end as observed,
    coalesce(position(
      'lock_library_book_owner_insert(new.owner_id)'
      in pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure('public.ensure_book_corpus_work()')
      )
    ) > 0, false) as ok
  union all
  select
    'owner fence',
    'reconciliation acquires exclusive reviewed-owner fences',
    'present',
    case when position(
      'lock_library_book_owners_reconciliation(assigned_accounts)'
      in pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'public.reconcile_household_library_memberships(uuid,jsonb,uuid[],uuid[],text,text)'
        )
      )
    ) > 0 then 'present' else 'missing' end,
    coalesce(position(
      'lock_library_book_owners_reconciliation(assigned_accounts)'
      in pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'public.reconcile_household_library_memberships(uuid,jsonb,uuid[],uuid[],text,text)'
        )
      )
    ) > 0, false)
),
table_privilege_checks as (
  select
    'table privilege'::text as area,
    'public.corpus_admins'::text as invariant,
    'anon=none authenticated=none service_role=all'::text as expected,
    format(
      'anon=%s authenticated=%s service_role=%s',
      pg_catalog.has_table_privilege('anon', 'public.corpus_admins', 'select')
        or pg_catalog.has_table_privilege('anon', 'public.corpus_admins', 'insert')
        or pg_catalog.has_table_privilege('anon', 'public.corpus_admins', 'update')
        or pg_catalog.has_table_privilege('anon', 'public.corpus_admins', 'delete'),
      pg_catalog.has_table_privilege('authenticated', 'public.corpus_admins', 'select')
        or pg_catalog.has_table_privilege('authenticated', 'public.corpus_admins', 'insert')
        or pg_catalog.has_table_privilege('authenticated', 'public.corpus_admins', 'update')
        or pg_catalog.has_table_privilege('authenticated', 'public.corpus_admins', 'delete'),
      pg_catalog.has_table_privilege('service_role', 'public.corpus_admins', 'select')
        and pg_catalog.has_table_privilege('service_role', 'public.corpus_admins', 'insert')
        and pg_catalog.has_table_privilege('service_role', 'public.corpus_admins', 'update')
        and pg_catalog.has_table_privilege('service_role', 'public.corpus_admins', 'delete')
    ) as observed,
    not (
      pg_catalog.has_table_privilege('anon', 'public.corpus_admins', 'select')
      or pg_catalog.has_table_privilege('anon', 'public.corpus_admins', 'insert')
      or pg_catalog.has_table_privilege('anon', 'public.corpus_admins', 'update')
      or pg_catalog.has_table_privilege('anon', 'public.corpus_admins', 'delete')
    )
      and not (
        pg_catalog.has_table_privilege('authenticated', 'public.corpus_admins', 'select')
        or pg_catalog.has_table_privilege('authenticated', 'public.corpus_admins', 'insert')
        or pg_catalog.has_table_privilege('authenticated', 'public.corpus_admins', 'update')
        or pg_catalog.has_table_privilege('authenticated', 'public.corpus_admins', 'delete')
      )
      and pg_catalog.has_table_privilege('service_role', 'public.corpus_admins', 'select')
      and pg_catalog.has_table_privilege('service_role', 'public.corpus_admins', 'insert')
      and pg_catalog.has_table_privilege('service_role', 'public.corpus_admins', 'update')
      and pg_catalog.has_table_privilege('service_role', 'public.corpus_admins', 'delete')
      as ok
  union all
  select
    'table privilege',
    'public.work_tropes',
    'anon S=f I=f U=f D=f; authenticated S=t I=f U=f D=f; service_role S=t I=t U=t D=t',
    format(
      'anon S=%s I=%s U=%s D=%s; authenticated S=%s I=%s U=%s D=%s; service_role S=%s I=%s U=%s D=%s',
      pg_catalog.has_table_privilege('anon', 'public.work_tropes', 'select'),
      pg_catalog.has_table_privilege('anon', 'public.work_tropes', 'insert'),
      pg_catalog.has_table_privilege('anon', 'public.work_tropes', 'update'),
      pg_catalog.has_table_privilege('anon', 'public.work_tropes', 'delete'),
      pg_catalog.has_table_privilege('authenticated', 'public.work_tropes', 'select'),
      pg_catalog.has_table_privilege('authenticated', 'public.work_tropes', 'insert'),
      pg_catalog.has_table_privilege('authenticated', 'public.work_tropes', 'update'),
      pg_catalog.has_table_privilege('authenticated', 'public.work_tropes', 'delete'),
      pg_catalog.has_table_privilege('service_role', 'public.work_tropes', 'select'),
      pg_catalog.has_table_privilege('service_role', 'public.work_tropes', 'insert'),
      pg_catalog.has_table_privilege('service_role', 'public.work_tropes', 'update'),
      pg_catalog.has_table_privilege('service_role', 'public.work_tropes', 'delete')
    ),
    not (
      pg_catalog.has_table_privilege('anon', 'public.work_tropes', 'select')
      or pg_catalog.has_table_privilege('anon', 'public.work_tropes', 'insert')
      or pg_catalog.has_table_privilege('anon', 'public.work_tropes', 'update')
      or pg_catalog.has_table_privilege('anon', 'public.work_tropes', 'delete')
    )
      and pg_catalog.has_table_privilege('authenticated', 'public.work_tropes', 'select')
      and not (
        pg_catalog.has_table_privilege('authenticated', 'public.work_tropes', 'insert')
        or pg_catalog.has_table_privilege('authenticated', 'public.work_tropes', 'update')
        or pg_catalog.has_table_privilege('authenticated', 'public.work_tropes', 'delete')
      )
      and pg_catalog.has_table_privilege('service_role', 'public.work_tropes', 'select')
      and pg_catalog.has_table_privilege('service_role', 'public.work_tropes', 'insert')
      and pg_catalog.has_table_privilege('service_role', 'public.work_tropes', 'update')
      and pg_catalog.has_table_privilege('service_role', 'public.work_tropes', 'delete')
),
runtime_assignment_checks as (
  select
    'runtime assignment'::text as area,
    'public.corpus_admins'::text as invariant,
    'at least one service-reviewed administrator'::text as expected,
    format('%s assigned', count(*)) as observed,
    count(*) > 0 as ok
  from public.corpus_admins
),
household_table_privilege_checks as (
  select
    'table privilege'::text as area,
    format('public.%s', expected.table_name) as invariant,
    format(
      'anon S=f I=f U=f D=f; authenticated S=%s I=f U=f D=f; service_role S=t I=t U=t D=t',
      expected.auth_select
    ) as expected,
    format(
      'anon S=%s I=%s U=%s D=%s; authenticated S=%s I=%s U=%s D=%s; service_role S=%s I=%s U=%s D=%s',
      pg_catalog.has_table_privilege('anon', format('public.%I', expected.table_name), 'select'),
      pg_catalog.has_table_privilege('anon', format('public.%I', expected.table_name), 'insert'),
      pg_catalog.has_table_privilege('anon', format('public.%I', expected.table_name), 'update'),
      pg_catalog.has_table_privilege('anon', format('public.%I', expected.table_name), 'delete'),
      pg_catalog.has_table_privilege('authenticated', format('public.%I', expected.table_name), 'select'),
      pg_catalog.has_table_privilege('authenticated', format('public.%I', expected.table_name), 'insert'),
      pg_catalog.has_table_privilege('authenticated', format('public.%I', expected.table_name), 'update'),
      pg_catalog.has_table_privilege('authenticated', format('public.%I', expected.table_name), 'delete'),
      pg_catalog.has_table_privilege('service_role', format('public.%I', expected.table_name), 'select'),
      pg_catalog.has_table_privilege('service_role', format('public.%I', expected.table_name), 'insert'),
      pg_catalog.has_table_privilege('service_role', format('public.%I', expected.table_name), 'update'),
      pg_catalog.has_table_privilege('service_role', format('public.%I', expected.table_name), 'delete')
    ) as observed,
    not (
      pg_catalog.has_table_privilege('anon', format('public.%I', expected.table_name), 'select')
      or pg_catalog.has_table_privilege('anon', format('public.%I', expected.table_name), 'insert')
      or pg_catalog.has_table_privilege('anon', format('public.%I', expected.table_name), 'update')
      or pg_catalog.has_table_privilege('anon', format('public.%I', expected.table_name), 'delete')
    )
      and pg_catalog.has_table_privilege(
        'authenticated', format('public.%I', expected.table_name), 'select'
      ) = expected.auth_select
      and not (
        pg_catalog.has_table_privilege('authenticated', format('public.%I', expected.table_name), 'insert')
        or pg_catalog.has_table_privilege('authenticated', format('public.%I', expected.table_name), 'update')
        or pg_catalog.has_table_privilege('authenticated', format('public.%I', expected.table_name), 'delete')
      )
      and pg_catalog.has_table_privilege('service_role', format('public.%I', expected.table_name), 'select')
      and pg_catalog.has_table_privilege('service_role', format('public.%I', expected.table_name), 'insert')
      and pg_catalog.has_table_privilege('service_role', format('public.%I', expected.table_name), 'update')
      and pg_catalog.has_table_privilege('service_role', format('public.%I', expected.table_name), 'delete')
      as ok
  from (values
    ('households', true),
    ('household_members', true),
    ('household_works', false),
    ('household_book_shares', false),
    ('household_work_enrichment', false),
    ('work_metadata_edits', false)
  ) expected(table_name, auth_select)
),
rls_checks as (
  select
    'row-level security'::text as area,
    format('public.%s', e.table_name) as invariant,
    'enabled'::text as expected,
    case when c.oid is null then 'missing' else c.relrowsecurity::text end as observed,
    coalesce(c.relrowsecurity, false) as ok
  from (values
    ('corpus_admins'),
    ('work_tropes'),
    ('households'),
    ('household_members'),
    ('household_works'),
    ('household_book_shares'),
    ('household_work_enrichment'),
    ('work_metadata_edits')
  ) as e(table_name)
  left join pg_catalog.pg_class c
    on c.relnamespace = 'public'::regnamespace and c.relname = e.table_name
),
checks as (
  select * from migration_checks
  union all select * from binding_checks
  union all select * from trigger_checks
  union all select * from retired_trigger_checks
  union all select * from function_checks
  union all select * from owner_fence_checks
  union all select * from table_privilege_checks
  union all select * from runtime_assignment_checks
  union all select * from household_table_privilege_checks
  union all select * from rls_checks
)
select area, invariant, expected, observed, ok
from checks
order by ok, area, invariant;
