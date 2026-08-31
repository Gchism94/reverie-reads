-- Household-only membership, owner/admin corpus authority, and explicit personal adoption.
begin;
select plan(73);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('91111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated',
   'catalog-owner@example.com', '{}', '{"display_name":"Catalog Owner"}', now(), now()),
  ('92222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated',
   'catalog-member@example.com', '{}', '{"display_name":"Catalog Member"}', now(), now()),
  ('93333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated',
   'catalog-outside@example.com', '{}', '{"display_name":"Catalog Outside"}', now(), now()),
  ('94444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated',
   'catalog-admin@example.com', '{}', '{"display_name":"Catalog Admin"}', now(), now());

insert into public.corpus_admins (user_id)
values ('94444444-4444-4444-8444-444444444444');

insert into public.households (id, name)
values ('90000000-0000-4000-8000-000000000001', 'Catalog household');
insert into public.household_members (household_id, user_id, role) values
  ('90000000-0000-4000-8000-000000000001',
   '91111111-1111-4111-8111-111111111111', 'owner'),
  ('90000000-0000-4000-8000-000000000001',
   '92222222-2222-4222-8222-222222222222', 'member');

insert into public.works (
  id, work_key, title, author_text, contributors, series, position, series_count, status,
  genre, genres, subgenre, subgenres, pub_y
) values
  (
    '90000000-0000-4000-8000-000000000011', 'existinghouseholdonly|writer',
    'Existing Household Only', 'A Writer',
    '[{"name":"A Writer","role":"author","position":0}]'::jsonb,
    null, null, null, 'standalone', null, '{}', null, '{}', null
  ),
  (
    '90000000-0000-4000-8000-000000000012', 'sharedcatalogdetails|writer',
    'Shared Catalog Details', 'B Writer',
    '[{"name":"B Writer","role":"author","position":0}]'::jsonb,
    'Shared Series', 2, 4, 'ongoing', 'fantasy', array['fantasy'],
    'epic fantasy', array['epic fantasy'], 2026
  ),
  (
    '90000000-0000-4000-8000-000000000013', 'adminonly|writer',
    'Admin Only', 'C Writer',
    '[{"name":"C Writer","role":"author","position":0}]'::jsonb,
    null, null, null, 'standalone', null, '{}', null, '{}', null
  ),
  (
    '90000000-0000-4000-8000-000000000014', 'ambiguous:a',
    'Ambiguous Catalog', 'D Writer', '[]'::jsonb,
    null, null, null, 'standalone', null, '{}', null, '{}', null
  ),
  (
    '90000000-0000-4000-8000-000000000015', 'ambiguous:b',
    'Ambiguous Catalog', 'D Writer', '[]'::jsonb,
    null, null, null, 'standalone', null, '{}', null, '{}', null
  );

insert into public.household_works (household_id, work_id, added_by, inclusion_source)
values (
  '90000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000012',
  '91111111-1111-4111-8111-111111111111',
  'manual'
);

insert into public.books (
  id, owner_id, corpus_work_id, title, author_first, author_last, series, status, genre,
  genres, subgenre, subgenres, ownership, read_status, rating
) values (
  '92000000-0000-4000-8000-000000000001',
  '92222222-2222-4222-8222-222222222222',
  '90000000-0000-4000-8000-000000000012',
  'Shared Catalog Details', 'B', 'Writer', 'Personal Series', 'standalone', 'romance',
  array['romance'], 'contemporary romance', array['contemporary romance'],
  'owned', 'Read', 4
);

insert into public.series (id, owner_id, name, status) values
  (
    '92000000-0000-4000-8000-000000000010',
    '92222222-2222-4222-8222-222222222222',
    'Personal Series',
    'ongoing'
  ),
  (
    '92000000-0000-4000-8000-000000000012',
    '92222222-2222-4222-8222-222222222222',
    'Edited Shared Series',
    'ongoing'
  );
insert into public.series_entries (
  id, series_id, owner_id, position, title, author, book_id, source, user_edited
) values (
  '92000000-0000-4000-8000-000000000011',
  '92000000-0000-4000-8000-000000000010',
  '92222222-2222-4222-8222-222222222222',
  1,
  'Shared Catalog Details',
  'B Writer',
  '92000000-0000-4000-8000-000000000001',
  'manual',
  true
);

-- Every new browser RPC has an exact effective ACL. The retired implicit corpus writer stays
-- unreachable even though its implementation remains available to the reviewed wrapper.
select ok(not has_function_privilege('anon', 'public.can_edit_corpus_work(uuid)', 'EXECUTE'),
  'anon cannot inspect corpus edit authority');
select ok(has_function_privilege('authenticated', 'public.can_edit_corpus_work(uuid)', 'EXECUTE'),
  'authenticated can inspect its own corpus edit authority');
select ok(not has_function_privilege('service_role', 'public.can_edit_corpus_work(uuid)', 'EXECUTE'),
  'service role has no browser authority helper grant');

select ok(not has_function_privilege('anon', 'public.add_corpus_work_to_household(uuid)', 'EXECUTE'),
  'anon cannot add an existing work to a household');
select ok(has_function_privilege('authenticated', 'public.add_corpus_work_to_household(uuid)', 'EXECUTE'),
  'authenticated can use the household add boundary');
select ok(not has_function_privilege('service_role', 'public.add_corpus_work_to_household(uuid)', 'EXECUTE'),
  'service role has no household browser-add grant');

select ok(not has_function_privilege('anon', 'public.create_household_catalog_work(text,text,text,text,text)', 'EXECUTE'),
  'anon cannot create a household catalog work');
select ok(has_function_privilege('authenticated', 'public.create_household_catalog_work(text,text,text,text,text)', 'EXECUTE'),
  'authenticated can reach the role-checked catalog creator');
select ok(not has_function_privilege('service_role', 'public.create_household_catalog_work(text,text,text,text,text)', 'EXECUTE'),
  'service role has no household catalog creator grant');

select ok(not has_function_privilege(
  'anon', 'public.edit_corpus_work_metadata(uuid,text,numeric,integer,text,text,text,text[],text[],text,jsonb,integer,integer,integer)', 'EXECUTE'
), 'anon cannot edit corpus metadata');
select ok(has_function_privilege(
  'authenticated', 'public.edit_corpus_work_metadata(uuid,text,numeric,integer,text,text,text,text[],text[],text,jsonb,integer,integer,integer)', 'EXECUTE'
), 'authenticated can reach the owner/admin corpus edit boundary');
select ok(not has_function_privilege(
  'service_role', 'public.edit_corpus_work_metadata(uuid,text,numeric,integer,text,text,text,text[],text[],text,jsonb,integer,integer,integer)', 'EXECUTE'
), 'service role has no browser corpus edit grant');

select ok(not has_function_privilege(
  'anon', 'public.set_corpus_work_cover(uuid,text,text,text,text)', 'EXECUTE'
), 'anon cannot select a corpus cover');
select ok(has_function_privilege(
  'authenticated', 'public.set_corpus_work_cover(uuid,text,text,text,text)', 'EXECUTE'
), 'authenticated can reach the owner/admin corpus cover boundary');
select ok(not has_function_privilege(
  'service_role', 'public.set_corpus_work_cover(uuid,text,text,text,text)', 'EXECUTE'
), 'service role has no browser corpus cover grant');

select ok(not has_function_privilege(
  'anon', 'public.library_isbn_checksum_is_valid(text)', 'EXECUTE'
), 'anon cannot call the internal ISBN checksum helper');
select ok(not has_function_privilege(
  'authenticated', 'public.library_isbn_checksum_is_valid(text)', 'EXECUTE'
), 'authenticated cannot bypass catalog creation through the ISBN helper');
select ok(not has_function_privilege(
  'service_role', 'public.library_isbn_checksum_is_valid(text)', 'EXECUTE'
), 'service role has no direct ISBN checksum helper grant');

select ok(not has_function_privilege('anon', 'public.adopt_corpus_work_metadata(uuid)', 'EXECUTE'),
  'anon cannot adopt corpus details into a personal book');
select ok(has_function_privilege('authenticated', 'public.adopt_corpus_work_metadata(uuid)', 'EXECUTE'),
  'authenticated can use the owner-checked personal adoption boundary');
select ok(not has_function_privilege('service_role', 'public.adopt_corpus_work_metadata(uuid)', 'EXECUTE'),
  'service role has no personal adoption grant');

select ok(not has_function_privilege(
  'anon', 'public.update_corpus_work_metadata(uuid,text,text,text[],text[],text,jsonb)', 'EXECUTE'
), 'anon cannot execute the retired implicit corpus writer');
select ok(not has_function_privilege(
  'authenticated', 'public.update_corpus_work_metadata(uuid,text,text,text[],text[],text,jsonb)', 'EXECUTE'
), 'authenticated cannot bypass the owner/admin corpus edit boundary');
select ok(not has_function_privilege(
  'service_role', 'public.update_corpus_work_metadata(uuid,text,text,text[],text[],text,jsonb)', 'EXECUTE'
), 'service role cannot bypass the owner/admin corpus edit boundary');

-- An ordinary member may add an existing catalog identity without acquiring a personal copy.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"92222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);
select is(
  public.add_corpus_work_to_household('90000000-0000-4000-8000-000000000011'),
  '90000000-0000-4000-8000-000000000011'::uuid,
  'a member can add an existing corpus work to the household'
);
reset role;
select is((select count(*)::int from public.household_works
  where household_id = '90000000-0000-4000-8000-000000000001'
    and work_id = '90000000-0000-4000-8000-000000000011' and removed_at is null), 1,
  'the existing work becomes one active household membership');
select is((select count(*)::int from public.books
  where corpus_work_id = '90000000-0000-4000-8000-000000000011'), 0,
  'household add creates no personal book');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"92222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);
select is(
  public.add_corpus_work_to_household('90000000-0000-4000-8000-000000000011'),
  '90000000-0000-4000-8000-000000000011'::uuid,
  'repeating a household add is idempotent'
);
select set_config(
  'test.member_created_household_work',
  public.create_household_catalog_work('Member Creation', 'E Writer', null)::text,
  true
);
reset role;
select is((select count(*)::int from public.household_works
  where household_id = '90000000-0000-4000-8000-000000000001'
    and work_id = '90000000-0000-4000-8000-000000000011'), 1,
  'an idempotent add never duplicates household membership');
select is((select count(*)::int from public.works
  where id = current_setting('test.member_created_household_work')::uuid
    and metadata_status = 'provisional'
    and created_by = '92222222-2222-4222-8222-222222222222'),
  1, 'an active member creates one attributed provisional work');
select is((select count(*)::int from public.household_works
  where household_id = '90000000-0000-4000-8000-000000000001'
    and work_id = current_setting('test.member_created_household_work')::uuid
    and removed_at is null),
  1, 'member creation adds the provisional work to the household');
select is((select count(*)::int from public.books
  where corpus_work_id = current_setting('test.member_created_household_work')::uuid),
  0, 'member creation does not manufacture a personal copy');

-- The household owner may create a missing provisional identity without a personal row.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"91111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
select set_config(
  'test.created_household_work',
  public.create_household_catalog_work(
    'Created for Household', 'F Writer', '978-0-306-40615-7',
    'https://books.google.com/books/content?id=household-cover', 'google'
  )::text,
  true
);
reset role;
select is((select count(*)::int from public.works
  where id = current_setting('test.created_household_work')::uuid
    and metadata_status = 'provisional' and created_by = '91111111-1111-4111-8111-111111111111'),
  1, 'owner creation establishes one attributed provisional work');
select is((select count(*)::int from public.household_works
  where household_id = '90000000-0000-4000-8000-000000000001'
    and work_id = current_setting('test.created_household_work')::uuid and removed_at is null),
  1, 'owner creation adds the new work to the household');
select is((select count(*)::int from public.books
  where corpus_work_id = current_setting('test.created_household_work')::uuid),
  0, 'owner creation still creates no personal book');
select is((select count(*)::int from public.work_metadata_edits
  where work_id = current_setting('test.created_household_work')::uuid
    and next_value ->> 'event' = 'household catalog creation'),
  1, 'household catalog creation is audited');
select is((select cover_url from public.works
  where id = current_setting('test.created_household_work')::uuid),
  'https://books.google.com/books/content?id=household-cover',
  'household creation retains an allowlisted display-only catalog cover');
select is((select isbns from public.works
  where id = current_setting('test.created_household_work')::uuid),
  array['9780306406157']::text[],
  'household creation stores the canonical ISBN-13 identity');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"91111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
select is(
  public.create_household_catalog_work(
    'Created for Household', 'F Writer', '9780306406157'
  ),
  current_setting('test.created_household_work')::uuid,
  'repeating the same identity reuses the reviewed work'
);
select throws_ok(
  $$select public.create_household_catalog_work('Invalid ISBN', 'G Writer', '123')$$,
  '22023', null, 'invalid ISBN input is refused instead of silently discarded'
);
select throws_ok(
  $$select public.create_household_catalog_work('Garbage ISBN', 'G Writer', 'not-an-isbn')$$,
  '22023', null, 'nonblank alphabetic ISBN garbage is refused instead of becoming no ISBN'
);
select throws_ok(
  $$select public.create_household_catalog_work('Prefixed ISBN', 'G Writer', 'ISBN: 9780306406157')$$,
  '22023', null, 'an alphabetic ISBN prefix is not stripped into a valid shared identity'
);
select throws_ok(
  $$select public.create_household_catalog_work('Suffixed ISBN', 'G Writer', '9780306406157abc')$$,
  '22023', null, 'an alphabetic ISBN suffix is not stripped into a valid shared identity'
);
select throws_ok(
  $$select public.create_household_catalog_work('Retail EAN', 'G Writer', '4006381333931')$$,
  '22023', null, 'a checksum-valid non-Bookland EAN-13 is refused as an ISBN'
);
select is(
  public.create_household_catalog_work(
    'Created for Household', 'F Writer', '0-306-40615-2'
  ),
  current_setting('test.created_household_work')::uuid,
  'a valid ISBN-10 checksum converts to and reuses the canonical ISBN-13 work'
);
select throws_ok(
  $$select public.create_household_catalog_work('Bad Checksum', 'G Writer', '9780306406158')$$,
  '22023', null, 'a shaped ISBN-13 with an invalid checksum is refused'
);
select throws_ok(
  $$select public.create_household_catalog_work('Ambiguous Catalog', 'D Writer', null)$$,
  '23505', null, 'an ambiguous normalized identity is refused'
);
select is(
  public.can_edit_corpus_work('90000000-0000-4000-8000-000000000012'),
  true,
  'the household owner can edit a work in the active household library'
);
reset role;
select is((select count(*)::int from public.works
  where title = 'Created for Household' and author_text = 'F Writer'),
  1, 'repeating owner creation never duplicates the corpus work');

-- Members cannot edit canonical metadata; administrators retain global authority.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"92222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);
select is(
  public.can_edit_corpus_work('90000000-0000-4000-8000-000000000012'),
  false,
  'an ordinary household member cannot edit the corpus work'
);
select throws_ok(
  $$select public.edit_corpus_work_metadata(
    '90000000-0000-4000-8000-000000000012',
    'Shared Series', 2, 4, 'ongoing',
    'horror', null, array['horror'], '{}', null, '[]'::jsonb, 2026, null, null
  )$$,
  '42501', null, 'the corpus edit boundary refuses an ordinary member'
);
select throws_ok(
  $$select public.set_corpus_work_cover(
    '90000000-0000-4000-8000-000000000012',
    'https://books.google.com/books/content?id=member-refused',
    'google',
    'https://books.google.com/books/content?id=member-refused',
    null
  )$$,
  '42501', null, 'the corpus cover boundary refuses an ordinary member'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"94444444-4444-4444-8444-444444444444","role":"authenticated"}',
  true
);
select is(
  public.can_edit_corpus_work('90000000-0000-4000-8000-000000000013'),
  true,
  'a corpus administrator has global corpus edit authority'
);
select is(
  public.edit_corpus_work_metadata(
    '90000000-0000-4000-8000-000000000013',
    'Global Series', 1.5, 6, 'ongoing',
    'science fiction', 'space opera', array['science fiction'], array['space opera'],
    null, '[]'::jsonb, 2028, 9, null
  ),
  '90000000-0000-4000-8000-000000000013'::uuid,
  'a corpus administrator can edit a work outside every personal and household library'
);
select is(
  public.set_corpus_work_cover(
    '90000000-0000-4000-8000-000000000013',
    'https://books.google.com/books/content?id=admin-selected',
    'google',
    'https://books.google.com/books/content?id=admin-selected',
    null
  ),
  '90000000-0000-4000-8000-000000000013'::uuid,
  'a corpus administrator can select a cover for a work outside every household'
);
reset role;
select is((select concat_ws('|', series, position, series_count, status, genre, subgenre, pub_y, pub_m)
  from public.works where id = '90000000-0000-4000-8000-000000000013'),
  'Global Series|1.5|6|ongoing|science fiction|space opera|2028|9',
  'the global administrator edit writes the complete reviewed shared metadata');
select is((select count(*)::int from public.work_metadata_edits
  where work_id = '90000000-0000-4000-8000-000000000013'
    and editor_id = '94444444-4444-4444-8444-444444444444'),
  2, 'the global administrator metadata and cover edits are both audited');
select is((select cover_url from public.works
  where id = '90000000-0000-4000-8000-000000000013'),
  'https://books.google.com/books/content?id=admin-selected',
  'the global administrator cover selection is stored');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"91111111-1111-4111-8111-111111111111","role":"authenticated","iss":"http://127.0.0.1:55321/auth/v1"}',
  true
);
select is(
  public.edit_corpus_work_metadata(
    '90000000-0000-4000-8000-000000000012',
    'Edited Shared Series', 3, 5, 'completed',
    'mystery', 'historical mystery', array['mystery'], array['historical mystery'],
    null, '[]'::jsonb, 2027, 6, 1
  ),
  '90000000-0000-4000-8000-000000000012'::uuid,
  'the household owner can edit canonical metadata through the audited boundary'
);
reset role;
select is((select genre from public.works
  where id = '90000000-0000-4000-8000-000000000012'),
  'mystery', 'the owner edit updates the shared corpus work');
select is((select genre from public.books
  where id = '92000000-0000-4000-8000-000000000001'),
  'romance', 'a corpus edit does not rewrite a member personal book');
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"91111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
select throws_ok(
  $$select public.edit_corpus_work_metadata(
    '90000000-0000-4000-8000-000000000012',
    'Edited Shared Series', 3, 5, 'completed',
    'romantasy', null, array['romantasy'], '{}', null, '[]'::jsonb, 2027, 6, 1
  )$$,
  '22023', null, 'the database refuses a noncanonical primary genre even for an owner'
);
select is(
  public.set_corpus_work_cover(
    '90000000-0000-4000-8000-000000000012',
    'https://books.google.com/books/content?id=owner-selected',
    'google',
    'https://books.google.com/books/content?id=owner-selected',
    null
  ),
  '90000000-0000-4000-8000-000000000012'::uuid,
  'a household owner may select an allowlisted shared display cover'
);
reset role;
select is((select cover_url from public.works
  where id = '90000000-0000-4000-8000-000000000012'),
  'https://books.google.com/books/content?id=owner-selected',
  'the owner-selected shared cover is stored on the corpus work');
select is((select count(*)::int from public.work_metadata_edits
  where work_id = '90000000-0000-4000-8000-000000000012'
    and next_value ->> 'coverUrl' = 'https://books.google.com/books/content?id=owner-selected'),
  1, 'the shared cover selection is audited');

-- Personal metadata also stays personal until the owner explicitly adopts the shared details.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"92222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);
update public.books set genre = 'horror', genres = array['horror']
where id = '92000000-0000-4000-8000-000000000001';
select is(
  public.adopt_corpus_work_metadata('92000000-0000-4000-8000-000000000001'),
  '92000000-0000-4000-8000-000000000001'::uuid,
  'the personal owner may explicitly adopt shared details'
);
reset role;
select is((select genre from public.works
  where id = '90000000-0000-4000-8000-000000000012'),
  'mystery', 'a personal metadata edit does not promote into the corpus');
select is((select concat_ws('|', genre, subgenre, series, position, series_count, status, pub_y)
  from public.books where id = '92000000-0000-4000-8000-000000000001'),
  'mystery|historical mystery|Edited Shared Series|3|5|completed|2027',
  'explicit adoption copies the complete shared tuple when the target series already exists');
select is((select concat_ws('|', series_claim ->> 'origin', series_claim ->> 'source', series_claim ->> 'sourceRef')
  from public.books where id = '92000000-0000-4000-8000-000000000001'),
  'corpus|shared_adoption|90000000-0000-4000-8000-000000000012',
  'explicit adoption attributes the current series to the exact shared work');
select is((select count(*)::int from public.series_entries
  where id = '92000000-0000-4000-8000-000000000011'
    and removed_at is not null and book_id is null and user_edited),
  1, 'adoption atomically retires the former structured series entry');
select is((select concat_ws('|', ownership, read_status, rating)
  from public.books where id = '92000000-0000-4000-8000-000000000001'),
  'owned|Read|4.0', 'adoption preserves possession, reading state, and rating');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"93333333-3333-4333-8333-333333333333","role":"authenticated"}',
  true
);
select throws_ok(
  $$select public.add_corpus_work_to_household('90000000-0000-4000-8000-000000000013')$$,
  'P0002', null, 'an account outside a household cannot add collective membership'
);
select throws_ok(
  $$select public.adopt_corpus_work_metadata('92000000-0000-4000-8000-000000000001')$$,
  'P0002', null, 'another reader cannot adopt into someone else personal book'
);
reset role;

select * from finish();
rollback;
