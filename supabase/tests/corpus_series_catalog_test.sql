begin;
select no_plan();

select has_table('public', 'corpus_series', 'canonical corpus series have a shared identity table');
select has_table('public', 'corpus_series_names', 'canonical names and aliases are relational');
select has_table('public', 'corpus_series_sources', 'provider identities are retained separately');
select has_table('public', 'corpus_series_entries', 'shared series membership is relational');
select has_table('public', 'corpus_series_edits', 'administrator changes are auditable');
select has_column('public', 'corpus_series', 'revision', 'catalog writes have an optimistic revision');
select has_column('public', 'corpus_series_entries', 'archive_primary_intent',
  'reversible archive remembers exact primary intent');
select has_function('public', 'update_corpus_series',
  array['uuid', 'bigint', 'text', 'text', 'integer', 'text[]'],
  'administrator metadata update RPC exists');
select has_function('public', 'merge_corpus_series',
  array['uuid', 'uuid', 'bigint', 'bigint'], 'administrator merge RPC exists');
select has_function('public', 'archive_corpus_series', array['uuid', 'bigint'],
  'administrator archive RPC exists');
select has_function('public', 'restore_corpus_series', array['uuid', 'bigint'],
  'administrator restore RPC exists');
select has_function('public', 'save_corpus_series_entry',
  array['uuid', 'bigint', 'uuid', 'text', 'text', 'numeric', 'text'],
  'administrator slot save RPC exists');
select has_function('public', 'remove_corpus_series_entry', array['uuid', 'bigint'],
  'administrator slot removal RPC exists');
select has_function('public', 'detach_corpus_series_work_before_delete', array[]::text[],
  'work deletion has an explicit catalog detachment boundary');
select has_trigger('public', 'works', 'works_detach_corpus_series_before_delete',
  'work deletion detaches canonical membership before the foreign key runs');
select ok(
  not has_function_privilege('anon', 'public.detach_corpus_series_work_before_delete()', 'EXECUTE'),
  'anon cannot invoke the work-detachment trigger helper directly');
select ok(
  not has_function_privilege(
    'authenticated', 'public.detach_corpus_series_work_before_delete()', 'EXECUTE'
  ),
  'authenticated cannot invoke the work-detachment trigger helper directly');
select ok(
  not has_function_privilege(
    'service_role', 'public.detach_corpus_series_work_before_delete()', 'EXECUTE'
  ),
  'service role cannot invoke the work-detachment trigger helper directly');

-- Reproduce the legacy production project's auto-exposure, then replay the exact repair contract.
grant select, insert, update, delete on table public.corpus_series,
  public.corpus_series_names, public.corpus_series_sources, public.corpus_series_entries,
  public.corpus_series_edits to public, anon, authenticated;
revoke all on table public.corpus_series, public.corpus_series_names,
  public.corpus_series_sources, public.corpus_series_entries, public.corpus_series_edits
  from public, anon, authenticated, service_role;
grant select on table public.corpus_series, public.corpus_series_names,
  public.corpus_series_sources, public.corpus_series_entries to authenticated;
grant select on table public.corpus_series_edits to authenticated;
grant all on table public.corpus_series, public.corpus_series_names,
  public.corpus_series_sources, public.corpus_series_entries, public.corpus_series_edits
  to service_role;

with tables(name) as (
  values ('corpus_series'), ('corpus_series_names'), ('corpus_series_sources'),
         ('corpus_series_entries'), ('corpus_series_edits')
), operations(name) as (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'))
select ok(
  not has_table_privilege('anon', 'public.' || tables.name, operations.name),
  format('anon cannot %s public.%s', lower(operations.name), tables.name)
)
from tables cross join operations;

with tables(name) as (
  values ('corpus_series'), ('corpus_series_names'), ('corpus_series_sources'),
         ('corpus_series_entries'), ('corpus_series_edits')
), operations(name) as (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'))
select ok(
  has_table_privilege('authenticated', 'public.' || tables.name, operations.name)
    = (operations.name = 'SELECT'),
  format('authenticated %s privilege on public.%s is exact', lower(operations.name), tables.name)
)
from tables cross join operations;

with tables(name) as (
  values ('corpus_series'), ('corpus_series_names'), ('corpus_series_sources'),
         ('corpus_series_entries'), ('corpus_series_edits')
), operations(name) as (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'))
select ok(
  has_table_privilege('service_role', 'public.' || tables.name, operations.name),
  format('service role can %s public.%s', lower(operations.name), tables.name)
)
from tables cross join operations;

with functions(signature) as (
  values
    ('public.update_corpus_series(uuid,bigint,text,text,integer,text[])'),
    ('public.merge_corpus_series(uuid,uuid,bigint,bigint)'),
    ('public.archive_corpus_series(uuid,bigint)'),
    ('public.restore_corpus_series(uuid,bigint)'),
    ('public.save_corpus_series_entry(uuid,bigint,uuid,text,text,numeric,text)'),
    ('public.remove_corpus_series_entry(uuid,bigint)'),
    ('public.list_archived_corpus_series()')
)
select ok(
  not has_function_privilege('anon', signature, 'EXECUTE'),
  format('anon cannot execute %s', signature)
) from functions;

with functions(signature) as (
  values
    ('public.update_corpus_series(uuid,bigint,text,text,integer,text[])'),
    ('public.merge_corpus_series(uuid,uuid,bigint,bigint)'),
    ('public.archive_corpus_series(uuid,bigint)'),
    ('public.restore_corpus_series(uuid,bigint)'),
    ('public.save_corpus_series_entry(uuid,bigint,uuid,text,text,numeric,text)'),
    ('public.remove_corpus_series_entry(uuid,bigint)'),
    ('public.list_archived_corpus_series()')
)
select ok(
  has_function_privilege('authenticated', signature, 'EXECUTE'),
  format('authenticated reaches the administrator boundary for %s', signature)
) from functions;

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('ca000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'catalog-admin@example.com', '{}', '{"display_name":"Catalog Admin"}', now(), now()),
  ('ca000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'catalog-reader@example.com', '{}', '{"display_name":"Catalog Reader"}', now(), now());
insert into public.corpus_admins (user_id)
values ('ca000000-0000-4000-8000-000000000001');

insert into public.works (id, work_key, title, author_text, contributors)
values
  ('cb000000-0000-4000-8000-000000000001', 'catalog-one|writer', 'Catalog One', 'A Writer', '[]'),
  ('cb000000-0000-4000-8000-000000000002', 'catalog-two|writer', 'Catalog Two', 'A Writer', '[]'),
  ('cb000000-0000-4000-8000-000000000003', 'other-one|writer', 'Other One', 'A Writer', '[]');

insert into public.books (
  id, owner_id, corpus_work_id, title, authors_display, series, position,
  status, series_user_chosen, series_claim
) values
  ('cc000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000002',
   'cb000000-0000-4000-8000-000000000001', 'Catalog One', 'A Writer', null, null,
   'standalone', false, '{"origin":"unknown"}'),
  ('cc000000-0000-4000-8000-000000000002', 'ca000000-0000-4000-8000-000000000002',
   'cb000000-0000-4000-8000-000000000001', 'Catalog One', 'A Writer', 'My Private Order', 7,
   'ongoing', true, '{"origin":"reader","source":"book_edit"}');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"ca000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$select public.update_corpus_series(
      'cd000000-0000-4000-8000-000000000001', 1, 'Injected', null, null, '{}'
    )$$,
  '42501', 'corpus administrator required',
  'an ordinary reader cannot mutate shared series metadata');
select throws_ok(
  $$insert into public.corpus_series
      (name, name_key, creator_key) values ('Injected', 'injected', 'reader')$$,
  '42501', null, 'an ordinary reader cannot insert a catalog row directly');
select lives_ok(
  $$update public.books set rating = 4.5
      where id = 'cc000000-0000-4000-8000-000000000001'$$,
  'a reader can keep editing personal book information while catalog work is active');
reset role;
select is(
  (select rating from public.books where id = 'cc000000-0000-4000-8000-000000000001'),
  4.5::numeric, 'the concurrent-safe personal edit is retained');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"ca000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(
  public.record_corpus_series_discovery(
    'cb000000-0000-4000-8000-000000000001',
    '{"matched":true,"identityConfidence":"high","membershipConfidence":"high","source":"hardcover","sourceRef":"hc-catalog","series":"Catalog Saga","position":1,"count":2,"evidence":[{"source":"hardcover","kind":"relational_membership","sourceRef":"hc-catalog","series":"Catalog Saga","position":1,"memberCount":2}]}'::jsonb,
    '2026-09-20T01:00:00Z'
  ) ->> 'outcome',
  'applied', 'reviewed relational evidence creates the first canonical membership');
select is(
  public.record_corpus_series_discovery(
    'cb000000-0000-4000-8000-000000000002',
    '{"matched":true,"identityConfidence":"high","membershipConfidence":"high","source":"hardcover","sourceRef":"hc-catalog","series":"Catalog Saga","position":2,"count":2,"evidence":[{"source":"hardcover","kind":"relational_membership","sourceRef":"hc-catalog","series":"Catalog Saga","position":2,"memberCount":2}]}'::jsonb,
    '2026-09-20T01:01:00Z'
  ) ->> 'outcome',
  'applied', 'a second work with the same provider id joins the canonical series');
select is(
  public.record_corpus_series_discovery(
    'cb000000-0000-4000-8000-000000000003',
    '{"matched":true,"identityConfidence":"high","membershipConfidence":"high","source":"hardcover","sourceRef":"hc-other","series":"Other Saga","position":1,"count":1,"evidence":[{"source":"hardcover","kind":"relational_membership","sourceRef":"hc-other","series":"Other Saga","position":1,"memberCount":1}]}'::jsonb,
    '2026-09-20T01:02:00Z'
  ) ->> 'outcome',
  'applied', 'a distinct provider id creates a distinct canonical series');
reset role;

-- Deleting a provisional corpus work must preserve a known reading-order hint without leaving an
-- impossible primary membership behind. This is the real household Add cleanup path.
insert into public.works (id, work_key, title, author_text, contributors)
values (
  'cb000000-0000-4000-8000-000000000004', 'catalog-detach|writer',
  'Catalog Detach', 'A Writer', '[]'
);
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"ca000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(
  public.record_corpus_series_discovery(
    'cb000000-0000-4000-8000-000000000004',
    '{"matched":true,"identityConfidence":"high","membershipConfidence":"high","source":"hardcover","sourceRef":"hc-detach","series":"Detach Series","position":1,"count":1,"evidence":[{"source":"hardcover","kind":"relational_membership","sourceRef":"hc-detach","series":"Detach Series","position":1,"memberCount":1}]}'::jsonb,
    '2026-09-20T01:03:00Z'
  ) ->> 'outcome',
  'applied', 'the deletion fixture first becomes a reviewed canonical membership');
reset role;
delete from public.work_metadata_edits
where work_id = 'cb000000-0000-4000-8000-000000000004';
delete from public.works where id = 'cb000000-0000-4000-8000-000000000004';
select ok(
  (select work_id is null and not is_primary and title = 'Catalog Detach'
     from public.corpus_series_entries e
     join public.corpus_series s on s.id = e.series_id
    where s.name = 'Detach Series'),
  'work deletion converts its reviewed membership into a valid unbound slot');
select is(
  (select count(*)::int
     from public.corpus_series_edits e
     join public.corpus_series s on s.id = e.series_id
    where s.name = 'Detach Series' and e.action = 'work_detach'),
  1, 'work deletion leaves one explicit detachment audit event');
delete from public.corpus_series where name = 'Detach Series';

select is((select count(*)::int from public.corpus_series), 2,
  'provider identity groups two works without collapsing another series');
select is((select count(*)::int from public.corpus_series_entries), 3,
  'each reviewed work has one canonical membership');
select is((select count(*)::int from public.corpus_series_sources), 2,
  'provider identities are stored once per canonical series');
select ok(
  (select count(*) = 2 and min(position) = 1 and max(position) = 2
   from public.corpus_series_entries e
   join public.corpus_series s on s.id = e.series_id
   where s.name = 'Catalog Saga' and e.removed_at is null),
  'canonical entries retain the complete reviewed order');
select ok(
  (select series = 'Catalog Saga' and position = 1 and series_count = 2
     and series_claim ->> 'origin' = 'corpus'
   from public.books where id = 'cc000000-0000-4000-8000-000000000001'),
  'the catalog source seeds an eligible automatic personal default');
select ok(
  (select series = 'My Private Order' and position = 7
     and series_claim ->> 'origin' = 'reader'
   from public.books where id = 'cc000000-0000-4000-8000-000000000002'),
  'the same shared fact does not overwrite a reader series choice');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"ca000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.update_corpus_series(
      (select id from public.corpus_series where name = 'Catalog Saga'),
      (select revision from public.corpus_series where name = 'Catalog Saga'),
      'The Catalog Sequence', 'completed', 2, array['Catalog Saga', 'Catalog Books']
    )$$,
  'an administrator can rename and complete shared series metadata');
select throws_ok(
  $$select public.update_corpus_series(
      (select id from public.corpus_series where name = 'The Catalog Sequence'), 1,
      'Stale Save', 'completed', 2, '{}'
    )$$,
  'PT409', 'corpus series changed; refresh before saving',
  'a stale administrator form fails closed');
reset role;

select is(
  (select count(*)::int from public.works where series = 'The Catalog Sequence'), 2,
  'rename updates the work-level household compatibility projection');
select is(
  (select count(*)::int from public.corpus_series_names n
   join public.corpus_series s on s.id = n.series_id
   where s.name = 'The Catalog Sequence' and n.kind = 'alias'),
  2, 'rename retains the former name and the supplied alias');
select ok(
  (select series = 'The Catalog Sequence' and position = 1
   from public.books where id = 'cc000000-0000-4000-8000-000000000001'),
  'rename follows through to the eligible personal default');
select is(
  (select series from public.books where id = 'cc000000-0000-4000-8000-000000000002'),
  'My Private Order', 'rename still preserves the explicit reader series');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"ca000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.save_corpus_series_entry(
      (select id from public.corpus_series where name = 'The Catalog Sequence'),
      (select revision from public.corpus_series where name = 'The Catalog Sequence'),
      null, 'Catalog Interlude', 'A Writer', 1.5, 'Read between #1 and #2'
    )$$,
  'an administrator can add an unbound known slot');
select lives_ok(
  $$select public.save_corpus_series_entry(
      (select id from public.corpus_series where name = 'The Catalog Sequence'),
      (select revision from public.corpus_series where name = 'The Catalog Sequence'),
      (select e.id from public.corpus_series_entries e
       join public.corpus_series s on s.id = e.series_id
       where s.name = 'The Catalog Sequence' and e.title = 'Catalog Interlude'
         and e.removed_at is null),
      'Catalog Interlude', 'A Writer', 1.75, 'Optional interlude'
    )$$,
  'an administrator can correct an unbound slot');
select lives_ok(
  $$select public.remove_corpus_series_entry(
      (select e.id from public.corpus_series_entries e
       join public.corpus_series s on s.id = e.series_id
       where s.name = 'The Catalog Sequence' and e.title = 'Catalog Interlude'
         and e.removed_at is null),
      (select revision from public.corpus_series where name = 'The Catalog Sequence')
    )$$,
  'an administrator can remove a slot without deleting its history');
select lives_ok(
  $$select public.save_corpus_series_entry(
      (select id from public.corpus_series where name = 'The Catalog Sequence'),
      (select revision from public.corpus_series where name = 'The Catalog Sequence'),
      (select e.id from public.corpus_series_entries e
       where e.work_id = 'cb000000-0000-4000-8000-000000000001'
         and e.removed_at is null),
      'ignored for linked work', 'ignored for linked work', 1.25, 'Opening volume'
    )$$,
  'an administrator can correct a linked corpus slot');
reset role;

select ok(
  (select removed_at is not null and position = 1.75
   from public.corpus_series_entries where title = 'Catalog Interlude'),
  'a removed unbound slot keeps its last reviewed value for audit and recovery');
select ok(
  (select position = 1.25 from public.works
   where id = 'cb000000-0000-4000-8000-000000000001'),
  'a linked slot correction updates the work compatibility projection');
select ok(
  (select position = 1.25 from public.books
   where id = 'cc000000-0000-4000-8000-000000000001'),
  'a linked slot correction reaches the eligible automatic personal default');
select is(
  (select position from public.books where id = 'cc000000-0000-4000-8000-000000000002'),
  7::numeric, 'a linked slot correction still preserves an explicit reader position');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"ca000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.merge_corpus_series(
      (select id from public.corpus_series where name = 'The Catalog Sequence'),
      (select id from public.corpus_series where name = 'Other Saga'),
      (select revision from public.corpus_series where name = 'The Catalog Sequence'),
      (select revision from public.corpus_series where name = 'Other Saga')
    )$$,
  'an administrator can merge two canonical series');
reset role;
select is(
  (select count(*)::int from public.corpus_series where archived_at is null), 1,
  'merge leaves one active canonical identity');
select is(
  (select count(*)::int from public.corpus_series_entries e
   join public.corpus_series s on s.id = e.series_id
   where s.name = 'The Catalog Sequence' and e.removed_at is null),
  3, 'merge preserves and reparents all membership rows');
select ok(
  (select archived_at is not null and merged_into is not null
   from public.corpus_series where name = 'Other Saga'),
  'the losing series is retained as archived merge history');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"ca000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.archive_corpus_series(
      (select id from public.corpus_series where name = 'The Catalog Sequence'),
      (select revision from public.corpus_series where name = 'The Catalog Sequence')
    )$$,
  'an administrator can reversibly archive the surviving shared series');
select is((select count(*)::int from public.corpus_series), 0,
  'ordinary authenticated reads hide archived shared series');
select is((select count(*)::int from public.list_archived_corpus_series()), 2,
  'the explicit administrator recovery inventory includes archived and merged records');
select lives_ok(
  $$select public.restore_corpus_series(
      (select id from public.list_archived_corpus_series()
        where name = 'The Catalog Sequence'),
      (select revision from public.list_archived_corpus_series()
        where name = 'The Catalog Sequence')
    )$$,
  'an administrator can restore an archived non-merged shared series');
reset role;

select is((select count(*)::int from public.corpus_series where archived_at is null), 1,
  'restore returns the canonical identity to ordinary reads');
select is((select count(*)::int from public.works where series = 'The Catalog Sequence'), 3,
  'restore reinstates the saved primary work projections');
select is(
  (select series from public.books where id = 'cc000000-0000-4000-8000-000000000002'),
  'My Private Order', 'archive and restore never disturb an explicit reader series');
select ok((select count(*) >= 6 from public.corpus_series_edits),
  'seed, sync, update, merge, archive, and restore decisions leave audit history');

select * from finish();
rollback;
