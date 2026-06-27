-- D3: reading orders. Proves the new tables are owner-scoped (RLS) — a user can never read or
-- write another user's orders or items — and that an item must be exactly a book XOR a series.

begin;
select plan(9);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated',
   'alice@example.com', '{}'::jsonb, '{"display_name":"Alice"}'::jsonb, now(), now()),
  ('22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated',
   'bob@example.com', '{}'::jsonb, '{}'::jsonb, now(), now());

-- ---- act as Alice: a book, an order, and two items (a book + a series) ----
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

insert into public.books (id, owner_id, title, series)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Alpha 1', 'Alpha');

select lives_ok(
  $$insert into public.reading_orders (id, owner_id, name)
    values ('00000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'Interleaved')$$,
  'Alice can create a reading order');

select lives_ok(
  $$insert into public.reading_order_items (reading_order_id, owner_id, position, book_id)
    values ('00000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 1024,
            'aaaaaaaa-0000-0000-0000-000000000001')$$,
  'Alice can add a book item');

select lives_ok(
  $$insert into public.reading_order_items (reading_order_id, owner_id, position, series)
    values ('00000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 2048, 'Beta')$$,
  'Alice can add a series item');

-- The book-XOR-series constraint rejects both-set and neither-set.
select throws_ok(
  $$insert into public.reading_order_items (reading_order_id, owner_id, position, book_id, series)
    values ('00000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 3072,
            'aaaaaaaa-0000-0000-0000-000000000001', 'Beta')$$,
  '23514', null, 'an item cannot be BOTH a book and a series');
select throws_ok(
  $$insert into public.reading_order_items (reading_order_id, owner_id, position)
    values ('00000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 4096)$$,
  '23514', null, 'an item must be a book OR a series (not neither)');

select is((select count(*)::int from public.reading_order_items), 2, 'Alice sees her two items');

-- ---- act as Bob: cannot see or write Alice's orders/items ----
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

select is((select count(*)::int from public.reading_orders), 0, 'Bob cannot see Alice''s orders');
select is((select count(*)::int from public.reading_order_items), 0, 'Bob cannot see Alice''s items');
select throws_ok(
  $$insert into public.reading_order_items (reading_order_id, owner_id, position, series)
    values ('00000000-0000-0000-0000-0000000000a1', '22222222-2222-2222-2222-222222222222', 1, 'Sneaky')$$,
  '42501', null, 'Bob cannot add an item to Alice''s order (RLS)');

select * from finish();
rollback;
