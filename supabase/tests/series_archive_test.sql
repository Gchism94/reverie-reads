-- Reversible series archive. Assertions run after RESET ROLE so RLS cannot turn a missing row into
-- a false positive; only the calls and ordinary-reader visibility checks run as authenticated.

begin;
select plan(60);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('b4000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   'series-archive-owner@example.com', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('b4000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
   'series-archive-other@example.com', '{}'::jsonb, '{}'::jsonb, now(), now());

select has_column('public', 'series', 'archived_at',
  'series has a reversible archive timestamp');
select has_column('public', 'series_entries', 'archive_primary_intent',
  'entries preserve exact pre-archive primary intent');
select has_function('public', 'archive_personal_series', array['uuid'],
  'owner-facing archive RPC exists');
select has_function('public', 'restore_personal_series', array['uuid'],
  'owner-facing restore RPC exists');
select has_function('public', 'list_archived_personal_series', array[]::text[],
  'archived recovery-list RPC exists');
select ok(
  (select prosecdef from pg_proc where oid = 'public.archive_personal_series(uuid)'::regprocedure),
  'archive runs behind a security-definer ownership boundary');
select ok(
  (select prosecdef from pg_proc where oid = 'public.restore_personal_series(uuid)'::regprocedure),
  'restore runs behind a security-definer ownership boundary');
select ok(
  (select prosecdef from pg_proc where oid = 'public.list_archived_personal_series()'::regprocedure),
  'the explicit archived read is security definer');

-- The existing consolidation queue needs owner-scoped reads, while every browser-side write stays
-- behind its RPC. Assert every operation separately so a legacy production grant cannot hide in a
-- broad privilege check.
select ok(not has_table_privilege('anon', 'public.series_merge_decisions', 'SELECT'),
  'anon cannot select series merge rulings');
select ok(not has_table_privilege('anon', 'public.series_merge_decisions', 'INSERT'),
  'anon cannot insert series merge rulings');
select ok(not has_table_privilege('anon', 'public.series_merge_decisions', 'UPDATE'),
  'anon cannot update series merge rulings');
select ok(not has_table_privilege('anon', 'public.series_merge_decisions', 'DELETE'),
  'anon cannot delete series merge rulings');
select ok(has_table_privilege('authenticated', 'public.series_merge_decisions', 'SELECT'),
  'authenticated readers can select their RLS-scoped rulings');
select ok(not has_table_privilege('authenticated', 'public.series_merge_decisions', 'INSERT'),
  'authenticated readers cannot insert merge rulings directly');
select ok(not has_table_privilege('authenticated', 'public.series_merge_decisions', 'UPDATE'),
  'authenticated readers cannot update merge rulings directly');
select ok(not has_table_privilege('authenticated', 'public.series_merge_decisions', 'DELETE'),
  'authenticated readers cannot delete merge rulings directly');
select ok(has_table_privilege('service_role', 'public.series_merge_decisions', 'SELECT'),
  'service maintenance can select merge rulings');
select ok(has_table_privilege('service_role', 'public.series_merge_decisions', 'INSERT'),
  'service maintenance can insert merge rulings');
select ok(has_table_privilege('service_role', 'public.series_merge_decisions', 'UPDATE'),
  'service maintenance can update merge rulings');
select ok(has_table_privilege('service_role', 'public.series_merge_decisions', 'DELETE'),
  'service maintenance can delete merge rulings');

insert into public.series (id, owner_id, name, length)
values
  ('b4100000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001',
   'Archived Saga', 3),
  ('b4100000-0000-0000-0000-000000000002', 'b4000000-0000-0000-0000-000000000001',
   'Restorable Saga', 1);

insert into public.books (id, owner_id, title)
values
  ('b4200000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001',
   'Archived Book'),
  ('b4200000-0000-0000-0000-000000000002', 'b4000000-0000-0000-0000-000000000001',
   'Restorable Book');

insert into public.series_entries (
  id, series_id, owner_id, position, title, author, book_id, is_primary,
  membership_claim, position_claim, removed_at
)
values
  ('b4300000-0000-0000-0000-000000000001', 'b4100000-0000-0000-0000-000000000001',
   'b4000000-0000-0000-0000-000000000001', 1, 'Archived Book', 'A. Reader',
   'b4200000-0000-0000-0000-000000000001', true,
   '{"origin":"reader","source":"fixture"}'::jsonb,
   '{"origin":"reader","source":"fixture"}'::jsonb, null),
  ('b4300000-0000-0000-0000-000000000002', 'b4100000-0000-0000-0000-000000000001',
   'b4000000-0000-0000-0000-000000000001', 2, 'Future Ghost', 'A. Reader', null, false,
   '{"origin":"reader","source":"fixture"}'::jsonb,
   '{"origin":"reader","source":"fixture"}'::jsonb, null),
  ('b4300000-0000-0000-0000-000000000003', 'b4100000-0000-0000-0000-000000000001',
   'b4000000-0000-0000-0000-000000000001', 3, 'Removed Slot', 'A. Reader', null, false,
   '{"origin":"reader","source":"series_remove"}'::jsonb,
   '{"origin":"reader","source":"fixture"}'::jsonb, now()),
  ('b4300000-0000-0000-0000-000000000004', 'b4100000-0000-0000-0000-000000000002',
   'b4000000-0000-0000-0000-000000000001', 1, 'Restorable Book', 'A. Reader',
   'b4200000-0000-0000-0000-000000000002', true,
   '{"origin":"reader","source":"fixture"}'::jsonb,
   '{"origin":"reader","source":"fixture"}'::jsonb, null);

insert into public.reads (id, book_id, owner_id, read_on, format, notes)
values
  ('b4400000-0000-0000-0000-000000000001', 'b4200000-0000-0000-0000-000000000001',
   'b4000000-0000-0000-0000-000000000001', '2026-08-01', 'ebook', 'Keep this history'),
  ('b4400000-0000-0000-0000-000000000002', 'b4200000-0000-0000-0000-000000000002',
   'b4000000-0000-0000-0000-000000000001', '2026-08-02', 'paperback', 'Keep this too');

select ok(
  (select series = 'Archived Saga' and position = 1 and series_count = 3
   from public.books where id = 'b4200000-0000-0000-0000-000000000001'),
  'the fixture begins with a projected primary membership');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"b4000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.archive_personal_series('b4100000-0000-0000-0000-000000000001')$$,
  'the owner can archive a series atomically');
select is(
  (select count(*)::int from public.series
   where id = 'b4100000-0000-0000-0000-000000000001'),
  0, 'ordinary series reads exclude the archived record');
select is(
  (select count(*)::int from public.series_entries
   where series_id = 'b4100000-0000-0000-0000-000000000001'),
  0, 'ordinary entry reads exclude rows beneath an archived series');
select is(
  (select entry_count::int from public.list_archived_personal_series()
   where id = 'b4100000-0000-0000-0000-000000000001'),
  2, 'the explicit recovery list reports only live entries');
select is(
  (select linked_book_count::int from public.list_archived_personal_series()
   where id = 'b4100000-0000-0000-0000-000000000001'),
  1, 'the recovery list reports the preserved linked book');
select is(
  (select ghost_count::int from public.list_archived_personal_series()
   where id = 'b4100000-0000-0000-0000-000000000001'),
  1, 'the recovery list reports the preserved live ghost separately');
reset role;

select ok(
  (select archived_at is not null from public.series
   where id = 'b4100000-0000-0000-0000-000000000001'),
  'archive stamps the series instead of deleting it');
select throws_ok(
  $$update public.series_entries
       set series_id = 'b4100000-0000-0000-0000-000000000002'
     where id = 'b4300000-0000-0000-0000-000000000002'$$,
  '55000', 'series is archived; restore it first',
  'a table-owner path cannot re-parent an entry out of an archived series');
select is(
  (select series_id::text from public.series_entries
   where id = 'b4300000-0000-0000-0000-000000000002'),
  'b4100000-0000-0000-0000-000000000001',
  'the refused re-parent leaves the archived entry on its original parent');
select throws_ok(
  $$delete from public.series_entries
     where id = 'b4300000-0000-0000-0000-000000000002'$$,
  '55000', 'series is archived; restore it first',
  'a table-owner path cannot delete an entry beneath an archived series');
select is(
  (select count(*)::int from public.series_entries
   where id = 'b4300000-0000-0000-0000-000000000002'),
  1, 'the refused delete leaves the archived ghost intact');
select is(
  (select count(*)::int from public.series_entries
   where series_id = 'b4100000-0000-0000-0000-000000000001'),
  3, 'live, ghost, and tombstone entries all survive archive');
select ok(
  (select removed_at is not null from public.series_entries
   where id = 'b4300000-0000-0000-0000-000000000003'),
  'the existing removal tombstone stays removed');
select ok(
  (select book_id = 'b4200000-0000-0000-0000-000000000001'
          and not is_primary and archive_primary_intent
   from public.series_entries where id = 'b4300000-0000-0000-0000-000000000001'),
  'archive keeps the linked entry and records its suspended primary intent');
select ok(
  (select series is null and position is null and series_count is null
          and series_claim ->> 'source' = 'series_archive'
   from public.books where id = 'b4200000-0000-0000-0000-000000000001'),
  'archive clears only the compatibility projection and records the deliberate action');
select is(
  (select count(*)::int from public.books
   where id = 'b4200000-0000-0000-0000-000000000001'),
  1, 'the personal book itself survives archive');
select is(
  (select count(*)::int from public.reads
   where book_id = 'b4200000-0000-0000-0000-000000000001'),
  1, 'reading history survives archive');

-- A newer primary choice while the first series is archived must win when it is restored.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"b4000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.set_book_series_membership(
      'b4200000-0000-0000-0000-000000000001', null, 'Newer Saga', 7, null, true,
      '{"origin":"reader","source":"newer_choice"}'::jsonb,
      '{"origin":"reader","source":"newer_choice"}'::jsonb
    )$$,
  'the reader can make a newer primary choice while the old series is archived');
select lives_ok(
  $$select public.restore_personal_series('b4100000-0000-0000-0000-000000000001')$$,
  'the archived series can be restored without replacing that newer choice');
reset role;

select ok(
  (select archived_at is null from public.series
   where id = 'b4100000-0000-0000-0000-000000000001'),
  'restore makes the series active again');
select ok(
  (select not is_primary and not archive_primary_intent
   from public.series_entries where id = 'b4300000-0000-0000-0000-000000000001'),
  'a skipped saved primary becomes an ordinary secondary after restore');
select is(
  (select count(*)::int from public.series_entries e
   join public.series s on s.id = e.series_id
   where e.book_id = 'b4200000-0000-0000-0000-000000000001'
     and e.is_primary and e.removed_at is null and s.name = 'Newer Saga'),
  1, 'the newer primary remains the one structured authority');
select ok(
  (select series = 'Newer Saga' and position = 7
   from public.books where id = 'b4200000-0000-0000-0000-000000000001'),
  'restore does not overwrite the newer compatibility projection');

-- Without a newer primary, restore reclaims the exact saved intent and its original projection.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"b4000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.archive_personal_series('b4100000-0000-0000-0000-000000000002')$$,
  'a second primary series archives');
select lives_ok(
  $$select public.restore_personal_series('b4100000-0000-0000-0000-000000000002')$$,
  'restore succeeds when its book has no newer primary');
reset role;

select ok(
  (select is_primary and not archive_primary_intent
   from public.series_entries where id = 'b4300000-0000-0000-0000-000000000004'),
  'the saved primary intent is restored once and then cleared');
select ok(
  (select series = 'Restorable Saga' and position = 1 and series_count = 1
   from public.books where id = 'b4200000-0000-0000-0000-000000000002'),
  'the restored primary projects its original series details');
select is(
  (select count(*)::int from public.reads
   where book_id = 'b4200000-0000-0000-0000-000000000002'),
  1, 'the second book history survives the whole archive and restore cycle');

-- Another authenticated user cannot archive, restore, or discover this reader's archived series.
-- Archive the now-secondary first series again so the recovery-list assertion has a real foreign
-- row it must hide; an empty fixture would certify nothing about owner scoping.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"b4000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.archive_personal_series('b4100000-0000-0000-0000-000000000001')$$,
  'the owner archives a real row for the cross-owner recovery-list check');
select is(
  (select count(*)::int from public.list_archived_personal_series()
   where id = 'b4100000-0000-0000-0000-000000000001'),
  1, 'the owner recovery list can see that archived row');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"b4000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$select public.archive_personal_series('b4100000-0000-0000-0000-000000000001')$$,
  'P0001', 'not owner of series', 'another reader cannot archive this series');
select throws_ok(
  $$select public.restore_personal_series('b4100000-0000-0000-0000-000000000001')$$,
  'P0001', 'not owner of series', 'another reader cannot restore this series');
select is(
  (select count(*)::int from public.list_archived_personal_series()),
  0, 'the explicit recovery list remains owner-scoped');
reset role;

-- The grant layer, not a body-level ownership error, refuses anonymous callers.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$select public.archive_personal_series('b4100000-0000-0000-0000-000000000001')$$,
  '42501', null, 'anon cannot execute the archive RPC');
select throws_ok(
  $$select public.restore_personal_series('b4100000-0000-0000-0000-000000000001')$$,
  '42501', null, 'anon cannot execute the restore RPC');
select throws_ok(
  $$select * from public.list_archived_personal_series()$$,
  '42501', null, 'anon cannot execute the archived-series read RPC');
reset role;

-- The archived-child guard must not break the JWT-less system cascade that implements account
-- deletion. This is deliberately after every owner assertion because the account graph is gone.
select set_config('request.jwt.claims', '', true);
select lives_ok(
  $$delete from auth.users where id = 'b4000000-0000-0000-0000-000000000001'$$,
  'account deletion can still cascade through an archived series');
select is(
  (select count(*)::int from public.series
   where owner_id = 'b4000000-0000-0000-0000-000000000001'),
  0, 'the system cascade removes the archived and active series rows');
select is(
  (select count(*)::int from public.series_entries
   where owner_id = 'b4000000-0000-0000-0000-000000000001'),
  0, 'the system cascade removes their entries only with the account');

select * from finish();
rollback;
