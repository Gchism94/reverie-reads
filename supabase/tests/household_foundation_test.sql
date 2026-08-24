-- Household V1: linked accounts, separate owner-only base rows, one narrow read-only shared view.
-- The privacy assertions are as important as the positive path: membership must not make another
-- reader's raw books/profile rows or subjective fields client-readable.

begin;
select plan(27);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('61111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated',
   'house-a@example.com', '{}', '{"display_name":"House A"}', now(), now()),
  ('62222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated',
   'house-b@example.com', '{}', '{"display_name":"House B"}', now(), now()),
  ('63333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated',
   'outside@example.com', '{}', '{"display_name":"Outside"}', now(), now());

select is(
  (select count(*)::int from public.profiles
   where id in (
     '61111111-1111-4111-8111-111111111111',
     '62222222-2222-4222-8222-222222222222',
     '63333333-3333-4333-8333-333333333333'
   )),
  3,
  'signup creates all three profiles'
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
   'Outside Book', 'Cy', 'Reader', 4, true, 'Read', 3, 3, 100, 2028, 'owned');

create temporary table household_probe (id uuid primary key) on commit drop;
insert into household_probe (id)
select public.link_household(
  'Probe household',
  '61111111-1111-4111-8111-111111111111',
  array['62222222-2222-4222-8222-222222222222']::uuid[]
);

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

select is(
  public.link_household(
    'Probe household',
    '61111111-1111-4111-8111-111111111111',
    array['62222222-2222-4222-8222-222222222222']::uuid[]
  ),
  (select id from household_probe),
  'repeating the same link returns the existing household'
);

select is(
  (select count(*)::int from public.household_members hm join household_probe p on p.id = hm.household_id),
  2,
  'idempotent rerun creates no duplicate memberships'
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

-- ── unrelated account C ──
select set_config(
  'request.jwt.claims',
  '{"sub":"63333333-3333-4333-8333-333333333333","role":"authenticated"}',
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

select * from finish();
rollback;
