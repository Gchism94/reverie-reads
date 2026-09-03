-- Reading order is private presentation state. It must never rewrite canonical volume numbers,
-- the primary books.position projection, or unreviewed historical memberships.

begin;
select plan(19);

select has_column('public', 'series_entries', 'sort_order',
  'series entries store a private reading-order key');
select has_column('public', 'series_entries', 'sort_user_edited',
  'series entries remember a reader-arranged order');
select col_not_null('public', 'series_entries', 'sort_order',
  'every series entry has a deterministic reading-order key');
select col_not_null('public', 'series_entries', 'sort_user_edited',
  'every series entry has explicit order provenance');

select ok(not has_function_privilege(
  'anon', 'public.set_series_reading_order(uuid,jsonb)', 'EXECUTE'),
  'anonymous callers cannot reorder a private series');
select ok(has_function_privilege(
  'authenticated', 'public.set_series_reading_order(uuid,jsonb)', 'EXECUTE'),
  'authenticated readers can call the order RPC');
select ok(not has_function_privilege(
  'service_role', 'public.set_series_reading_order(uuid,jsonb)', 'EXECUTE'),
  'service role is not granted the reader-only order RPC');

insert into auth.users
  (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('be100000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   'reading-order-owner@example.com', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('be100000-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
   'reading-order-other@example.com', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.series (id, owner_id, name) values
  ('be110000-0000-0000-0000-000000000001', 'be100000-0000-0000-0000-000000000001', 'Order Saga'),
  ('be110000-0000-0000-0000-000000000002', 'be100000-0000-0000-0000-000000000002', 'Other Saga');

insert into public.books (id, owner_id, title, series, position) values
  ('be120000-0000-0000-0000-000000000001', 'be100000-0000-0000-0000-000000000001', 'One', 'Order Saga', 1),
  ('be120000-0000-0000-0000-000000000002', 'be100000-0000-0000-0000-000000000001', 'Two', 'Order Saga', 2),
  ('be120000-0000-0000-0000-000000000003', 'be100000-0000-0000-0000-000000000001', 'Four', 'Order Saga', 4),
  ('be120000-0000-0000-0000-000000000004', 'be100000-0000-0000-0000-000000000002', 'Other', 'Other Saga', 1);

-- Omit the new columns on purpose. The compatibility trigger must initialize them for every older
-- insert path, and a historical reader-edited row must retain that provenance.
insert into public.series_entries
  (id, series_id, owner_id, position, title, author, book_id, is_primary,
   user_edited, membership_claim, position_claim)
values
  ('be130000-0000-0000-0000-000000000001', 'be110000-0000-0000-0000-000000000001',
   'be100000-0000-0000-0000-000000000001', 1, 'One', '',
   'be120000-0000-0000-0000-000000000001', true, false,
   '{"origin":"reader"}'::jsonb, '{"origin":"corpus"}'::jsonb),
  ('be130000-0000-0000-0000-000000000002', 'be110000-0000-0000-0000-000000000001',
   'be100000-0000-0000-0000-000000000001', 2, 'Two', '',
   'be120000-0000-0000-0000-000000000002', true, false,
   '{"origin":"corpus"}'::jsonb, '{"origin":"corpus"}'::jsonb),
  ('be130000-0000-0000-0000-000000000003', 'be110000-0000-0000-0000-000000000001',
   'be100000-0000-0000-0000-000000000001', 3, 'Unreviewed', '', null, false, false,
   '{"origin":"unknown"}'::jsonb, '{"origin":"unknown"}'::jsonb),
  ('be130000-0000-0000-0000-000000000004', 'be110000-0000-0000-0000-000000000002',
   'be100000-0000-0000-0000-000000000002', 1, 'Other', '',
   'be120000-0000-0000-0000-000000000004', true, false,
   '{"origin":"reader"}'::jsonb, '{"origin":"reader"}'::jsonb),
  ('be130000-0000-0000-0000-000000000005', 'be110000-0000-0000-0000-000000000001',
   'be100000-0000-0000-0000-000000000001', 7, 'Historical Reader Edit', '', null, false, true,
   '{"origin":"reader"}'::jsonb, '{"origin":"reader"}'::jsonb),
  ('be130000-0000-0000-0000-000000000006', 'be110000-0000-0000-0000-000000000001',
   'be100000-0000-0000-0000-000000000001', 4, 'Four', '',
   'be120000-0000-0000-0000-000000000003', true, false,
   '{"origin":"corpus"}'::jsonb, '{"origin":"corpus"}'::jsonb);

select is(
  (select sort_order::text from public.series_entries
   where id = 'be130000-0000-0000-0000-000000000006'),
  '4', 'an older insert begins in canonical order');
select is(
  (select sort_user_edited::text from public.series_entries
   where id = 'be130000-0000-0000-0000-000000000005'),
  'true', 'an older reader-edited row keeps reader order provenance');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"be100000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$select public.set_series_reading_order(
      'be110000-0000-0000-0000-000000000001',
      '[{"entry_id":"be130000-0000-0000-0000-000000000002","sort_order":1},
        {"entry_id":"be130000-0000-0000-0000-000000000001","sort_order":2}]'::jsonb)$$,
  'the owner can reorder two reviewed entries atomically');

reset role;

select is(
  (select position::text from public.series_entries
   where id = 'be130000-0000-0000-0000-000000000001'),
  '1', 'reordering leaves the canonical volume number unchanged');
select is(
  (select position::text from public.books
   where id = 'be120000-0000-0000-0000-000000000001'),
  '1', 'reordering leaves the books.position compatibility projection unchanged');
select is(
  (select string_agg(id::text || '@' || sort_order::text, ',' order by sort_order)
   from public.series_entries
   where id in ('be130000-0000-0000-0000-000000000001',
                'be130000-0000-0000-0000-000000000002')),
  'be130000-0000-0000-0000-000000000002@1,be130000-0000-0000-0000-000000000001@2',
  'the requested private reading order is stored');
select is(
  (select sort_user_edited::text from public.series_entries
   where id = 'be130000-0000-0000-0000-000000000001'),
  'true', 'a reorder records reader ownership of the private order');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"be100000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$select public.set_series_reading_order(
      'be110000-0000-0000-0000-000000000001',
      '[{"entry_id":"be130000-0000-0000-0000-000000000003","sort_order":1.5}]'::jsonb)$$,
  'set_series_reading_order: a slot does not name a confirmed live entry of this series',
  'an unreviewed historical membership cannot be rearranged through the RPC');
select throws_ok(
  $$select public.set_series_reading_order(
      'be110000-0000-0000-0000-000000000002', '[]'::jsonb)$$,
  '42501', 'series not found or not owned',
  'another reader cannot reorder this owner''s series');

reset role;

-- Trusted source corrections follow canonical position only while the private order is untouched.
update public.series_entries
   set position = 6
 where id = 'be130000-0000-0000-0000-000000000006';
select is(
  (select sort_order::text from public.series_entries
   where id = 'be130000-0000-0000-0000-000000000006'),
  '6', 'a source correction moves an untouched reading-order key with its volume');

update public.series_entries
   set position = 5
 where id = 'be130000-0000-0000-0000-000000000001';
select is(
  (select sort_order::text from public.series_entries
   where id = 'be130000-0000-0000-0000-000000000001'),
  '2', 'a source correction cannot overwrite a reader-arranged order');

update public.series_entries
   set position = 6.5,
       user_edited = true
 where id = 'be130000-0000-0000-0000-000000000006';
select is(
  (select position::text || '/' || sort_order::text from public.series_entries
   where id = 'be130000-0000-0000-0000-000000000006'),
  '6.5/6', 'editing the canonical volume does not silently reorder the shelf');

select * from finish();
rollback;
