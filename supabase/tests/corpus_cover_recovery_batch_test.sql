begin;
select plan(32);

-- Reproduce the production project's legacy auto-exposure before replaying the migration ACL
-- repair. Without this positive precondition, the newer clean local defaults would let the
-- negative assertions pass even if the migration omitted a named role.
grant execute on function public.admin_recover_corpus_cover_batch(integer)
  to public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.corpus_cover_recovery_marks
  to public, anon, authenticated, service_role;

revoke all on function public.admin_recover_corpus_cover_batch(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_recover_corpus_cover_batch(integer)
  to authenticated;
revoke all on table public.corpus_cover_recovery_marks
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.corpus_cover_recovery_marks
  to service_role;

select ok(
  not has_function_privilege(
    'anon', 'public.admin_recover_corpus_cover_batch(integer)', 'EXECUTE'
  ),
  'anonymous callers cannot reach batched corpus-cover recovery'
);
select ok(
  has_function_privilege(
    'authenticated', 'public.admin_recover_corpus_cover_batch(integer)', 'EXECUTE'
  ),
  'authenticated callers can reach the administrator-gated recovery body'
);
select ok(
  not has_function_privilege(
    'service_role', 'public.admin_recover_corpus_cover_batch(integer)', 'EXECUTE'
  ),
  'service role cannot impersonate a corpus administrator through recovery'
);

select ok(not has_table_privilege('anon', 'public.corpus_cover_recovery_marks', 'SELECT'),
  'anonymous callers cannot read recovery marks');
select ok(not has_table_privilege('anon', 'public.corpus_cover_recovery_marks', 'INSERT'),
  'anonymous callers cannot insert recovery marks');
select ok(not has_table_privilege('anon', 'public.corpus_cover_recovery_marks', 'UPDATE'),
  'anonymous callers cannot update recovery marks');
select ok(not has_table_privilege('anon', 'public.corpus_cover_recovery_marks', 'DELETE'),
  'anonymous callers cannot delete recovery marks');

select ok(not has_table_privilege('authenticated', 'public.corpus_cover_recovery_marks', 'SELECT'),
  'authenticated callers cannot read internal recovery marks directly');
select ok(not has_table_privilege('authenticated', 'public.corpus_cover_recovery_marks', 'INSERT'),
  'authenticated callers cannot insert internal recovery marks directly');
select ok(not has_table_privilege('authenticated', 'public.corpus_cover_recovery_marks', 'UPDATE'),
  'authenticated callers cannot update internal recovery marks directly');
select ok(not has_table_privilege('authenticated', 'public.corpus_cover_recovery_marks', 'DELETE'),
  'authenticated callers cannot delete internal recovery marks directly');

select ok(has_table_privilege('service_role', 'public.corpus_cover_recovery_marks', 'SELECT'),
  'service role can inspect internal recovery marks');
select ok(has_table_privilege('service_role', 'public.corpus_cover_recovery_marks', 'INSERT'),
  'service role can insert internal recovery marks');
select ok(has_table_privilege('service_role', 'public.corpus_cover_recovery_marks', 'UPDATE'),
  'service role can update internal recovery marks');
select ok(has_table_privilege('service_role', 'public.corpus_cover_recovery_marks', 'DELETE'),
  'service role can delete internal recovery marks');

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '91111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated',
    'batch-cover-admin@example.com', '{}', '{"display_name":"Batch Cover Admin"}', now(), now()
  ),
  (
    '92222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated',
    'batch-cover-reader@example.com', '{}', '{"display_name":"Batch Cover Reader"}', now(), now()
  );

insert into public.corpus_admins (user_id)
values ('91111111-1111-4111-8111-111111111111');

insert into public.works (id, work_key, title, author_text, contributors) values
  (
    '90000000-0000-4000-8000-000000000001',
    public.library_work_key('Deferred Cover', 'Batch Writer'),
    'Deferred Cover', 'Batch Writer',
    '[{"name":"Batch Writer","role":"author","position":0}]'::jsonb
  ),
  (
    '90000000-0000-4000-8000-000000000002',
    public.library_work_key('First Good Cover', 'Batch Writer'),
    'First Good Cover', 'Batch Writer',
    '[{"name":"Batch Writer","role":"author","position":0}]'::jsonb
  ),
  (
    '90000000-0000-4000-8000-000000000003',
    public.library_work_key('Second Good Cover', 'Batch Writer'),
    'Second Good Cover', 'Batch Writer',
    '[{"name":"Batch Writer","role":"author","position":0}]'::jsonb
  );

insert into public.books (
  id, owner_id, corpus_work_id, title, authors_display, ownership,
  cover_url, cover_source, cover_source_url
) values
  (
    '91000000-0000-4000-8000-000000000001',
    '91111111-1111-4111-8111-111111111111',
    '90000000-0000-4000-8000-000000000001',
    'Deferred Cover', 'Batch Writer', 'owned',
    'https://books.google.com/books/content?id=deferred', 'google',
    'https://books.google.com/books?id=deferred'
  ),
  (
    '91000000-0000-4000-8000-000000000002',
    '91111111-1111-4111-8111-111111111111',
    '90000000-0000-4000-8000-000000000002',
    'First Good Cover', 'Batch Writer', 'owned',
    'https://books.google.com/books/content?id=first-good', 'google',
    'https://books.google.com/books?id=first-good'
  ),
  (
    '91000000-0000-4000-8000-000000000003',
    '91111111-1111-4111-8111-111111111111',
    '90000000-0000-4000-8000-000000000003',
    'Second Good Cover', 'Batch Writer', 'owned',
    'https://books.google.com/books/content?id=second-good', 'google',
    'https://books.google.com/books?id=second-good'
  );

create function public.test_reject_deferred_cover_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id = '90000000-0000-4000-8000-000000000001'::uuid then
    raise exception 'deliberate recovery fixture failure';
  end if;
  return new;
end;
$$;

create trigger test_reject_deferred_cover_update
  before update on public.works
  for each row execute function public.test_reject_deferred_cover_update();

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"92222222-2222-4222-8222-222222222222","role":"authenticated","iss":"http://127.0.0.1:55321/auth/v1"}',
  true
);

select throws_ok(
  $$select public.admin_recover_corpus_cover_batch(1)$$,
  '42501', null, 'an ordinary reader cannot run batched corpus-cover recovery'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"91111111-1111-4111-8111-111111111111","role":"authenticated","iss":"http://127.0.0.1:55321/auth/v1"}',
  true
);

select throws_ok(
  $$select public.admin_recover_corpus_cover_batch(0)$$,
  '22023', null, 'a zero-sized recovery batch is rejected'
);
select throws_ok(
  $$select public.admin_recover_corpus_cover_batch(26)$$,
  '22023', null, 'a recovery batch cannot exceed the hard limit of 25'
);

select is(
  public.admin_recover_corpus_cover_batch(1) ->> 'failed',
  '1',
  'a failing first source is contained within its one-row batch'
);
reset role;
select ok(
  (
    select not succeeded and retry_after > now() and attempt_count = 1
    from public.corpus_cover_recovery_marks
    where book_id = '91000000-0000-4000-8000-000000000001'
  ),
  'a failed source receives a deferred retry mark instead of starving the queue'
);
set local role authenticated;
select is(
  public.admin_recover_corpus_cover_batch(1) ->> 'scanned',
  '1',
  'the next batch advances past the deferred failure'
);
reset role;
select is(
  (
    select count(*)::text from public.corpus_cover_recovery_marks
    where succeeded
  ),
  '1',
  'only the successful source is marked complete after the second batch'
);
set local role authenticated;
select is(
  public.admin_recover_corpus_cover_batch(1) ->> 'scanned',
  '1',
  'the hard batch bound leaves the second healthy source for a later call'
);
select is(
  public.admin_recover_corpus_cover_batch(1) ->> 'scanned',
  '0',
  'completed and deferred sources are skipped on an immediate repeat'
);
select is(
  public.admin_recover_corpus_cover_batch(1) ->> 'maybeMore',
  'false',
  'an empty bounded call reports that no immediately eligible source remains'
);
select is(
  (
    select count(*)::text from public.works
    where id in (
      '90000000-0000-4000-8000-000000000002',
      '90000000-0000-4000-8000-000000000003'
    )
      and cover_url is not null
  ),
  '2',
  'healthy source covers are preserved despite an earlier source failure'
);

update public.books
set cover_source_url = 'https://books.google.com/books?id=first-good&edition=2'
where id = '91000000-0000-4000-8000-000000000002';

select is(
  public.admin_recover_corpus_cover_batch(1) ->> 'scanned',
  '1',
  'a changed source fingerprint is eligible immediately'
);
reset role;
select is(
  (
    select attempt_count from public.corpus_cover_recovery_marks
    where book_id = '91000000-0000-4000-8000-000000000002'
  ),
  1,
  'a changed source begins a fresh attempt history'
);
set local role authenticated;
select is(
  public.admin_recover_corpus_cover_batch(1) ->> 'scanned',
  '0',
  'an unchanged successful fingerprint is idempotent'
);

reset role;
drop trigger test_reject_deferred_cover_update on public.works;
update public.corpus_cover_recovery_marks
set retry_after = now() - interval '1 minute'
where book_id = '91000000-0000-4000-8000-000000000001';

set local role authenticated;
select is(
  public.admin_recover_corpus_cover_batch(1) ->> 'scanned',
  '1',
  'a deferred source resumes once its retry window opens'
);
reset role;
select is(
  (
    select attempt_count from public.corpus_cover_recovery_marks
    where book_id = '91000000-0000-4000-8000-000000000001'
  ),
  2,
  'a retry of the same fingerprint increments its attempt history'
);
set local role authenticated;
select is(
  (
    select count(*)::text from public.works
    where id in (
      '90000000-0000-4000-8000-000000000001',
      '90000000-0000-4000-8000-000000000002',
      '90000000-0000-4000-8000-000000000003'
    )
      and cover_url is not null
  ),
  '3',
  'all source covers are preserved after the deferred retry succeeds'
);

select * from finish();
rollback;
