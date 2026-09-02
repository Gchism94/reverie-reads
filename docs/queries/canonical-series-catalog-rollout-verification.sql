-- Owner-run, read-only verification for the canonical shared-series catalog rollout through
-- 20260920020000. Paste this whole file into the production Supabase SQL Editor after both
-- migrations are deployed. It returns schema metadata and aggregate counts only: no book titles,
-- account ids, source references, or private annotations. Every row must report ok = true.
--
-- This verifies current postconditions. It does not mutate the catalog, prove which pre-migration
-- source won a historical identity decision, or replace administrator review of ambiguous series.

with
expected_migrations(version) as (
  values ('20260920010000'), ('20260920020000')
),
expected_tables(table_name) as (
  values
    ('corpus_series'),
    ('corpus_series_names'),
    ('corpus_series_sources'),
    ('corpus_series_entries'),
    ('corpus_series_edits')
),
expected_functions(signature, authenticated_execute, service_execute) as (
  values
    ('public.corpus_series_identity_key(text)', false, true),
    ('public.sync_corpus_series_catalog_work(uuid,text)', false, false),
    ('public.sync_corpus_series_catalog_work_trigger()', false, false),
    ('public.update_corpus_series(uuid,bigint,text,text,integer,text[])', true, false),
    ('public.merge_corpus_series(uuid,uuid,bigint,bigint)', true, false),
    ('public.archive_corpus_series(uuid,bigint)', true, false),
    ('public.restore_corpus_series(uuid,bigint)', true, false),
    ('public.save_corpus_series_entry(uuid,bigint,uuid,text,text,numeric,text)', true, false),
    ('public.remove_corpus_series_entry(uuid,bigint)', true, false),
    ('public.list_archived_corpus_series()', true, false)
),
expected_triggers(table_name, trigger_name) as (
  values
    ('corpus_series', 'corpus_series_set_updated_at'),
    ('corpus_series_entries', 'corpus_series_entries_set_updated_at'),
    ('works', 'works_sync_corpus_series_catalog')
),
migration_checks as (
  select
    'migration'::text as area,
    e.version::text as invariant,
    'recorded'::text as expected,
    case when m.version is null then 'missing' else 'recorded' end as observed,
    m.version is not null as ok
  from expected_migrations e
  left join supabase_migrations.schema_migrations m on m.version = e.version
),
table_checks as (
  select
    'table'::text as area,
    format('public.%s exists', e.table_name) as invariant,
    'true'::text as expected,
    (c.oid is not null)::text as observed,
    c.oid is not null as ok
  from expected_tables e
  left join pg_catalog.pg_class c
    on c.relnamespace = 'public'::regnamespace
   and c.relname = e.table_name
   and c.relkind = 'r'
),
rls_checks as (
  select
    'row-level security'::text as area,
    format('public.%s enabled', e.table_name) as invariant,
    'true'::text as expected,
    coalesce(c.relrowsecurity::text, 'missing') as observed,
    coalesce(c.relrowsecurity, false) as ok
  from expected_tables e
  left join pg_catalog.pg_class c
    on c.relnamespace = 'public'::regnamespace
   and c.relname = e.table_name
   and c.relkind = 'r'
),
table_acl_checks as (
  select
    'table privilege'::text as area,
    format('public.%s exact API-role ACL', e.table_name) as invariant,
    'anon none; authenticated select; service all'::text as expected,
    format(
      'anon s/i/u/d=%s/%s/%s/%s; auth=%s/%s/%s/%s; service=%s/%s/%s/%s',
      pg_catalog.has_table_privilege('anon', format('public.%I', e.table_name), 'select'),
      pg_catalog.has_table_privilege('anon', format('public.%I', e.table_name), 'insert'),
      pg_catalog.has_table_privilege('anon', format('public.%I', e.table_name), 'update'),
      pg_catalog.has_table_privilege('anon', format('public.%I', e.table_name), 'delete'),
      pg_catalog.has_table_privilege('authenticated', format('public.%I', e.table_name), 'select'),
      pg_catalog.has_table_privilege('authenticated', format('public.%I', e.table_name), 'insert'),
      pg_catalog.has_table_privilege('authenticated', format('public.%I', e.table_name), 'update'),
      pg_catalog.has_table_privilege('authenticated', format('public.%I', e.table_name), 'delete'),
      pg_catalog.has_table_privilege('service_role', format('public.%I', e.table_name), 'select'),
      pg_catalog.has_table_privilege('service_role', format('public.%I', e.table_name), 'insert'),
      pg_catalog.has_table_privilege('service_role', format('public.%I', e.table_name), 'update'),
      pg_catalog.has_table_privilege('service_role', format('public.%I', e.table_name), 'delete')
    ) as observed,
    not pg_catalog.has_table_privilege('anon', format('public.%I', e.table_name), 'select')
      and not pg_catalog.has_table_privilege('anon', format('public.%I', e.table_name), 'insert')
      and not pg_catalog.has_table_privilege('anon', format('public.%I', e.table_name), 'update')
      and not pg_catalog.has_table_privilege('anon', format('public.%I', e.table_name), 'delete')
      and pg_catalog.has_table_privilege('authenticated', format('public.%I', e.table_name), 'select')
      and not pg_catalog.has_table_privilege('authenticated', format('public.%I', e.table_name), 'insert')
      and not pg_catalog.has_table_privilege('authenticated', format('public.%I', e.table_name), 'update')
      and not pg_catalog.has_table_privilege('authenticated', format('public.%I', e.table_name), 'delete')
      and pg_catalog.has_table_privilege('service_role', format('public.%I', e.table_name), 'select')
      and pg_catalog.has_table_privilege('service_role', format('public.%I', e.table_name), 'insert')
      and pg_catalog.has_table_privilege('service_role', format('public.%I', e.table_name), 'update')
      and pg_catalog.has_table_privilege('service_role', format('public.%I', e.table_name), 'delete') as ok
  from expected_tables e
),
function_checks as (
  select
    'function privilege'::text as area,
    e.signature::text as invariant,
    format('anon=false authenticated=%s service=%s', e.authenticated_execute, e.service_execute) as expected,
    case when p.oid is null then 'missing' else format(
      'anon=%s authenticated=%s service=%s',
      pg_catalog.has_function_privilege('anon', p.oid, 'execute'),
      pg_catalog.has_function_privilege('authenticated', p.oid, 'execute'),
      pg_catalog.has_function_privilege('service_role', p.oid, 'execute')
    ) end as observed,
    p.oid is not null
      and not pg_catalog.has_function_privilege('anon', p.oid, 'execute')
      and pg_catalog.has_function_privilege('authenticated', p.oid, 'execute') = e.authenticated_execute
      and pg_catalog.has_function_privilege('service_role', p.oid, 'execute') = e.service_execute as ok
  from expected_functions e
  left join pg_catalog.pg_proc p on p.oid = pg_catalog.to_regprocedure(e.signature)
),
trigger_checks as (
  select
    'trigger'::text as area,
    format('public.%s.%s', e.table_name, e.trigger_name) as invariant,
    'enabled once'::text as expected,
    case when count(t.oid) = 0 then 'missing' else format('%s enabled=%s', count(t.oid), bool_and(t.tgenabled = 'O')) end as observed,
    count(t.oid) = 1 and bool_and(t.tgenabled = 'O') as ok
  from expected_triggers e
  left join pg_catalog.pg_class c
    on c.relnamespace = 'public'::regnamespace and c.relname = e.table_name
  left join pg_catalog.pg_trigger t
    on t.tgrelid = c.oid and t.tgname = e.trigger_name and not t.tgisinternal
  group by e.table_name, e.trigger_name
),
conflict_code_checks as (
  select
    'concurrency'::text as area,
    'catalog writes use PT409 and never retryable 40001'::text as invariant,
    '6 write functions'::text as expected,
    count(*) filter (
      where pg_catalog.pg_get_functiondef(p.oid) like '%PT409%'
        and pg_catalog.pg_get_functiondef(p.oid) not like '%40001%'
    )::text as observed,
    count(*) = 6
      and count(*) filter (
        where pg_catalog.pg_get_functiondef(p.oid) like '%PT409%'
          and pg_catalog.pg_get_functiondef(p.oid) not like '%40001%'
      ) = 6 as ok
  from expected_functions e
  join pg_catalog.pg_proc p on p.oid = pg_catalog.to_regprocedure(e.signature)
  where e.authenticated_execute
    and e.signature <> 'public.list_archived_corpus_series()'
),
data_checks as (
  select
    'catalog data'::text as area,
    'active series without exactly one canonical name'::text as invariant,
    '0'::text as expected,
    count(*)::text as observed,
    count(*) = 0 as ok
  from public.corpus_series c
  where c.archived_at is null
    and 1 <> (
      select count(*) from public.corpus_series_names n
      where n.series_id = c.id and n.kind = 'canonical'
    )
  union all
  select
    'catalog data',
    'duplicate provider identities',
    '0',
    count(*)::text,
    count(*) = 0
  from (
    select source, source_ref
    from public.corpus_series_sources
    group by source, source_ref
    having count(*) > 1
  ) duplicates
  union all
  select
    'catalog data',
    'works with multiple active primary catalog memberships',
    '0',
    count(*)::text,
    count(*) = 0
  from (
    select work_id
    from public.corpus_series_entries
    where work_id is not null and removed_at is null and is_primary
    group by work_id
    having count(*) > 1
  ) duplicates
  union all
  select
    'catalog data',
    'active linked memberships with missing work rows',
    '0',
    count(*)::text,
    count(*) = 0
  from public.corpus_series_entries e
  left join public.works w on w.id = e.work_id
  where e.work_id is not null and e.removed_at is null and w.id is null
  union all
  select
    'catalog data',
    'active primary catalog projection mismatches',
    '0',
    count(*)::text,
    count(*) = 0
  from public.corpus_series_entries e
  join public.corpus_series c on c.id = e.series_id and c.archived_at is null
  join public.works w on w.id = e.work_id
  where e.removed_at is null
    and e.is_primary
    and (
      w.series is distinct from c.name
      or w.position is distinct from e.position
      or w.series_count is distinct from c.declared_count
      or (c.status is not null and w.status is distinct from c.status)
    )
  union all
  select
    'catalog data',
    'unbound slots missing a title',
    '0',
    count(*)::text,
    count(*) = 0
  from public.corpus_series_entries e
  where e.work_id is null and e.removed_at is null and nullif(trim(e.title), '') is null
),
checks as (
  select * from migration_checks
  union all select * from table_checks
  union all select * from rls_checks
  union all select * from table_acl_checks
  union all select * from function_checks
  union all select * from trigger_checks
  union all select * from conflict_code_checks
  union all select * from data_checks
)
select area, invariant, expected, observed, ok
from checks
order by ok, area, invariant;
