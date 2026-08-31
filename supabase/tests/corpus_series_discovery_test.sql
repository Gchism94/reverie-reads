begin;
select plan(31);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('b1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'series-admin@example.com', '{}', '{"display_name":"Series Admin"}', now(), now()),
  ('b1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'series-reader@example.com', '{}', '{"display_name":"Series Reader"}', now(), now());

insert into public.corpus_admins (user_id)
values ('b1000000-0000-4000-8000-000000000001');

insert into public.works (id, work_key, title, author_text, contributors, series, position)
values
  ('b2000000-0000-4000-8000-000000000001', 'unknown-series|writer', 'Unknown Series', 'A Writer', '[]', null, null),
  ('b2000000-0000-4000-8000-000000000002', 'no-series|writer', 'No Series Result', 'A Writer', '[]', null, null),
  ('b2000000-0000-4000-8000-000000000003', 'high-series|writer', 'High Match', 'A Writer', '[]', null, 9),
  ('b2000000-0000-4000-8000-000000000004', 'medium-series|writer', 'Medium Match', 'A Writer', '[]', null, null),
  ('b2000000-0000-4000-8000-000000000005', 'conflict-series|writer', 'Conflict Match', 'A Writer', '[]', 'Curated Saga', 4),
  ('b2000000-0000-4000-8000-000000000006', 'position-conflict|writer', 'Position Conflict', 'A Writer', '[]', 'Same Saga', 4);

select has_column('public', 'works', 'series_check_state',
  'works store a series observation separately from publication status');
select has_column('public', 'works', 'series_checked_at',
  'series discovery has its own recheck clock');
select has_table('public', 'work_series_suggestions',
  'uncertain corpus series matches have an explicit review queue');

select is(
  (select series_check_state from public.works where id = 'b2000000-0000-4000-8000-000000000001'),
  'unknown', 'existing and new works begin unclassified, not presumed standalone');

set local role anon;
select throws_ok(
  $$select public.record_corpus_series_discovery(
    'b2000000-0000-4000-8000-000000000001', '{}'::jsonb, now()
  )$$,
  '42501', null, 'anonymous is refused at the function privilege boundary');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"b1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$select public.record_corpus_series_discovery(
    'b2000000-0000-4000-8000-000000000001', '{}'::jsonb, now()
  )$$,
  '42501', null, 'an ordinary reader cannot record shared series evidence');
select throws_ok(
  $$insert into public.work_series_suggestions
    (work_id, proposed_series, source, confidence, checked_at)
    values ('b2000000-0000-4000-8000-000000000001', 'Injected', 'reader', 'high', now())$$,
  '42501', null, 'authenticated direct writes are refused by table privilege');
select is(
  (select count(*)::int from public.work_series_suggestions),
  0, 'RLS hides the administrator queue from an ordinary reader');

select set_config('request.jwt.claims',
  '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(
  public.complete_corpus_work_metadata(
    'b2000000-0000-4000-8000-000000000001',
    '{"series":"Bypass Saga","position":1,"provenance":{"series":{"source":"legacy"},"seriesPosition":{"source":"legacy"}}}'::jsonb,
    '2026-09-11T00:59:00Z'
  ),
  'b2000000-0000-4000-8000-000000000001'::uuid,
  'the existing general completion endpoint remains compatible for older clients');
select ok(
  (select series is null and position is null and not (metadata_provenance ? 'series')
   from public.works where id = 'b2000000-0000-4000-8000-000000000001'),
  'the general completion endpoint cannot bypass reviewable series discovery');

select is(
  public.record_corpus_series_discovery(
    'b2000000-0000-4000-8000-000000000001',
    '{"matched":false,"confidence":"none","source":"catalog"}'::jsonb,
    '2026-09-11T01:00:00Z'
  ) ->> 'outcome',
  'unresolved', 'an unmatched lookup remains recheckable rather than asserting standalone');
select ok(
  (select series is null and status is null and series_check_state = 'unresolved'
   from public.works where id = 'b2000000-0000-4000-8000-000000000001'),
  'unresolved evidence does not manufacture series membership or change publication status');

select is(
  public.record_corpus_series_discovery(
    'b2000000-0000-4000-8000-000000000002',
    '{"matched":true,"confidence":"high","source":"hardcover","series":null}'::jsonb,
    '2026-09-11T01:01:00Z'
  ) ->> 'outcome',
  'no_series', 'a matched catalog record may record that no series was returned');
select ok(
  (select series is null and series_check_state = 'no_series' and status is null
   from public.works where id = 'b2000000-0000-4000-8000-000000000002'),
  'no-series evidence stays separate from the standalone publication-status field');

select is(
  public.record_corpus_series_discovery(
    'b2000000-0000-4000-8000-000000000003',
    '{"matched":true,"confidence":"high","source":"hardcover","sourceRef":"hc-3","series":"The Sequence","position":2}'::jsonb,
    '2026-09-11T01:02:00Z'
  ) ->> 'outcome',
  'applied', 'high-confidence positive evidence fills a blank shared series');
select ok(
  (select series = 'The Sequence' and position = 2 and series_check_state = 'found'
   from public.works where id = 'b2000000-0000-4000-8000-000000000003'),
  'the accepted positive evidence preserves its series and position');
select is(
  (select metadata_provenance -> 'series' ->> 'sourceRef'
   from public.works where id = 'b2000000-0000-4000-8000-000000000003'),
  'hc-3', 'applied series evidence retains source identity');

select is(
  public.record_corpus_series_discovery(
    'b2000000-0000-4000-8000-000000000004',
    '{"matched":true,"confidence":"medium","source":"hardcover","series":"Possible Saga","position":1}'::jsonb,
    '2026-09-11T01:03:00Z'
  ) ->> 'outcome',
  'review', 'medium-confidence positive evidence waits for administrator review');
select ok(
  (select series is null and series_check_state = 'review'
   from public.works where id = 'b2000000-0000-4000-8000-000000000004'),
  'a pending proposal does not pre-write the shared work');
select is(
  (select count(*)::int from public.work_series_suggestions
   where work_id = 'b2000000-0000-4000-8000-000000000004' and status = 'pending'),
  1, 'the uncertain match appears once in the administrator queue');

select lives_ok(
  $$select public.review_corpus_series_suggestion(
    (select id from public.work_series_suggestions
     where work_id = 'b2000000-0000-4000-8000-000000000004' and status = 'pending'),
    'accept'
  )$$,
  'an administrator can accept a pending series proposal');
select ok(
  (select series = 'Possible Saga' and position = 1 and series_check_state = 'found'
   from public.works where id = 'b2000000-0000-4000-8000-000000000004'),
  'acceptance writes the reviewed shared series and position');
select is(
  (select status from public.work_series_suggestions
   where work_id = 'b2000000-0000-4000-8000-000000000004'),
  'accepted', 'the accepted proposal remains as review history');

select is(
  public.record_corpus_series_discovery(
    'b2000000-0000-4000-8000-000000000005',
    '{"matched":true,"confidence":"high","source":"hardcover","series":"Conflicting Saga","position":1}'::jsonb,
    '2026-09-11T01:04:00Z'
  ) ->> 'outcome',
  'review', 'high-confidence evidence still cannot replace a conflicting curated series silently');
select is(
  (select concat_ws('|', series, position) from public.works
   where id = 'b2000000-0000-4000-8000-000000000005'),
  'Curated Saga|4', 'the conflict leaves existing shared metadata intact before review');
select lives_ok(
  $$select public.review_corpus_series_suggestion(
    (select id from public.work_series_suggestions
     where work_id = 'b2000000-0000-4000-8000-000000000005' and status = 'pending'),
    'dismiss'
  )$$,
  'an administrator can dismiss a conflicting proposal');
select is(
  (select concat_ws('|', series, position, series_check_state) from public.works
   where id = 'b2000000-0000-4000-8000-000000000005'),
  'Curated Saga|4|found', 'dismissal preserves the curated series and closes the review state');

select is(
  public.record_corpus_series_discovery(
    'b2000000-0000-4000-8000-000000000006',
    '{"matched":true,"confidence":"high","source":"hardcover","series":"Same Saga","position":1}'::jsonb,
    '2026-09-11T01:05:00Z'
  ) ->> 'outcome',
  'review', 'a high-confidence position conflict still waits for administrator review');
select ok(
  (select series = 'Same Saga' and position = 4 and series_check_state = 'review'
   from public.works where id = 'b2000000-0000-4000-8000-000000000006'),
  'a position conflict leaves the existing shared membership intact before review');

reset role;
select ok(
  (select count(*) >= 4 from public.work_metadata_edits
   where work_id in (
     'b2000000-0000-4000-8000-000000000001',
     'b2000000-0000-4000-8000-000000000002',
     'b2000000-0000-4000-8000-000000000003',
     'b2000000-0000-4000-8000-000000000004',
     'b2000000-0000-4000-8000-000000000005'
   )),
  'series discovery and review writes remain append-only audited');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select public.review_corpus_series_suggestion(
    (select id from public.work_series_suggestions
     where work_id = 'b2000000-0000-4000-8000-000000000004'),
    'accept'
  )$$,
  'P0001', null, 'a reviewed suggestion cannot be replayed');
reset role;

select * from finish();
rollback;
