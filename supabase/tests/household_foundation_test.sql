-- Household V1: linked accounts, separate owner-only base rows, one narrow read-only shared view.
-- The privacy assertions are as important as the positive path: membership must not make another
-- reader's raw books/profile rows or subjective fields client-readable.

begin;
select plan(74);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('61111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated',
   'house-a@example.com', '{}', '{"display_name":"House A"}', now(), now()),
  ('62222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated',
   'house-b@example.com', '{}', '{"display_name":"House B"}', now(), now()),
  ('63333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated',
   'house-c@example.com', '{}', '{"display_name":"House C"}', now(), now()),
  ('64444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated',
   'house-d@example.com', '{}', '{"display_name":"House D"}', now(), now()),
  ('65555555-5555-4555-8555-555555555555', 'authenticated', 'authenticated',
   'outside@example.com', '{}', '{"display_name":"Outside"}', now(), now());

select is(
  (select count(*)::int from public.profiles
   where id in (
     '61111111-1111-4111-8111-111111111111',
     '62222222-2222-4222-8222-222222222222',
     '63333333-3333-4333-8333-333333333333',
     '64444444-4444-4444-8444-444444444444',
     '65555555-5555-4555-8555-555555555555'
   )),
  5,
  'signup creates all five profiles'
);

insert into public.books (
  id, owner_id, title, author_first, author_last, rating, fave, read_status,
  intensity, darkness, progress, plan_y, ownership
)
values
  ('61000000-0000-4000-8000-000000000001', '61111111-1111-4111-8111-111111111111',
   'A Household Book', 'Ada', 'Author', 5, true, 'Read', 4, 5, 100, 2026, 'owned'),
  ('62000000-0000-4000-8000-000000000001', '62222222-2222-4222-8222-222222222222',
   'B Household Book', 'Bea', 'Writer', 2, false, 'Reading', 1, 2, 40, 2027, 'owned'),
  ('63000000-0000-4000-8000-000000000001', '63333333-3333-4333-8333-333333333333',
   'C Household Book', 'Cy', 'Reader', 4, true, 'Read', 3, 3, 100, 2028, 'owned'),
  ('64000000-0000-4000-8000-000000000001', '64444444-4444-4444-8444-444444444444',
   'D Household Book', 'Dee', 'Reader', 4, true, 'Read', 3, 3, 100, 2028, 'owned'),
  ('65000000-0000-4000-8000-000000000001', '65555555-5555-4555-8555-555555555555',
   'Outside Book', 'Eli', 'Reader', 4, true, 'Read', 3, 3, 100, 2028, 'owned');

-- Exact effective ACLs: these assertions fail if either a named grant OR PUBLIC makes a role
-- executable. A body-level refusal cannot make a bad grant look green.
select ok(not has_function_privilege('anon', 'public.is_household_member(uuid)', 'EXECUTE'),
  'anon cannot execute the membership helper');
select ok(has_function_privilege('authenticated', 'public.is_household_member(uuid)', 'EXECUTE'),
  'authenticated can execute the membership helper used by RLS');
select ok(not has_function_privilege('service_role', 'public.is_household_member(uuid)', 'EXECUTE'),
  'service role cannot execute the authenticated-only membership helper');
select ok(not has_function_privilege('anon', 'public.link_household(text,uuid,uuid[])', 'EXECUTE'),
  'anon cannot execute the service-role linker');
select ok(not has_function_privilege('authenticated', 'public.link_household(text,uuid,uuid[])', 'EXECUTE'),
  'authenticated cannot execute the service-role linker');
select ok(has_function_privilege('service_role', 'public.link_household(text,uuid,uuid[])', 'EXECUTE'),
  'service_role can execute the linker');
select ok(not has_function_privilege('anon', 'public.unlink_household_member(uuid,uuid)', 'EXECUTE'),
  'anon cannot execute the service-role unlinker');
select ok(not has_function_privilege('authenticated', 'public.unlink_household_member(uuid,uuid)', 'EXECUTE'),
  'authenticated cannot execute the service-role unlinker');
select ok(has_function_privilege('service_role', 'public.unlink_household_member(uuid,uuid)', 'EXECUTE'),
  'service_role can execute the unlinker');
select ok(not has_function_privilege('anon', 'public.household_roster()', 'EXECUTE'),
  'anon cannot execute the roster');
select ok(has_function_privilege('authenticated', 'public.household_roster()', 'EXECUTE'),
  'authenticated can execute the roster');
select ok(not has_function_privilege('service_role', 'public.household_roster()', 'EXECUTE'),
  'service role cannot execute the authenticated-only roster');
select ok(not has_function_privilege('anon', 'public.household_library_books()', 'EXECUTE'),
  'anon cannot execute the curated household library');
select ok(has_function_privilege('authenticated', 'public.household_library_books()', 'EXECUTE'),
  'authenticated can execute the curated household library');
select ok(not has_function_privilege('service_role', 'public.household_library_books()', 'EXECUTE'),
  'service role cannot execute the authenticated-only curated household library');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$select public.link_household(
    'Anonymous household',
    '61111111-1111-4111-8111-111111111111',
    array['62222222-2222-4222-8222-222222222222']::uuid[]
  )$$,
  '42501',
  null,
  'anonymous clients cannot execute the service-role linker'
);
reset role;

create temporary table household_probe (id uuid primary key) on commit drop;
create temporary table second_household_probe (id uuid primary key) on commit drop;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select lives_ok(
  $$select public.link_household(
    'Probe household',
    '61111111-1111-4111-8111-111111111111',
    array['62222222-2222-4222-8222-222222222222']::uuid[]
  )$$,
  'service-role linker creates the first household'
);
reset role;
insert into household_probe (id) select id from public.households where name = 'Probe household';

select is(
  (select count(*)::int from public.households h join household_probe p on p.id = h.id),
  1,
  'service-role linker creates one household'
);

select is(
  (select count(*)::int from public.household_members hm join household_probe p on p.id = hm.household_id),
  2,
  'service-role linker adds both distinct accounts'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.link_household(
    'Probe household',
    '61111111-1111-4111-8111-111111111111',
    array['62222222-2222-4222-8222-222222222222']::uuid[]
  ),
  (select id from public.households where name = 'Probe household'),
  'repeating the same link returns the existing household'
);
reset role;

select is(
  (select count(*)::int from public.household_members hm join household_probe p on p.id = hm.household_id),
  2,
  'idempotent rerun creates no duplicate memberships'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select lives_ok(
  $$select public.link_household(
    'Second household',
    '63333333-3333-4333-8333-333333333333',
    array['64444444-4444-4444-8444-444444444444']::uuid[]
  )$$,
  'service-role linker creates a second independent household'
);
reset role;
insert into second_household_probe (id)
select id from public.households where name = 'Second household';

select is(
  (select count(*)::int
   from public.household_members hm
   join second_household_probe p on p.id = hm.household_id),
  2,
  'the second household contains only its two requested accounts'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select throws_ok(
  $$select public.link_household(
    'Collision attempt',
    '61111111-1111-4111-8111-111111111111',
    array['63333333-3333-4333-8333-333333333333']::uuid[]
  )$$,
  '23505',
  null,
  'linker refuses to merge accounts from two existing households'
);
reset role;

select is((select count(*)::int from public.households), 2,
  'a rejected cross-household collision creates no third household');
select is((select count(*)::int from public.household_members), 4,
  'a rejected cross-household collision changes no memberships');

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select throws_ok(
  $$select public.link_household(
    'Incomplete preview attempt',
    '61111111-1111-4111-8111-111111111111',
    array['65555555-5555-4555-8555-555555555555']::uuid[]
  )$$,
  '22023',
  null,
  'extending a household requires its complete existing roster'
);
reset role;

select is(
  (select count(*)::int from public.household_members
   where user_id = '65555555-5555-4555-8555-555555555555'),
  0,
  'an incomplete-roster request does not partially link the new account'
);

-- ── member A ──
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"61111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select is((select count(*)::int from public.household_roster()), 2,
  'member A sees the two-person household roster');

select is(
  (select string_agg(display_name, ',' order by display_name) from public.household_roster()),
  'House A,House B',
  'the roster exposes only household member display names'
);

select is(
  (select string_agg(key, ',' order by key)
   from (
     select distinct jsonb_object_keys(to_jsonb(h)) as key
     from public.household_roster() h
   ) keys),
  'allow_member_library_adds,display_name,household_id,household_name,member_role,user_id',
  'the roster RPC exposes exactly its six reviewed fields'
);

select is((select count(*)::int from public.household_library_books()), 2,
  'member A sees both libraries through the curated household function');

select is(
  (select owner_name from public.household_library_books() where title = 'B Household Book'),
  'House B',
  'a household book retains its member identity'
);

select is((select count(*)::int from public.books), 1,
  'membership does not broaden raw books RLS beyond A''s own row');

select is(
  (select coalesce(bool_or(
    to_jsonb(h) ?| array[
      'rating', 'fave', 'read_status', 'intensity', 'darkness',
      'progress', 'plan_y', 'plan_m', 'plan_d'
    ]
  ), false) from public.household_library_books() h),
  false,
  'the household contract contains no subjective or reading-state fields'
);

select is(
  (select string_agg(key, ',' order by key)
   from (
     select distinct jsonb_object_keys(to_jsonb(h)) as key
     from public.household_library_books() h
   ) keys),
  'added_at,author,book_format,book_id,borrowed,cover_color,cover_thumb_url,cover_url,genres,isbn,owned_audiobook,owned_ebook,owned_physical,owner_id,owner_name,ownership,primary_genre,pub_d,pub_m,pub_y,series_count,series_name,series_position,series_status,subgenre,subgenres,title,wishlist',
  'the household-library RPC exposes exactly the reviewed bibliographic and possession fields'
);

select is((select count(*)::int from public.household_members), 2,
  'a member can read the roster table under RLS');

select throws_ok(
  $$insert into public.household_members (household_id, user_id)
    values ((select id from household_probe), '63333333-3333-4333-8333-333333333333')$$,
  '42501',
  null,
  'authenticated members cannot add another account directly'
);

select throws_ok(
  $$select public.link_household(
    'Client-made household',
    '61111111-1111-4111-8111-111111111111',
    array['63333333-3333-4333-8333-333333333333']::uuid[]
  )$$,
  '42501',
  null,
  'authenticated clients cannot execute the service-role linker'
);

-- ── member B ──
select set_config(
  'request.jwt.claims',
  '{"sub":"62222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);

select is((select count(*)::int from public.household_library_books()), 2,
  'member B receives the same two-library read view');

select is(
  (select member_role from public.household_roster()
   where user_id = '61111111-1111-4111-8111-111111111111'),
  'owner',
  'the runtime-selected household owner is identified in the roster'
);

select is((select count(*)::int from public.books), 1,
  'member B still sees only B''s raw book row');

-- ── unlinking an owner preserves the owner account/library and the remaining household ──
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.unlink_household_member(
    '63333333-3333-4333-8333-333333333333',
    (select id from public.households where name = 'Second household')
  ),
  (select id from public.households where name = 'Second household'),
  'service-role unlink supports removing a household owner'
);
reset role;

select is((select count(*)::int from auth.users
  where id = '63333333-3333-4333-8333-333333333333'), 1,
  'owner unlink preserves the authentication account');
select is((select count(*)::int from public.books
  where owner_id = '63333333-3333-4333-8333-333333333333'), 1,
  'owner unlink preserves the personal library');
select is((select count(*)::int from public.household_members
  where user_id = '63333333-3333-4333-8333-333333333333'), 0,
  'owner unlink removes that owner membership');
select is((select count(*)::int from public.household_members
  where user_id = '64444444-4444-4444-8444-444444444444'), 1,
  'owner unlink leaves the other account in the one-member household');

-- ── explicit additive link, then membership-only unlink ──
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select lives_ok(
  $$select public.link_household(
    'Ignored rename',
    '61111111-1111-4111-8111-111111111111',
    array[
      '62222222-2222-4222-8222-222222222222',
      '65555555-5555-4555-8555-555555555555'
    ]::uuid[]
  )$$,
  'complete-roster request can explicitly add a third account'
);
reset role;

select is(
  (select count(*)::int from public.household_members hm
   join household_probe p on p.id = hm.household_id),
  3,
  'the additive link writes the complete three-person roster'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select throws_ok(
  $$select public.unlink_household_member(
    '65555555-5555-4555-8555-555555555555',
    (select id from public.households where name = 'Second household')
  )$$,
  'PT409',
  null,
  'unlink refuses a household different from the operator-reviewed household'
);
reset role;

select is(
  (select household_id from public.household_members
   where user_id = '65555555-5555-4555-8555-555555555555'),
  (select id from household_probe),
  'a stale-preview refusal preserves the current membership'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.unlink_household_member(
    '65555555-5555-4555-8555-555555555555',
    (select id from public.households where name = 'Probe household')
  ),
  (select id from public.households where name = 'Probe household'),
  'service-role unlink removes only the requested membership'
);
reset role;

select is(
  (select count(*)::int from public.household_members
   where user_id = '65555555-5555-4555-8555-555555555555'),
  0,
  'the explicitly unlinked account has no household membership'
);
select is((select count(*)::int from auth.users
  where id = '65555555-5555-4555-8555-555555555555'), 1,
  'unlink preserves the authentication account');
select is((select count(*)::int from public.profiles
  where id = '65555555-5555-4555-8555-555555555555'), 1,
  'unlink preserves the account profile');
select is((select count(*)::int from public.books
  where owner_id = '65555555-5555-4555-8555-555555555555'), 1,
  'unlink preserves the personal library');

-- ── explicitly unlinked account E ──
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"65555555-5555-4555-8555-555555555555","role":"authenticated"}',
  true
);

select is((select count(*)::int from public.household_roster()), 0,
  'an unrelated account receives no household roster');

select is((select count(*)::int from public.household_library_books()), 0,
  'an unrelated account receives no household books');

select is((select count(*)::int from public.households), 0,
  'an unrelated account cannot discover household rows directly');

select is((select count(*)::int from public.books), 1,
  'the unrelated account still reads its own personal library normally');

-- ── original household remains intact after E's unlink ──
select set_config(
  'request.jwt.claims',
  '{"sub":"62222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);
select is((select count(*)::int from public.household_library_books()), 2,
  'remaining members immediately lose access to the unlinked personal library');

-- ── deleting the original linker does not destroy the remaining member's household ──
reset role;
delete from auth.users where id = '61111111-1111-4111-8111-111111111111';

select is(
  (select count(*)::int from public.households h join household_probe p on p.id = h.id),
  1,
  'deleting the original linker does not delete the household'
);

select is(
  (select name from public.households h join household_probe p on p.id = h.id),
  'Probe household',
  'the collective household identity remains intact'
);

select is(
  (select count(*)::int from public.household_members
   where user_id = '61111111-1111-4111-8111-111111111111'),
  0,
  'the deleted account membership cascades away'
);

select is(
  (select count(*)::int from public.household_members
   where user_id = '62222222-2222-4222-8222-222222222222'),
  1,
  'the other member remains linked'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"62222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);

select is((select count(*)::int from public.household_roster()), 1,
  'the remaining member still sees the household roster');

select is((select count(*)::int from public.household_library_books()), 1,
  'the remaining member still sees their own household-library row');

-- ── explicit final-member unlink deletes the now-empty household and nothing personal ──
reset role;
select set_config(
  'test.final_household_id',
  (select id::text from household_probe),
  true
);
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.unlink_household_member(
    '62222222-2222-4222-8222-222222222222',
    current_setting('test.final_household_id')::uuid
  ),
  current_setting('test.final_household_id')::uuid,
  'service-role unlink supports the final remaining member'
);
reset role;

select is((select count(*)::int from public.household_members
  where user_id = '62222222-2222-4222-8222-222222222222'), 0,
  'final unlink removes the last membership');
select is((select count(*)::int from public.households h
  join household_probe p on p.id = h.id), 0,
  'final unlink deletes the empty household');
select is((select count(*)::int from auth.users
  where id = '62222222-2222-4222-8222-222222222222'), 1,
  'final unlink preserves the authentication account');
select is((select count(*)::int from public.profiles
  where id = '62222222-2222-4222-8222-222222222222'), 1,
  'final unlink preserves the profile');
select is((select count(*)::int from public.books
  where owner_id = '62222222-2222-4222-8222-222222222222'), 1,
  'final unlink preserves the personal library');

select * from finish();
rollback;
