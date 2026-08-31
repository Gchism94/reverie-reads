begin;
select plan(11);

select has_column('public', 'books', 'series_claim',
  'books carries field-level series provenance');
select col_not_null('public', 'books', 'series_claim',
  'series provenance is never SQL null');

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('3b3b3b3b-0000-0000-0000-00000000000d', 'authenticated', 'authenticated',
        'series-claim@example.com', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.books (id, owner_id, title)
values ('db000000-0000-0000-0000-000000000001',
        '3b3b3b3b-0000-0000-0000-00000000000d', 'Claim Fixture');

select is(
  (select series_claim ->> 'origin' from public.books
    where id = 'db000000-0000-0000-0000-000000000001'),
  'unknown', 'historical and uninstrumented inserts fail closed to unknown');

select throws_ok(
  $$update public.books set series_claim = '{"origin":"catalog_guess"}'::jsonb
    where id = 'db000000-0000-0000-0000-000000000001'$$,
  '23514', null, 'an untyped origin is rejected');
select throws_ok(
  $$update public.books set series_claim = '{}'::jsonb
    where id = 'db000000-0000-0000-0000-000000000001'$$,
  '23514', null, 'a claim without an origin is rejected');
select throws_ok(
  $$update public.books set series_claim = '[]'::jsonb
    where id = 'db000000-0000-0000-0000-000000000001'$$,
  '23514', null, 'a non-object claim is rejected');
select throws_ok(
  $$update public.books set series_claim = '{"origin":"reader","confidence":"certain"}'::jsonb
    where id = 'db000000-0000-0000-0000-000000000001'$$,
  '23514', null, 'an untyped confidence is rejected');
select throws_ok(
  $$update public.books set series_claim = '{"origin":"reader","source":{"bad":"shape"}}'::jsonb
    where id = 'db000000-0000-0000-0000-000000000001'$$,
  '23514', null, 'optional claim detail must use the typed text shape');

update public.books
set series = 'Reader Saga',
    series_claim = '{"origin":"reader","source":"book_edit"}'::jsonb
where id = 'db000000-0000-0000-0000-000000000001';
select is(
  (select series_claim ->> 'source' from public.books
    where id = 'db000000-0000-0000-0000-000000000001'),
  'book_edit', 'an explicit same-statement provenance update is retained');

update public.books set series = 'Legacy Rewrite'
where id = 'db000000-0000-0000-0000-000000000001';
select ok(
  (select series = 'Reader Saga' and series_claim ->> 'source' = 'book_edit'
   from public.books where id = 'db000000-0000-0000-0000-000000000001'),
  'a series-only rewrite cannot override an established structured primary membership');

select throws_ok(
  $$set local role authenticated;
    select public.fail_closed_series_claim()$$,
  '42501', null, 'authenticated callers cannot execute the trigger function directly');

select * from finish();
rollback;
