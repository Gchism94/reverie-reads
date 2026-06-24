-- Atomic merge safety (acceptance Task 3): a failure mid-merge must leave NO partial state
-- (no orphaned list refs, no lost reads), and a normal merge folds everything onto the primary.

begin;
select plan(11);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('11111111-2222-3333-4444-555555555555', 'authenticated', 'authenticated', 'merger@example.com', '{}'::jsonb, '{}'::jsonb, now(), now());

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-2222-3333-4444-555555555555","role":"authenticated"}', true);

-- Primary (keep) and loser (fold in), both owned by the same user.
insert into public.books (id, owner_id, title, rating, fave)
values
  ('aaaa1111-0000-0000-0000-000000000001', '11111111-2222-3333-4444-555555555555', 'Dup', 3, false),
  ('bbbb2222-0000-0000-0000-000000000002', '11111111-2222-3333-4444-555555555555', 'Dup', 0, false);
insert into public.reads (book_id, owner_id, read_on)
values
  ('aaaa1111-0000-0000-0000-000000000001', '11111111-2222-3333-4444-555555555555', '2025-01-01'),
  ('bbbb2222-0000-0000-0000-000000000002', '11111111-2222-3333-4444-555555555555', '2025-05-05');
insert into public.lists (id, owner_id, name, kind)
values ('cccc3333-0000-0000-0000-000000000003', '11111111-2222-3333-4444-555555555555', 'TBR', 'tbr');
insert into public.list_items (list_id, book_id, owner_id)
values ('cccc3333-0000-0000-0000-000000000003', 'bbbb2222-0000-0000-0000-000000000002', '11111111-2222-3333-4444-555555555555');

-- ── Partial failure: a bad read_status makes the field update violate its CHECK ──
select throws_ok(
  $$ select public.merge_books('aaaa1111-0000-0000-0000-000000000001', 'bbbb2222-0000-0000-0000-000000000002', '{"read_status":"INVALID"}'::jsonb) $$,
  null, null, 'a bad value aborts the whole merge');

-- ...and the entire operation rolled back: nothing moved, nothing deleted, nothing orphaned.
select is((select count(*)::int from public.books where id = 'bbbb2222-0000-0000-0000-000000000002'), 1, 'loser still exists after failed merge');
select is((select count(*)::int from public.reads where book_id = 'aaaa1111-0000-0000-0000-000000000001'), 1, 'primary reads unchanged (no orphan moved in)');
select is((select count(*)::int from public.reads where book_id = 'bbbb2222-0000-0000-0000-000000000002'), 1, 'loser read not moved away');
select is((select count(*)::int from public.list_items where book_id = 'aaaa1111-0000-0000-0000-000000000001'), 0, 'no list membership moved to primary');
select is((select count(*)::int from public.list_items where book_id = 'bbbb2222-0000-0000-0000-000000000002'), 1, 'loser list membership intact');

-- ── Normal merge: succeeds and folds everything onto the primary ──
select lives_ok(
  $$ select public.merge_books('aaaa1111-0000-0000-0000-000000000001', 'bbbb2222-0000-0000-0000-000000000002', '{"read_status":"Read","fave":true,"rating":5}'::jsonb) $$,
  'a normal merge succeeds');
select is((select count(*)::int from public.books where id = 'bbbb2222-0000-0000-0000-000000000002'), 0, 'loser removed after merge');
select is((select count(*)::int from public.reads where book_id = 'aaaa1111-0000-0000-0000-000000000001'), 2, 'primary now holds both reads (no read lost)');
select is((select count(*)::int from public.list_items where list_id = 'cccc3333-0000-0000-0000-000000000003' and book_id = 'aaaa1111-0000-0000-0000-000000000001'), 1, 'list membership moved to primary');
select is((select rating::int from public.books where id = 'aaaa1111-0000-0000-0000-000000000001'), 5, 'merged rating applied (no rating lost)');

select * from finish();
rollback;
