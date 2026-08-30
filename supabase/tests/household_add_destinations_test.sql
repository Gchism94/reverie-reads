-- Explicit household destinations and opt-in peer-library additions.
begin;
select plan(30);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('a1111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated',
   'destination-a@example.com', '{}', '{"display_name":"Destination A"}', now(), now()),
  ('a2222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated',
   'destination-b@example.com', '{}', '{"display_name":"Destination B"}', now(), now()),
  ('a3333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated',
   'destination-c@example.com', '{}', '{"display_name":"Destination C"}', now(), now()),
  ('a4444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated',
   'destination-outside@example.com', '{}', '{"display_name":"Destination Outside"}', now(), now());

insert into public.households (id, name)
values ('a0000000-0000-4000-8000-000000000001', 'Destination household');
insert into public.household_members (household_id, user_id, role) values
  ('a0000000-0000-4000-8000-000000000001',
   'a1111111-1111-4111-8111-111111111111', 'owner'),
  ('a0000000-0000-4000-8000-000000000001',
   'a2222222-2222-4222-8222-222222222222', 'member'),
  ('a0000000-0000-4000-8000-000000000001',
   'a3333333-3333-4333-8333-333333333333', 'member');

insert into public.works (
  id, work_key, title, author_text, contributors, status, genre, genres,
  subgenre, subgenres, isbns
) values
  (
    'a0000000-0000-4000-8000-000000000011', 'delegatedwork|writer',
    'Delegated Work', 'D. Writer',
    '[{"name":"D. Writer","role":"author","position":0}]'::jsonb,
    'standalone', 'literary', array['literary'], 'contemporary', array['contemporary'],
    array['9780000000011']
  ),
  (
    'a0000000-0000-4000-8000-000000000012', 'bulkone|writer',
    'Bulk One', 'D. Writer',
    '[{"name":"D. Writer","role":"author","position":0}]'::jsonb,
    'standalone', null, '{}', null, '{}', array['9780000000012']
  ),
  (
    'a0000000-0000-4000-8000-000000000013', 'bulktwo|writer',
    'Bulk Two', 'D. Writer',
    '[{"name":"D. Writer","role":"author","position":0}]'::jsonb,
    'standalone', null, '{}', null, '{}', array['9780000000013']
  );

insert into public.household_works (household_id, work_id, added_by, inclusion_source)
values (
  'a0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000011',
  'a1111111-1111-4111-8111-111111111111',
  'manual'
);

insert into public.books (
  id, owner_id, corpus_work_id, title, author_last, authors_display,
  ownership, borrowed, wishlist, read_status
) values
  (
    'ab000000-0000-4000-8000-000000000012',
    'a1111111-1111-4111-8111-111111111111',
    'a0000000-0000-4000-8000-000000000012',
    'Bulk One', 'D. Writer', 'D. Writer', 'unowned', false, true, 'Unread'
  ),
  (
    'ab000000-0000-4000-8000-000000000013',
    'a1111111-1111-4111-8111-111111111111',
    'a0000000-0000-4000-8000-000000000013',
    'Bulk Two', 'D. Writer', 'D. Writer', 'unowned', false, false, 'Read'
  );

select ok(not has_function_privilege(
  'anon', 'public.set_household_member_library_adds(boolean)', 'EXECUTE'
), 'anon cannot change a member add permission');
select ok(has_function_privilege(
  'authenticated', 'public.set_household_member_library_adds(boolean)', 'EXECUTE'
), 'authenticated can change only its checked member permission');
select ok(not has_function_privilege(
  'service_role', 'public.set_household_member_library_adds(boolean)', 'EXECUTE'
), 'service role has no browser permission-toggle grant');

select ok(not has_function_privilege(
  'anon', 'public.add_personal_books_to_household(uuid[])', 'EXECUTE'
), 'anon cannot bulk add personal books to a household');
select ok(has_function_privilege(
  'authenticated', 'public.add_personal_books_to_household(uuid[])', 'EXECUTE'
), 'authenticated can use the owner-checked bulk household add');
select ok(not has_function_privilege(
  'service_role', 'public.add_personal_books_to_household(uuid[])', 'EXECUTE'
), 'service role has no browser bulk-add grant');

select ok(not has_function_privilege(
  'anon', 'public.add_corpus_work_to_member_library(uuid,uuid)', 'EXECUTE'
), 'anon cannot add to a member library');
select ok(has_function_privilege(
  'authenticated', 'public.add_corpus_work_to_member_library(uuid,uuid)', 'EXECUTE'
), 'authenticated can reach the recipient-checked delegated add');
select ok(not has_function_privilege(
  'service_role', 'public.add_corpus_work_to_member_library(uuid,uuid)', 'EXECUTE'
), 'service role has no browser delegated-add grant');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
select is(
  (select allow_member_library_adds from public.household_roster()
   where user_id = 'a2222222-2222-4222-8222-222222222222'),
  false,
  'member-library additions are denied by default'
);
select throws_ok(
  $$select public.add_corpus_work_to_member_library(
    'a0000000-0000-4000-8000-000000000011',
    'a2222222-2222-4222-8222-222222222222'
  )$$,
  '42501',
  null,
  'a peer cannot add before the recipient opts in'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a2222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);
select is(public.set_household_member_library_adds(true), true,
  'the recipient can opt in');
select is(
  (select allow_member_library_adds from public.household_roster()
   where user_id = 'a2222222-2222-4222-8222-222222222222'),
  true,
  'the roster immediately reports the recipient permission'
);
reset role;

select is(
  (select count(*)::integer from public.household_members
   where allow_member_library_adds),
  1,
  'opting in changes no other household member'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
select set_config(
  'test.destination_delegated_book',
  public.add_corpus_work_to_member_library(
    'a0000000-0000-4000-8000-000000000011',
    'a2222222-2222-4222-8222-222222222222'
  )::text,
  true
);
select is((select count(*)::integer from public.books), 2,
  'the caller cannot read the recipient personal row through books RLS');
select is(
  public.add_corpus_work_to_member_library(
    'a0000000-0000-4000-8000-000000000011',
    'a2222222-2222-4222-8222-222222222222'
  ),
  current_setting('test.destination_delegated_book')::uuid,
  'repeating a delegated add returns the same active personal row'
);
select throws_ok(
  $$select public.add_corpus_work_to_member_library(
    'a0000000-0000-4000-8000-000000000011',
    'a4444444-4444-4444-8444-444444444444'
  )$$,
  '42501',
  null,
  'a caller cannot write to an account outside the household'
);
reset role;

select is(
  (select count(*)::integer from public.books
   where id = current_setting('test.destination_delegated_book')::uuid
     and owner_id = 'a2222222-2222-4222-8222-222222222222'
     and corpus_work_id = 'a0000000-0000-4000-8000-000000000011'),
  1,
  'the delegated row belongs to the opted-in recipient and exact shared work'
);
select is(
  (select count(*)::integer from public.books
   where id = current_setting('test.destination_delegated_book')::uuid
     and ownership = 'unowned' and not borrowed and not wishlist
     and read_status = 'unset' and rating is null and not fave
     and intensity is null and darkness is null),
  1,
  'the delegated row asserts no possession, reading, rating, favourite, or level state'
);
select is(
  (select authors_display from public.books
   where id = current_setting('test.destination_delegated_book')::uuid),
  'D. Writer',
  'the delegated row copies objective contributor display metadata'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a2222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);
select is((select count(*)::integer from public.books), 1,
  'the recipient can read the delegated row as their own personal book');
select is(public.set_household_member_library_adds(false), false,
  'the recipient can opt out again');
reset role;
select is(
  (select allow_member_library_adds from public.household_members
   where user_id = 'a2222222-2222-4222-8222-222222222222'),
  false,
  'the opt-out is stored on the recipient membership'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
select is(
  public.add_personal_books_to_household(array[
    'ab000000-0000-4000-8000-000000000012',
    'ab000000-0000-4000-8000-000000000013',
    'ab000000-0000-4000-8000-000000000012'
  ]::uuid[]),
  2,
  'single Add/import can add distinct personal rows to the household in one call'
);
reset role;

select is(
  (select count(*)::integer from public.household_works
   where household_id = 'a0000000-0000-4000-8000-000000000001'
     and work_id in (
       'a0000000-0000-4000-8000-000000000012',
       'a0000000-0000-4000-8000-000000000013'
     ) and removed_at is null),
  2,
  'both explicit import works are active in the household catalog'
);
select is(
  (select count(*)::integer from public.books
   where owner_id = 'a1111111-1111-4111-8111-111111111111'
     and (wishlist or read_status = 'Read')),
  2,
  'household publication leaves every personal state unchanged'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
select throws_ok(
  $$select public.add_personal_books_to_household(array[
    'ab000000-0000-4000-8000-000000000012',
    '00000000-0000-4000-8000-000000000099'
  ]::uuid[])$$,
  '42501',
  null,
  'a mixed valid/foreign bulk request fails atomically'
);
select is(public.add_personal_books_to_household('{}'::uuid[]), 0,
  'an empty import destination request is a no-op');
reset role;

select is(
  (select count(*)::integer from public.household_works
   where household_id = 'a0000000-0000-4000-8000-000000000001'
     and removed_at is null),
  3,
  'the rejected mixed request creates no additional household membership'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a3333333-3333-4333-8333-333333333333","role":"authenticated"}',
  true
);
select throws_ok(
  $$select public.add_personal_books_to_household(array[
    'ab000000-0000-4000-8000-000000000012'
  ]::uuid[])$$,
  '42501',
  null,
  'a household peer cannot publish somebody else''s personal rows by id'
);
reset role;

select * from finish();
rollback;
