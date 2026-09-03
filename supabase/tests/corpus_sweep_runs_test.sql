begin;
select plan(60);

-- Dirty every new-object ACL first. This reproduces the production project's legacy defaults and
-- proves the explicit resets, rather than letting a clean local default make negative tests vacuous.
grant select, insert, update, delete on table public.corpus_sweep_runs
  to public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.corpus_sweep_run_items
  to public, anon, authenticated, service_role;
revoke all on table public.corpus_sweep_runs from public, anon, authenticated, service_role;
grant select on table public.corpus_sweep_runs to authenticated;
grant select, insert, update, delete on table public.corpus_sweep_runs to service_role;
revoke all on table public.corpus_sweep_run_items from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.corpus_sweep_run_items to service_role;

select ok(not has_table_privilege('anon', 'public.corpus_sweep_runs', 'SELECT'),
  'anonymous callers cannot read corpus sweep runs');
select ok(not has_table_privilege('anon', 'public.corpus_sweep_runs', 'INSERT'),
  'anonymous callers cannot create corpus sweep runs');
select ok(has_table_privilege('authenticated', 'public.corpus_sweep_runs', 'SELECT'),
  'authenticated callers can reach the administrator-filtered run view');
select ok(not has_table_privilege('authenticated', 'public.corpus_sweep_runs', 'INSERT'),
  'authenticated callers cannot insert run rows directly');
select ok(not has_table_privilege('authenticated', 'public.corpus_sweep_runs', 'UPDATE'),
  'authenticated callers cannot mutate run rows directly');
select ok(has_table_privilege('service_role', 'public.corpus_sweep_runs', 'SELECT'),
  'the workflow service can read run rows');
select ok(has_table_privilege('service_role', 'public.corpus_sweep_runs', 'INSERT'),
  'the workflow service can insert run rows');
select ok(has_table_privilege('service_role', 'public.corpus_sweep_runs', 'UPDATE'),
  'the workflow service can update run rows');
select ok(has_table_privilege('service_role', 'public.corpus_sweep_runs', 'DELETE'),
  'the workflow service can delete run rows');

select ok(not has_table_privilege('anon', 'public.corpus_sweep_run_items', 'SELECT'),
  'anonymous callers cannot read sweep checkpoints');
select ok(not has_table_privilege('authenticated', 'public.corpus_sweep_run_items', 'SELECT'),
  'administrators cannot bypass the run summary to read internal checkpoints');
select ok(not has_table_privilege('authenticated', 'public.corpus_sweep_run_items', 'INSERT'),
  'administrators cannot manufacture sweep checkpoints');
select ok(has_table_privilege('service_role', 'public.corpus_sweep_run_items', 'SELECT'),
  'the workflow service can read checkpoints');
select ok(has_table_privilege('service_role', 'public.corpus_sweep_run_items', 'INSERT'),
  'the workflow service can insert checkpoints');
select ok(has_table_privilege('service_role', 'public.corpus_sweep_run_items', 'UPDATE'),
  'the workflow service can update checkpoints');
select ok(has_table_privilege('service_role', 'public.corpus_sweep_run_items', 'DELETE'),
  'the workflow service can delete checkpoints');

select ok(not has_function_privilege('anon', 'public.start_corpus_sweep()', 'EXECUTE'),
  'anonymous callers cannot start a corpus sweep');
select ok(has_function_privilege('authenticated', 'public.start_corpus_sweep()', 'EXECUTE'),
  'an authenticated caller can reach the administrator-gated start body');
select ok(not has_function_privilege('service_role', 'public.start_corpus_sweep()', 'EXECUTE'),
  'the service cannot invent an administrator-initiated sweep');
select ok(not has_function_privilege(
  'authenticated', 'public.service_claim_corpus_sweep_item(uuid)', 'EXECUTE'
), 'an authenticated caller cannot claim workflow items');
select ok(has_function_privilege(
  'service_role', 'public.service_claim_corpus_sweep_item(uuid)', 'EXECUTE'
), 'the workflow service can claim items');
select ok(not has_function_privilege(
  'anon', 'public.service_authorize_corpus_sweep_work(uuid,uuid)', 'EXECUTE'
), 'anonymous callers cannot mint a cover or series capability');
select ok(not has_function_privilege(
  'authenticated', 'public.service_authorize_corpus_sweep_work(uuid,uuid)', 'EXECUTE'
), 'authenticated callers cannot mint a workflow capability');
select ok(has_function_privilege(
  'service_role', 'public.service_authorize_corpus_sweep_work(uuid,uuid)', 'EXECUTE'
), 'the workflow service can validate a claimed work');
select ok(not has_function_privilege(
  'authenticated', 'public.service_apply_corpus_sweep_cover(uuid,uuid,jsonb)', 'EXECUTE'
), 'an authenticated caller cannot apply a workflow cover checkpoint');
select ok(has_function_privilege(
  'service_role', 'public.service_apply_corpus_sweep_cover(uuid,uuid,jsonb)', 'EXECUTE'
), 'the workflow service can apply a cover checkpoint');

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    'a1111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated',
    'sweep-admin@example.com', '{}', '{"display_name":"Sweep Admin"}', now(), now()
  ),
  (
    'a2222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated',
    'sweep-reader@example.com', '{}', '{"display_name":"Sweep Reader"}', now(), now()
  );

insert into public.corpus_admins (user_id)
values ('a1111111-1111-4111-8111-111111111111');

insert into public.works (id, work_key, title, author_text, contributors) values
  (
    'a0000000-0000-4000-8000-000000000001', 'durableone|sweepwriter',
    'Durable One', 'Sweep Writer',
    '[{"name":"Sweep Writer","role":"author","position":0}]'::jsonb
  ),
  (
    'a0000000-0000-4000-8000-000000000002', 'durabletwo|sweepwriter',
    'Durable Two', 'Sweep Writer',
    '[{"name":"Sweep Writer","role":"author","position":0}]'::jsonb
  ),
  (
    'a0000000-0000-4000-8000-000000000003', 'durablethree|sweepwriter',
    'Durable Three', 'Sweep Writer',
    '[{"name":"Sweep Writer","role":"author","position":0}]'::jsonb
  );

insert into storage.objects (bucket_id, name, owner) values (
  'covers',
  'w/a0000000-0000-4000-8000-000000000001/revcover.webp',
  'a1111111-1111-4111-8111-111111111111'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a2222222-2222-4222-8222-222222222222","role":"authenticated","iss":"http://127.0.0.1:55321/auth/v1"}',
  true
);
select throws_ok(
  $$select public.start_corpus_sweep()$$,
  '42501', null, 'an ordinary reader cannot start a corpus sweep'
);
select is((select count(*) from public.corpus_sweep_runs), 0::bigint,
  'RLS hides corpus sweep runs from an ordinary reader');

select set_config(
  'request.jwt.claims',
  '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated","iss":"http://127.0.0.1:55321/auth/v1"}',
  true
);
select public.start_corpus_sweep() as first_run \gset
select is(public.start_corpus_sweep(), :'first_run'::uuid,
  'repeated starts reconnect to the one active run');
select is((select count(*) from public.corpus_sweep_runs), 1::bigint,
  'the active-run index prevents duplicate rows');
select is(
  (select requested_by from public.corpus_sweep_runs where id = :'first_run'),
  'a1111111-1111-4111-8111-111111111111'::uuid,
  'the durable run records its initiating administrator'
);
select is(
  (select requested_issuer from public.corpus_sweep_runs where id = :'first_run'),
  'http://127.0.0.1:55321/auth/v1',
  'the durable run records the gateway-verified issuer needed for later cover validation'
);

reset role;
set local role service_role;
select is(public.service_claim_corpus_sweep_launch(:'first_run'), true,
  'the first API request claims the workflow launch');
select is(public.service_claim_corpus_sweep_launch(:'first_run'), false,
  'a concurrent API request cannot launch the same workflow');
select throws_ok(
  $$select public.service_begin_corpus_sweep(
    (select id from public.corpus_sweep_runs where status = 'queued'),
    array_fill('a0000000-0000-4000-8000-000000000001'::uuid, array[401]),
    401
  )$$,
  '22023', null, 'the database enforces the established 400-work run limit'
);
select is(public.service_begin_corpus_sweep(
  :'first_run',
  array[
    'a0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000002'
  ]::uuid[],
  3
), 2, 'workflow initialization snapshots the candidate set once');
select is(public.service_begin_corpus_sweep(
  :'first_run',
  array['a0000000-0000-4000-8000-000000000003']::uuid[],
  99
), 2, 'workflow initialization is replay-safe');
select ok((
  select total_count = 3 and (
    select count(*) from public.corpus_sweep_run_items item where item.run_id = :'first_run'
  ) = 2
  from public.corpus_sweep_runs where id = :'first_run'
), 'a replayed initialization cannot change the persisted candidate snapshot or total');
select is(
  public.service_defer_corpus_sweep_cover_recovery(:'first_run', 1, 'fixture recovery outage'),
  true,
  'a cover recovery failure is recorded without failing the classification run'
);
select ok((
  select recovery_failed_batch_count = 1 and recovery_maybe_more
    and error_message = 'fixture recovery outage'
  from public.corpus_sweep_runs where id = :'first_run'
), 'the failed recovery batch remains visible and resumable');
select is(
  public.service_defer_corpus_sweep_cover_recovery(:'first_run', 1, 'replayed outage'),
  true,
  'a replayed recovery failure checkpoint is a no-op'
);
select is(
  (select recovery_failed_batch_count from public.corpus_sweep_runs where id = :'first_run'),
  1,
  'a replayed recovery failure does not double-count the failed batch'
);
select is(
  public.service_authorize_corpus_sweep_work(
    :'first_run', 'a0000000-0000-4000-8000-000000000001'
  ),
  null::uuid,
  'an unclaimed item cannot authorize an Edge Function side effect'
);
select public.service_claim_corpus_sweep_item(:'first_run') as first_work \gset
select is(:'first_work'::uuid, 'a0000000-0000-4000-8000-000000000001'::uuid,
  'claiming follows the durable candidate order');
select is(
  public.service_claim_corpus_sweep_item(:'first_run'),
  :'first_work'::uuid,
  'a replayed claim returns the already-running checkpoint'
);
select is(
  (select attempt_count from public.corpus_sweep_run_items
    where run_id = :'first_run' and work_id = :'first_work'),
  1,
  'a replayed claim does not increment the checkpoint attempt count'
);
select is(
  public.service_authorize_corpus_sweep_work(:'first_run', :'first_work'),
  'a1111111-1111-4111-8111-111111111111'::uuid,
  'a claimed item resolves to the recorded administrator actor'
);
select is(
  public.service_apply_corpus_sweep_cover(
    :'first_run', :'first_work', jsonb_build_object(
      'coverUrl',
      'http://127.0.0.1:55321/storage/v1/object/public/covers/w/' || :'first_work' || '/revcover.webp',
      'coverSource', 'url',
      'coverSourceUrl', 'https://example.test/established-cover.jpg',
      'coverColor', '#123456'
    )
  ),
  true,
  'the workflow preserves an established cover before attempting metadata providers'
);
select ok((
  select cover_url like '%/covers/w/' || :'first_work' || '/revcover.webp'
    and enriched_at is null
  from public.works where id = :'first_work'
), 'the early cover checkpoint leaves the work eligible after a later provider failure');
select is(
  public.service_complete_corpus_sweep_item(
    :'first_run', :'first_work', '{"pages":321}'::jsonb,
    '{"matched":false,"confidence":"none","source":"catalog"}'::jsonb,
    '2026-09-03T01:00:00Z', '{"provider":"fixture"}'::jsonb
  ),
  true,
  'the service wrapper applies one existing fill-only and series-classification transaction'
);
select is(
  public.service_complete_corpus_sweep_item(
    :'first_run', :'first_work', '{"pages":999}'::jsonb,
    '{"matched":false,"confidence":"none","source":"catalog"}'::jsonb,
    '2026-09-03T01:00:00Z', '{}'::jsonb
  ),
  false,
  'a replayed completion is a no-op'
);
select ok((
  select pages = 321 and series_check_state = 'unresolved'
  from public.works where id = :'first_work'
), 'workflow writes preserve the existing metadata and series semantics');
select ok((
  select scanned_count = 1 and filled_count = 1 and nothing_count = 0 and failed_count = 0
  from public.corpus_sweep_runs where id = :'first_run'
), 'replayed completion increments run counters exactly once');

select public.service_claim_corpus_sweep_item(:'first_run') as second_work \gset
select is(
  public.service_defer_corpus_sweep_item(
    :'first_run', :'second_work', 'fixture provider outage', '{"deferred":true}'::jsonb
  ),
  true,
  'one provider failure is checkpointed without failing the run'
);
select is(public.service_claim_corpus_sweep_item(:'first_run'), null::uuid,
  'the queue advances past a deferred item');
select is(public.service_finish_corpus_sweep(:'first_run', null), :'first_run'::uuid,
  'the workflow can finish after processing every checkpoint');
select ok((
  select status = 'completed' and phase = 'complete' and failed_count = 1
    and total_count = 3 and scanned_count + failed_count = 2
  from public.corpus_sweep_runs where id = :'first_run'
), 'a capped run preserves the full eligible total and reports unreached works honestly');

reset role;
set local role authenticated;
select public.start_corpus_sweep() as cancelled_run \gset
select is(
  public.request_corpus_sweep_cancel(:'cancelled_run'),
  :'cancelled_run'::uuid,
  'an administrator can request cancellation of an active run'
);
reset role;
set local role service_role;
select is(
  public.service_begin_corpus_sweep(
    :'cancelled_run', array['a0000000-0000-4000-8000-000000000001']::uuid[], 1
  ),
  1,
  'a pre-start cancellation still records the intended candidate snapshot'
);
select ok((
  select status = 'cancelled' and completed_at is not null
  from public.corpus_sweep_runs where id = :'cancelled_run'
), 'initialization honors a cancellation requested while the workflow was launching');

select * from finish();
rollback;
