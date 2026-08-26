-- Personal, household, and corpus membership have independent lifecycles.
begin;
select plan(50);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('71111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated',
   'membership-a@example.com', '{}', '{"display_name":"Membership A"}', now(), now()),
  ('72222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated',
   'membership-b@example.com', '{}', '{"display_name":"Membership B"}', now(), now()),
  ('73333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated',
   'membership-outside@example.com', '{}', '{"display_name":"Membership Outside"}', now(), now());

select is(
  (select count(*)::int from public.profiles where id in (
    '71111111-1111-4111-8111-111111111111',
    '72222222-2222-4222-8222-222222222222',
    '73333333-3333-4333-8333-333333333333'
  )),
  3,
  'signup creates all fixture profiles'
);

insert into public.works (
  id, work_key, work_id, title, author_text, contributors, isbns
) values (
  '70000000-0000-4000-8000-000000000003',
  'hc:external-work-3',
  'hc:external-work-3',
  'A Borrowed Book',
  'Bea Writer',
  '[{"name":"Bea Writer","role":"author","position":0}]'::jsonb,
  array['9780306406157']
);

insert into public.books (
  id, owner_id, title, author_first, author_last, ownership, borrowed, wishlist, isbn
)
values
  ('71000000-0000-4000-8000-000000000001', '71111111-1111-4111-8111-111111111111',
   'A Unique Owned Book', 'Ada', 'Reader', 'owned', false, false, null),
  ('71000000-0000-4000-8000-000000000002', '71111111-1111-4111-8111-111111111111',
   'Shared Work', 'Casey', 'Writer', 'owned', false, false, null),
  ('72000000-0000-4000-8000-000000000001', '72222222-2222-4222-8222-222222222222',
   'Shared Work', 'Casey', 'Writer', 'owned', false, false, null),
  ('71000000-0000-4000-8000-000000000003', '71111111-1111-4111-8111-111111111111',
   'A Borrowed Book', 'Bea', 'Writer', 'unowned', true, true, '978-0-306-40615-7'),
  ('71000000-0000-4000-8000-000000000004', '71111111-1111-4111-8111-111111111111',
   'A Wishlist Book', 'Willa', 'Writer', 'unowned', false, true, null);

select is((select count(*)::int from public.books where corpus_work_id is not null), 5,
  'every personal row receives a corpus anchor');
select is(
  (select corpus_work_id from public.books where id = '71000000-0000-4000-8000-000000000002'),
  (select corpus_work_id from public.books where id = '72000000-0000-4000-8000-000000000001'),
  'the same normalized title and author reuse one corpus work'
);
select is((select count(*)::int from public.works where creation_source = 'reader_add'), 3,
  'reader-created corpus rows retain provisional provenance');
select is(
  (select corpus_work_id from public.books where id = '71000000-0000-4000-8000-000000000003'),
  '70000000-0000-4000-8000-000000000003'::uuid,
  'corpus matching reuses an externally keyed work instead of duplicating it'
);

insert into public.reads (book_id, owner_id, read_on, rating)
values (
  '71000000-0000-4000-8000-000000000001',
  '71111111-1111-4111-8111-111111111111',
  '2026-08-26',
  4.5
);
insert into public.lists (id, owner_id, name, kind)
values (
  '71000000-0000-4000-8000-000000000010',
  '71111111-1111-4111-8111-111111111111',
  'Keep my place',
  'collection'
);
insert into public.list_items (list_id, book_id, owner_id)
values (
  '71000000-0000-4000-8000-000000000010',
  '71000000-0000-4000-8000-000000000001',
  '71111111-1111-4111-8111-111111111111'
);

create temporary table membership_household (id uuid primary key) on commit drop;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select lives_ok(
  $$select public.link_household(
    'Membership household',
    '71111111-1111-4111-8111-111111111111',
    array['72222222-2222-4222-8222-222222222222']::uuid[]
  )$$,
  'operator link creates the fixture household'
);
reset role;
insert into membership_household (id)
select id from public.households where name = 'Membership household';

select is(
  (select count(*)::int from public.household_works hw
   join membership_household h on h.id = hw.household_id where hw.removed_at is null),
  2,
  'owned books automatically create one household membership per work'
);
select is(
  (select count(*)::int from public.household_works hw
   join public.books b on b.corpus_work_id = hw.work_id
   where b.id = '71000000-0000-4000-8000-000000000003' and hw.removed_at is null),
  0,
  'a borrowed book is not shared without explicit consent'
);
select is(
  (select count(*)::int from public.household_works hw
   join public.books b on b.corpus_work_id = hw.work_id
   where b.id = '71000000-0000-4000-8000-000000000004' and hw.removed_at is null),
  0,
  'a wishlist-only book remains personal'
);

select is(
  (select count(*)::int from (
    values
      ('public.add_personal_book_to_household(uuid)'),
      ('public.remove_personal_book_from_household(uuid)'),
      ('public.remove_household_work(uuid)'),
      ('public.remove_personal_book(uuid)'),
      ('public.restore_personal_book(uuid)'),
      ('public.update_household_work_enrichment(uuid,text[],jsonb)'),
      ('public.update_corpus_work_metadata(uuid,text,text,text[],text[],text,jsonb)'),
      ('public.household_library_works()')
  ) signatures(signature) where has_function_privilege('anon', signature, 'EXECUTE')),
  0,
  'anonymous clients can execute none of the membership RPCs'
);
select is(
  (select count(*)::int from (
    values
      ('public.add_personal_book_to_household(uuid)'),
      ('public.remove_personal_book_from_household(uuid)'),
      ('public.remove_household_work(uuid)'),
      ('public.remove_personal_book(uuid)'),
      ('public.restore_personal_book(uuid)'),
      ('public.update_household_work_enrichment(uuid,text[],jsonb)'),
      ('public.update_corpus_work_metadata(uuid,text,text,text[],text[],text,jsonb)'),
      ('public.household_library_works()')
  ) signatures(signature) where has_function_privilege('authenticated', signature, 'EXECUTE')),
  8,
  'authenticated readers receive exactly the reviewed membership RPC surface'
);
select is(
  (select count(*)::int from (
    values
      ('public.add_personal_book_to_household(uuid)'),
      ('public.remove_personal_book_from_household(uuid)'),
      ('public.remove_household_work(uuid)'),
      ('public.remove_personal_book(uuid)'),
      ('public.restore_personal_book(uuid)'),
      ('public.update_household_work_enrichment(uuid,text[],jsonb)'),
      ('public.update_corpus_work_metadata(uuid,text,text,text[],text[],text,jsonb)'),
      ('public.household_library_works()')
  ) signatures(signature) where has_function_privilege('service_role', signature, 'EXECUTE')),
  0,
  'service role has no accidental execute grant on reader RPCs'
);
select is(
  (select count(*)::int from (
    values ('household_works'), ('household_book_shares'), ('household_work_enrichment'),
      ('work_metadata_edits')
  ) tables(name) where has_table_privilege('authenticated', 'public.' || name, 'SELECT,INSERT,UPDATE,DELETE')),
  0,
  'authenticated readers have no direct access to implementation tables'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select is((select count(*)::int from public.household_library_works()), 2,
  'the household read model starts with the two owned works');
select is(
  (select jsonb_array_length(owners) from public.household_library_works()
   where title = 'Shared Work'),
  2,
  'one household work describes both active personal copies'
);
select is(
  public.add_personal_book_to_household('71000000-0000-4000-8000-000000000003'),
  (select corpus_work_id from public.books where id = '71000000-0000-4000-8000-000000000003'),
  'a borrowed book can be explicitly shared even when wishlist is also checked'
);
select is((select count(*)::int from public.household_library_works()), 3,
  'the explicitly shared borrowed work appears once');
select throws_ok(
  $$select public.add_personal_book_to_household('71000000-0000-4000-8000-000000000004')$$,
  '23514',
  null,
  'wishlist alone never qualifies a work for household sharing'
);

select lives_ok(
  $$select public.update_household_work_enrichment(
    (select corpus_work_id from public.books where id = '71000000-0000-4000-8000-000000000003'),
    array[' found family ', 'comfort', 'comfort'],
    '[{"name":"Only One Bed"}]'::jsonb
  )$$,
  'a member can edit shared household enrichment through the scoped RPC'
);
select is(
  (select array_to_string(household_tags, ',') from public.household_library_works()
   where title = 'A Borrowed Book'),
  'comfort,found family',
  'household tags are trimmed, deduplicated, and visible to the household'
);
select is(
  (select household_tropes from public.household_library_works()
   where title = 'A Borrowed Book'),
  '[{"name": "Only One Bed"}]'::jsonb,
  'household tropes round-trip through the curated read model'
);
select lives_ok(
  $$update public.books set tags = array['reader edited']
    where id = '71000000-0000-4000-8000-000000000003'$$,
  'editing personal tags synchronizes the active household overlay'
);
select is(
  (select array_to_string(household_tags, ',') from public.household_library_works()
   where title = 'A Borrowed Book'),
  'reader edited',
  'personal tag edits are visible from the household work'
);
select lives_ok(
  $$insert into public.book_tropes (book_id, trope_id, owner_id, emphasis)
    select
      '71000000-0000-4000-8000-000000000003',
      id,
      '71111111-1111-4111-8111-111111111111',
      'pinned'
    from public.tropes where owner_id is null order by name limit 1$$,
  'editing personal tropes synchronizes the active household overlay'
);
select is(
  (select household_tropes -> 0 ->> 'emphasis' from public.household_library_works()
   where title = 'A Borrowed Book'),
  'pinned',
  'personal trope emphasis is visible from the household work'
);
select lives_ok(
  $$update public.books
    set genre = 'Mystery', subgenre = 'Gothic', genres = array['mystery'],
        subgenres = array['gothic'], cover_url = 'https://example.com/personal-choice.jpg',
        cover_source = 'reader'
    where id = '71000000-0000-4000-8000-000000000003'$$,
  'editing reviewed objective fields on a personal copy synchronizes the corpus atomically'
);
select is(
  (select genre || '|' || subgenre || '|' || (cover_options -> -1 ->> 'url')
   from public.works
   where id = (select corpus_work_id from public.books
               where id = '71000000-0000-4000-8000-000000000003')),
  'mystery|gothic|https://example.com/personal-choice.jpg',
  'the corpus receives genre, subgenre, and the personal cover as an option'
);

select lives_ok(
  $$select public.update_corpus_work_metadata(
    (select corpus_work_id from public.books where id = '71000000-0000-4000-8000-000000000003'),
    'Romance',
    'Contemporary',
    array['Romance', 'romance'],
    array['Contemporary'],
    'https://example.com/borrowed.jpg',
    '[{"url":"https://example.com/borrowed.jpg","source":"reader"}]'::jsonb
  )$$,
  'a reader can update only the reviewed objective corpus fields for an active library work'
);
select is(
  (select genre || '|' || subgenre from public.works
   where id = (select corpus_work_id from public.books
               where id = '71000000-0000-4000-8000-000000000003')),
  'romance|contemporary',
  'genre and subgenre are stored on the shared corpus work'
);
reset role;
select is((select count(*)::int from public.work_metadata_edits), 2,
  'personal and direct corpus changes each create an attributable audit record');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
select is(
  public.remove_personal_book('71000000-0000-4000-8000-000000000001'),
  '71000000-0000-4000-8000-000000000001'::uuid,
  'personal removal archives the personal row'
);
reset role;
select ok((select removed_at is not null from public.books
           where id = '71000000-0000-4000-8000-000000000001'),
  'the personal row is retained with a removal timestamp');
select is((select count(*)::int from public.reads
           where book_id = '71000000-0000-4000-8000-000000000001'), 1,
  'personal removal preserves reading history');
select is((select count(*)::int from public.list_items
           where book_id = '71000000-0000-4000-8000-000000000001'), 1,
  'personal removal preserves list membership');
select is((select count(*)::int from public.works
           where id = (select corpus_work_id from public.books
                       where id = '71000000-0000-4000-8000-000000000001')), 1,
  'personal removal preserves the corpus work');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
select is((select count(*)::int from public.household_library_works()), 3,
  'personal removal preserves independent household membership');
select is(
  (select jsonb_array_length(owners) from public.household_library_works()
   where title = 'A Unique Owned Book'),
  0,
  'a household-only work remains visible without leaking archived copy state'
);
select is((select count(*)::int from public.household_library_books()), 4,
  'the staged legacy read path hides the archived personal row');
select is(
  public.remove_personal_book_from_household('71000000-0000-4000-8000-000000000003'),
  (select corpus_work_id from public.books where id = '71000000-0000-4000-8000-000000000003'),
  'unchecking a borrowed personal share removes only that explicit source'
);
select is((select count(*)::int from public.books
           where id = '71000000-0000-4000-8000-000000000003' and removed_at is null), 1,
  'unchecking household sharing preserves the personal borrowed row');
select is((select count(*)::int from public.household_library_works()), 2,
  'the borrowed-only household membership closes when its final explicit share closes');
select is(
  public.add_personal_book_to_household('71000000-0000-4000-8000-000000000003'),
  (select corpus_work_id from public.books where id = '71000000-0000-4000-8000-000000000003'),
  'the same borrowed checkbox can be selected again'
);
select is(
  public.remove_household_work(
    (select corpus_work_id from public.books where id = '71000000-0000-4000-8000-000000000003')
  ),
  (select corpus_work_id from public.books where id = '71000000-0000-4000-8000-000000000003'),
  'a member can remove an explicitly shared borrowed work from the household'
);
select is((select count(*)::int from public.books
           where id = '71000000-0000-4000-8000-000000000003' and removed_at is null), 1,
  'household removal preserves the personal borrowed row');
select is((select count(*)::int from public.household_library_works()), 2,
  'household removal changes only household membership');
select throws_ok(
  $$select public.remove_household_work(
    (select corpus_work_id from public.books where id = '71000000-0000-4000-8000-000000000002')
  )$$,
  '23514',
  null,
  'an active owned personal copy keeps its work in the household'
);

select is(
  public.restore_personal_book('71000000-0000-4000-8000-000000000001'),
  '71000000-0000-4000-8000-000000000001'::uuid,
  'the owner can restore an archived personal row'
);
select is(
  (select jsonb_array_length(owners) from public.household_library_works()
   where title = 'A Unique Owned Book'),
  1,
  'restoring an owned row reconnects its active copy to the household read model'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"73333333-3333-4333-8333-333333333333","role":"authenticated"}',
  true
);
select throws_ok(
  $$select public.remove_personal_book('71000000-0000-4000-8000-000000000001')$$,
  'P0002',
  null,
  'another reader cannot remove a personal row they do not own'
);
select throws_ok(
  $$select public.update_corpus_work_metadata(
    (select corpus_work_id from public.books where id = '71000000-0000-4000-8000-000000000004'),
    'Fantasy', null, array['fantasy'], '{}', null, '[]'::jsonb
  )$$,
  '42501',
  null,
  'a reader cannot edit a work absent from their active personal or household library'
);
reset role;

select * from finish();
rollback;
