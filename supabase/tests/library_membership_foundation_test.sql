-- Personal, household, and corpus membership have independent lifecycles.
begin;
select plan(110);

select ok(
  not has_function_privilege('anon', 'public.library_work_key(text,text)', 'EXECUTE'),
  'anonymous clients cannot execute the corpus identity helper'
);
select ok(
  not has_function_privilege('authenticated', 'public.library_work_key(text,text)', 'EXECUTE'),
  'authenticated readers cannot execute the corpus identity helper directly'
);
select ok(
  has_function_privilege('service_role', 'public.library_work_key(text,text)', 'EXECUTE'),
  'service-managed corpus inserts can evaluate the work-key expression index'
);

select is((select count(*)::int from public.household_work_enrichment), 0,
  'deploying the migration does not publish historical personal tags or tropes');
select is(
  (select count(*)::int from public.works
   where creation_source = 'legacy_personal_backfill' and cardinality(tags) > 0),
  0,
  'legacy personal tags are not promoted into the global corpus during deployment'
);
select is(
  (select count(*)::int from public.works
   where creation_source = 'legacy_personal_backfill'
     and (cover_url is not null or jsonb_array_length(cover_options) > 0)),
  0,
  'legacy personal cover URLs are not promoted into the global corpus during deployment'
);

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
   'A Wishlist Book', 'Willa', 'Writer', 'unowned', false, true, null),
  ('72000000-0000-4000-8000-000000000002', '72222222-2222-4222-8222-222222222222',
   'A Unique Owned Book', 'Ada', 'Reader', 'unowned', true, true, null);

-- These annotations predate household linkage. Creating membership below must not turn that link
-- into an implicit bulk-publication event; only subsequent edits or an approved data fix may share.
update public.books set tags = array['historical private']
where id = '71000000-0000-4000-8000-000000000001';
update public.books set tags = array['historical borrowed private']
where id = '71000000-0000-4000-8000-000000000003';
insert into public.book_tropes (book_id, trope_id, owner_id, emphasis)
select
  '71000000-0000-4000-8000-000000000001',
  id,
  '71111111-1111-4111-8111-111111111111',
  'present'
from public.tropes where owner_id is null order by name limit 1;
insert into public.book_tropes (book_id, trope_id, owner_id, emphasis)
select
  '71000000-0000-4000-8000-000000000003',
  id,
  '71111111-1111-4111-8111-111111111111',
  'present'
from public.tropes where owner_id is null order by name desc limit 1;

select is((select count(*)::int from public.books where corpus_work_id is not null), 6,
  'every personal row receives a corpus anchor');
select is(
  (select corpus_work_id from public.books where id = '71000000-0000-4000-8000-000000000002'),
  (select corpus_work_id from public.books where id = '72000000-0000-4000-8000-000000000001'),
  'the same normalized title and author reuse one corpus work'
);
select is((
  select count(distinct w.id)::int
  from public.works w
  join public.books b on b.corpus_work_id = w.id
  where b.id in (
    '71000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000002',
    '72000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000004',
    '72000000-0000-4000-8000-000000000002'
  ) and w.creation_source = 'reader_add'
), 3,
  'reader-created corpus rows retain provisional provenance');
select is(
  (select corpus_work_id from public.books where id = '71000000-0000-4000-8000-000000000003'),
  '70000000-0000-4000-8000-000000000003'::uuid,
  'corpus matching reuses an externally keyed work instead of duplicating it'
);

select set_config(
  'test.absent_work_id',
  (select corpus_work_id::text from public.books
   where id = '71000000-0000-4000-8000-000000000004'),
  true
);
select set_config(
  'test.original_owned_work_id',
  (select corpus_work_id::text from public.books
   where id = '71000000-0000-4000-8000-000000000001'),
  true
);

select is(
  public.library_work_key(' 三 體：ＩｂａÑｅｚ Ⅱ ', '刘慈欣'),
  '三體ibanezii|刘慈欣',
  'the SQL corpus key matches the TypeScript Unicode compatibility and diacritic fold'
);
select isnt(
  public.library_work_key('三体', '刘慈欣'),
  public.library_work_key('活着', '余华'),
  'unrelated non-Latin works no longer collapse to the same fallback key'
);
select is(
  public.canonical_library_isbns(
    array['978-1-23456-789-7', '9780306406157', '9781234567897', 'not-an-isbn']
  ),
  array['9780306406157', '9781234567897'],
  'canonical ISBN lock inputs are normalized, deduplicated, and stably sorted'
);
select throws_ok(
  $$insert into public.works (work_key, title, author_text, isbns)
    values ('duplicate:isbn-refused', 'Duplicate ISBN refused', 'Boundary Test',
            array['978-0-306-40615-7'])$$,
  '23505',
  null,
  'a future corpus write cannot assign an ISBN already held by another work'
);

-- Preserve historical ambiguity as data to reconcile. The future-write trigger is disabled only
-- for this fixture, simulating duplicate corpus data that predates this undeployed boundary.
alter table public.works disable trigger works_validate_isbn_assignment;
insert into public.works (id, work_key, title, author_text, isbns)
values
  ('70000000-0000-4000-8000-000000000032', 'legacy:ambiguous-isbn-a',
   'Legacy ISBN A', 'Boundary Test', array['9781234567897']),
  ('70000000-0000-4000-8000-000000000033', 'legacy:ambiguous-isbn-b',
   'Legacy ISBN B', 'Boundary Test', array['9781234567897']);
alter table public.works enable trigger works_validate_isbn_assignment;
insert into public.books (id, owner_id, title, author_last, isbn)
values (
  '71000000-0000-4000-8000-000000000013',
  '71111111-1111-4111-8111-111111111111',
  'Ambiguous ISBN add',
  'Boundary Test',
  '978-1-23456-789-7'
);
select is(
  (select creation_source from public.works where id = (
    select corpus_work_id from public.books where id = '71000000-0000-4000-8000-000000000013'
  )),
  'reconciliation',
  'pre-existing duplicate ISBN data still routes a personal add to reconciliation'
);
delete from public.books where id = '71000000-0000-4000-8000-000000000013';
delete from public.works where id in (
  '70000000-0000-4000-8000-000000000032',
  '70000000-0000-4000-8000-000000000033'
) or work_key = 'reconcile:71000000-0000-4000-8000-000000000013';

insert into public.works (id, work_key, title, author_text)
values
  ('70000000-0000-4000-8000-000000000030', 'ibaez|writer', 'Ibañez', 'Writer'),
  ('70000000-0000-4000-8000-000000000031', 'ibez|writer', 'Ibáñez', 'Writer');
select lives_ok(
  $$select public.rekey_legacy_library_work_keys()$$,
  'legacy re-keying does not violate uniqueness when two old keys converge'
);
select is(
  (select string_agg(work_key, ',' order by work_key) from public.works
   where id in (
     '70000000-0000-4000-8000-000000000030',
     '70000000-0000-4000-8000-000000000031'
   )),
  'ibaez|writer,ibez|writer',
  'ambiguous legacy keys stay unchanged for reconciliation'
);
delete from public.works where id in (
  '70000000-0000-4000-8000-000000000030',
  '70000000-0000-4000-8000-000000000031'
);

insert into public.works (id, work_key, title, author_text, contributors)
values
  ('70000000-0000-4000-8000-000000000010', 'external:three-body', '三体', '刘慈欣',
   '[{"name":"刘慈欣","role":"author","position":0}]'::jsonb),
  ('70000000-0000-4000-8000-000000000011', 'external:to-live', '活着', '余华',
   '[{"name":"余华","role":"author","position":0}]'::jsonb);
insert into public.books (id, owner_id, title, author_last)
values
  ('71000000-0000-4000-8000-000000000010', '71111111-1111-4111-8111-111111111111',
   '三体', '刘慈欣'),
  ('71000000-0000-4000-8000-000000000011', '71111111-1111-4111-8111-111111111111',
   '活着', '余华');
select is(
  (select corpus_work_id from public.books where id = '71000000-0000-4000-8000-000000000010'),
  '70000000-0000-4000-8000-000000000010'::uuid,
  'a Chinese title+author fallback binds to its exact corpus work'
);
select is(
  (select corpus_work_id from public.books where id = '71000000-0000-4000-8000-000000000011'),
  '70000000-0000-4000-8000-000000000011'::uuid,
  'a second non-Latin work remains independently matchable'
);
delete from public.books where id in (
  '71000000-0000-4000-8000-000000000010',
  '71000000-0000-4000-8000-000000000011'
);

insert into public.works (id, work_key, title, author_text)
values
  ('70000000-0000-4000-8000-000000000012', 'external:ambiguous-a', '同名', '同作者'),
  ('70000000-0000-4000-8000-000000000013', 'external:ambiguous-b', '同名', '同作者');
insert into public.books (id, owner_id, title, author_last)
values (
  '71000000-0000-4000-8000-000000000012',
  '71111111-1111-4111-8111-111111111111',
  '同名',
  '同作者'
);
select is(
  (select creation_source from public.works where id = (
    select corpus_work_id from public.books where id = '71000000-0000-4000-8000-000000000012'
  )),
  'reconciliation',
  'an ambiguous fallback creates a reconciliation work instead of silently choosing a UUID'
);
delete from public.books where id = '71000000-0000-4000-8000-000000000012';

insert into storage.objects (bucket_id, name, owner)
values
  ('covers',
   'u/71111111-1111-4111-8111-111111111111/71000000-0000-4000-8000-000000000003/personal.webp',
   '71111111-1111-4111-8111-111111111111'),
  ('covers',
   'u/71111111-1111-4111-8111-111111111111/71000000-0000-4000-8000-000000000003/direct.webp',
   '71111111-1111-4111-8111-111111111111'),
  ('covers',
   'u/71111111-1111-4111-8111-111111111111/71000000-0000-4000-8000-000000000022/invalid-insert.webp',
   '71111111-1111-4111-8111-111111111111');

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

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
select set_config('request.headers', '{"host":"127.0.0.1:55321"}', true);
select throws_ok(
  $$update public.books
    set corpus_work_id = '70000000-0000-4000-8000-000000000003'
    where id = '71000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'an authenticated owner cannot rebind an existing personal row to another corpus work'
);
reset role;
select is(
  (select corpus_work_id from public.books where id = '71000000-0000-4000-8000-000000000001'),
  current_setting('test.original_owned_work_id')::uuid,
  'a refused owner rebind leaves the original corpus link unchanged'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
select throws_ok(
  $$insert into public.books (
      id, owner_id, title, author_first, author_last, corpus_work_id
    ) values (
      '71000000-0000-4000-8000-000000000020',
      '71111111-1111-4111-8111-111111111111',
      'Unrelated Supplied Binding', 'Wrong', 'Identity',
      '70000000-0000-4000-8000-000000000003'
    )$$,
  '23514',
  null,
  'a supplied real target UUID is rejected when its bibliography does not match'
);
select lives_ok(
  $$insert into public.books (
      id, owner_id, title, author_first, author_last, isbn, corpus_work_id
    ) values (
      '71000000-0000-4000-8000-000000000021',
      '71111111-1111-4111-8111-111111111111',
      'A Borrowed Book', 'Bea', 'Writer', '978-0-306-40615-7',
      '70000000-0000-4000-8000-000000000003'
    )$$,
  'a supplied corpus UUID is accepted only for its unique bibliographic identity'
);
select lives_ok(
  $$update public.books
    set title = 'A Locally Retitled Copy', isbn = null, genre = 'science fiction'
    where id = '71000000-0000-4000-8000-000000000021'$$,
  'a reader may keep personal identity edits without receiving a corpus-rebind capability'
);
reset role;
select ok(
  (select genre is null from public.works where id = '70000000-0000-4000-8000-000000000003'),
  'an identity-diverged personal row cannot promote objective metadata into the global work'
);
delete from public.books where id = '71000000-0000-4000-8000-000000000021';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71111111-1111-4111-8111-111111111111","role":"authenticated","iss":"http://127.0.0.1:55321/auth/v1"}',
  true
);
select set_config('request.headers', '{"host":"127.0.0.1:55321"}', true);
select lives_ok(
  $$insert into public.books (
      id, owner_id, title, author_first, author_last, cover_url, cover_source, cover_source_url
    ) values (
      '71000000-0000-4000-8000-000000000022',
      '71111111-1111-4111-8111-111111111111',
      'Invalid Cover Metadata', 'Safe', 'Path',
      'http://127.0.0.1:55321/storage/v1/object/public/covers/u/71111111-1111-4111-8111-111111111111/71000000-0000-4000-8000-000000000022/invalid-insert.webp',
      'attacker-controlled', 'javascript:alert(1)'
    )$$,
  'a personal book may retain owner-controlled cover metadata without publishing it'
);
reset role;
select is(
  (select coalesce(cover_url, 'none') || '|' || jsonb_array_length(cover_options)::text
   from public.works where id = (
     select corpus_work_id from public.books
     where id = '71000000-0000-4000-8000-000000000022'
   )),
  'none|0',
  'book creation requires both a hosted object and the reviewed cover-option schema'
);
select set_config(
  'test.invalid_cover_work_id',
  (select corpus_work_id::text from public.books
   where id = '71000000-0000-4000-8000-000000000022'),
  true
);
delete from public.books where id = '71000000-0000-4000-8000-000000000022';
delete from public.works where id =
  current_setting('test.invalid_cover_work_id')::uuid;

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
  (select count(*)::int from public.household_work_enrichment hwe
   join membership_household h on h.id = hwe.household_id
   where hwe.work_id = (
     select corpus_work_id from public.books
     where id = '71000000-0000-4000-8000-000000000001'
   )),
  0,
  'linking a member does not publish that reader''s historical tags or tropes'
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
      ('public.edit_corpus_work_metadata(uuid,text,numeric,integer,text,text,text,text[],text[],text,jsonb,integer,integer,integer)'),
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
      ('public.edit_corpus_work_metadata(uuid,text,numeric,integer,text,text,text,text[],text[],text,jsonb,integer,integer,integer)'),
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
      ('public.edit_corpus_work_metadata(uuid,text,numeric,integer,text,text,text,text[],text[],text,jsonb,integer,integer,integer)'),
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
  '{"sub":"71111111-1111-4111-8111-111111111111","role":"authenticated","iss":"http://127.0.0.1:55321/auth/v1"}',
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
  (select jsonb_array_length(owners) from public.household_library_works()
   where title = 'A Unique Owned Book'),
  1,
  'an unshared borrowed overlap is not admitted merely because an owned copy admits the work'
);
select is(
  (select count(*)::int
   from public.household_library_works() h
   cross join lateral jsonb_array_elements(h.owners) owner
   where h.title = 'A Unique Owned Book'
     and owner ->> 'bookId' = '72000000-0000-4000-8000-000000000002'),
  0,
  'the overlap hides the other member, format, and borrowed state for that exact unshared copy'
);
select is((select count(*)::int from public.household_library_books()), 3,
  'the legacy read path includes owned copies but excludes wishlist-only and unshared borrowed rows');
select ok(
  not exists (select 1 from public.household_library_books() where wishlist),
  'the legacy read path never returns another member''s wishlist state'
);

insert into public.tropes (id, owner_id, name, facet)
values (
  '70000000-0000-4000-8000-000000000035',
  '71111111-1111-4111-8111-111111111111',
  'Victim private trope',
  'vibe'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"72222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);
insert into public.tropes (owner_id, name, facet)
values (
  '72222222-2222-4222-8222-222222222222',
  'Unshared overlap sentinel',
  'vibe'
);
select lives_ok(
  $$update public.books set tags = array['unshared annotation sentinel']
    where id = '72000000-0000-4000-8000-000000000002'$$,
  'an unshared borrowed overlap may still keep private personal tags'
);
select lives_ok(
  $$insert into public.book_tropes (book_id, trope_id, owner_id)
    select
      '72000000-0000-4000-8000-000000000002',
      id,
      '72222222-2222-4222-8222-222222222222'
    from public.tropes
    where owner_id = '72222222-2222-4222-8222-222222222222'
      and name = 'Unshared overlap sentinel'$$,
  'an unshared borrowed overlap may still keep a private personal trope'
);
select throws_ok(
  $$insert into public.book_tropes (book_id, trope_id, owner_id)
    values (
      '72000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000035',
      '72222222-2222-4222-8222-222222222222'
    )$$,
  '42501',
  null,
  'a reader cannot attach another reader''s known private trope UUID'
);
select throws_ok(
  $$update public.book_tropes
    set trope_id = '70000000-0000-4000-8000-000000000035'
    where book_id = '72000000-0000-4000-8000-000000000002'
      and owner_id = '72222222-2222-4222-8222-222222222222'$$,
  '42501',
  null,
  'a reader cannot retarget their join to another reader''s known private trope UUID'
);
select throws_ok(
  $$update public.book_tropes
    set book_id = '71000000-0000-4000-8000-000000000001'
    where trope_id = (
      select id from public.tropes where name = 'Unshared overlap sentinel'
    )$$,
  '42501',
  null,
  'a trope owner cannot retarget their join row to another reader''s known book UUID'
);
reset role;
select is(
  (select count(*)::int from public.book_tropes
   where book_id = '72000000-0000-4000-8000-000000000002'
     and trope_id = (
       select id from public.tropes
       where owner_id = '72222222-2222-4222-8222-222222222222'
         and name = 'Unshared overlap sentinel'
     )),
  1,
  'a refused cross-owner update leaves the reader''s legitimate join intact'
);
select is(
  (select count(*)::int from public.household_work_enrichment e
   join membership_household h on h.id = e.household_id
   where e.work_id = (
     select corpus_work_id from public.books
     where id = '72000000-0000-4000-8000-000000000002'
   )),
  0,
  'an unshared borrowed copy cannot publish annotations through another copy''s household work'
);

-- Simulate a legacy malformed join whose join/book owner agrees but whose referenced private trope
-- belongs to somebody else. The definer snapshot must filter the vocabulary row independently of
-- RLS, while continuing to publish this reader's legitimate trope for the same eligible book.
insert into public.book_tropes (book_id, trope_id, owner_id)
values (
  '72000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000035',
  '72222222-2222-4222-8222-222222222222'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"72222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);
select lives_ok(
  $$insert into public.book_tropes (book_id, trope_id, owner_id)
    select
      '72000000-0000-4000-8000-000000000001',
      id,
      '72222222-2222-4222-8222-222222222222'
    from public.tropes
    where owner_id = '72222222-2222-4222-8222-222222222222'
      and name = 'Unshared overlap sentinel'$$,
  'a reader can still publish their own private trope to an eligible household work'
);
reset role;
select is(
  (select count(*)::int
   from public.household_work_enrichment e
   cross join lateral jsonb_array_elements(e.tropes) trope_value
   join membership_household h on h.id = e.household_id
   where e.work_id = (
       select corpus_work_id from public.books
       where id = '72000000-0000-4000-8000-000000000001'
     )
     and trope_value ->> 'name' = 'Victim private trope'),
  0,
  'a definer snapshot excludes a legacy reference to another reader''s private trope'
);
select is(
  (select count(*)::int
   from public.household_work_enrichment e
   cross join lateral jsonb_array_elements(e.tropes) trope_value
   join membership_household h on h.id = e.household_id
   where e.work_id = (
       select corpus_work_id from public.books
       where id = '72000000-0000-4000-8000-000000000001'
     )
     and trope_value ->> 'name' = 'Unshared overlap sentinel'),
  1,
  'the same definer snapshot retains the target reader''s legitimate private trope'
);
delete from public.book_tropes
where book_id = '72000000-0000-4000-8000-000000000001'
  and trope_id in (
    '70000000-0000-4000-8000-000000000035',
    (select id from public.tropes
     where owner_id = '72222222-2222-4222-8222-222222222222'
       and name = 'Unshared overlap sentinel')
  );
delete from public.household_work_enrichment
where household_id = (select id from membership_household)
  and work_id = (
    select corpus_work_id from public.books
    where id = '72000000-0000-4000-8000-000000000001'
  );
delete from public.tropes where id = '70000000-0000-4000-8000-000000000035';

-- Simulate one invalid cross-owner join left by the former weak UPDATE policy. A later legitimate
-- owner edit must not sweep that historical row into the household snapshot.
insert into public.book_tropes (book_id, trope_id, owner_id)
select
  '71000000-0000-4000-8000-000000000001',
  id,
  '72222222-2222-4222-8222-222222222222'
from public.tropes
where owner_id = '72222222-2222-4222-8222-222222222222'
  and name = 'Unshared overlap sentinel';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
select lives_ok(
  $$update public.book_tropes set emphasis = 'pinned'
    where book_id = '71000000-0000-4000-8000-000000000001'
      and owner_id = '71111111-1111-4111-8111-111111111111'$$,
  'a legitimate owner trope edit ignores a historical cross-owner join row'
);
reset role;
select is(
  (select count(*)::int
   from public.household_work_enrichment e
   cross join lateral jsonb_array_elements(e.tropes) trope_value
   join membership_household h on h.id = e.household_id
   where e.work_id = (
       select corpus_work_id from public.books
       where id = '71000000-0000-4000-8000-000000000001'
     )
     and trope_value ->> 'name' = 'Unshared overlap sentinel'),
  0,
  'legacy cross-owner trope rows cannot be republished by a victim''s later edit'
);
delete from public.book_tropes
where book_id = '71000000-0000-4000-8000-000000000001'
  and owner_id = '72222222-2222-4222-8222-222222222222';

-- Moving a legitimate owner join refreshes both works. The trigger prelocks both books before
-- either household lock so opposite work on the target cannot invert the lock order.
insert into public.tropes (id, owner_id, name, facet)
values (
  '70000000-0000-4000-8000-000000000034',
  '71111111-1111-4111-8111-111111111111',
  'Moved join sentinel',
  'vibe'
);
insert into public.book_tropes (book_id, trope_id, owner_id)
values (
  '71000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000034',
  '71111111-1111-4111-8111-111111111111'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
select lives_ok(
  $$update public.book_tropes
    set book_id = '71000000-0000-4000-8000-000000000002'
    where book_id = '71000000-0000-4000-8000-000000000001'
      and trope_id = '70000000-0000-4000-8000-000000000034'$$,
  'an owner can move a trope join between two eligible personal books'
);
reset role;
select is(
  (select count(*)::int
   from public.household_work_enrichment e
   cross join lateral jsonb_array_elements(e.tropes) trope_value
   join membership_household h on h.id = e.household_id
   where e.work_id = (
       select corpus_work_id from public.books
       where id = '71000000-0000-4000-8000-000000000001'
     )
     and trope_value ->> 'id' = '70000000-0000-4000-8000-000000000034'),
  0,
  'a moved trope leaves the old household work snapshot'
);
select is(
  (select count(*)::int
   from public.household_work_enrichment e
   cross join lateral jsonb_array_elements(e.tropes) trope_value
   join membership_household h on h.id = e.household_id
   where e.work_id = (
       select corpus_work_id from public.books
       where id = '71000000-0000-4000-8000-000000000002'
     )
     and trope_value ->> 'id' = '70000000-0000-4000-8000-000000000034'),
  1,
  'a moved trope enters the new household work snapshot'
);
delete from public.book_tropes
where book_id = '71000000-0000-4000-8000-000000000002'
  and trope_id = '70000000-0000-4000-8000-000000000034';
delete from public.tropes where id = '70000000-0000-4000-8000-000000000034';
delete from public.household_work_enrichment
where household_id = (select id from membership_household)
  and work_id = (
    select corpus_work_id from public.books
    where id = '71000000-0000-4000-8000-000000000002'
  );

-- Duplicate personal copies can share one work and therefore one household overlay. The source UUID
-- deliberately sorts after the destination: UUID-ordered snapshots previously wrote the populated
-- destination first and then erased it with the empty source snapshot.
insert into public.books (
  id, owner_id, title, author_first, author_last, ownership, borrowed, wishlist
)
values
  ('71000000-0000-4000-8000-000000000036', '71111111-1111-4111-8111-111111111111',
   'Descending duplicate work', 'Order', 'Sentinel', 'owned', false, false),
  ('71900000-0000-4000-8000-000000000036', '71111111-1111-4111-8111-111111111111',
   'Descending duplicate work', 'Order', 'Sentinel', 'owned', false, false);
select set_config(
  'test.descending_duplicate_work_id',
  (select corpus_work_id::text from public.books
   where id = '71000000-0000-4000-8000-000000000036'),
  true
);
select is(
  (select corpus_work_id from public.books
   where id = '71900000-0000-4000-8000-000000000036'),
  current_setting('test.descending_duplicate_work_id')::uuid,
  'the descending-UUID fixtures bind to the same corpus work and household overlay'
);
insert into public.tropes (id, owner_id, name, facet)
values (
  '70000000-0000-4000-8000-000000000036',
  '71111111-1111-4111-8111-111111111111',
  'Descending move sentinel',
  'vibe'
);
insert into public.book_tropes (book_id, trope_id, owner_id)
values (
  '71900000-0000-4000-8000-000000000036',
  '70000000-0000-4000-8000-000000000036',
  '71111111-1111-4111-8111-111111111111'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
select lives_ok(
  $$update public.book_tropes
    set book_id = '71000000-0000-4000-8000-000000000036'
    where book_id = '71900000-0000-4000-8000-000000000036'
      and trope_id = '70000000-0000-4000-8000-000000000036'$$,
  'an owner can move a trope from a higher UUID to a lower duplicate-copy UUID'
);
reset role;
select is(
  (select count(*)::int
   from public.household_work_enrichment e
   cross join lateral jsonb_array_elements(e.tropes) trope_value
   join membership_household h on h.id = e.household_id
   where e.work_id = current_setting('test.descending_duplicate_work_id')::uuid
     and trope_value ->> 'id' = '70000000-0000-4000-8000-000000000036'),
  1,
  'the destination remains the final semantic snapshot for duplicate personal copies'
);
delete from public.book_tropes
where trope_id = '70000000-0000-4000-8000-000000000036';
delete from public.tropes where id = '70000000-0000-4000-8000-000000000036';
delete from public.books where id in (
  '71000000-0000-4000-8000-000000000036',
  '71900000-0000-4000-8000-000000000036'
);
delete from public.household_work_enrichment
where household_id = (select id from membership_household)
  and work_id = current_setting('test.descending_duplicate_work_id')::uuid;
delete from public.household_works
where household_id = (select id from membership_household)
  and work_id = current_setting('test.descending_duplicate_work_id')::uuid;
delete from public.works
where id = current_setting('test.descending_duplicate_work_id')::uuid;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71111111-1111-4111-8111-111111111111","role":"authenticated","iss":"http://127.0.0.1:55321/auth/v1"}',
  true
);
select is(
  public.add_personal_book_to_household('71000000-0000-4000-8000-000000000003'),
  (select corpus_work_id from public.books where id = '71000000-0000-4000-8000-000000000003'),
  'a borrowed book can be explicitly shared even when wishlist is also checked'
);
select is((select count(*)::int from public.household_library_works()), 3,
  'the explicitly shared borrowed work appears once');
select is(
  (select coalesce(array_to_string(household_tags, ','), '') || '|' || household_tropes::text
   from public.household_library_works() where title = 'A Borrowed Book'),
  '|[]',
  'the borrowed-share checkbox does not publish historical personal tags or tropes'
);
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
select is(
  (select household_tropes from public.household_library_works()
   where title = 'A Borrowed Book'),
  '[{"name": "Only One Bed"}]'::jsonb,
  'a tag-only edit preserves curated household tropes and does not publish historical personal tropes'
);
select lives_ok(
  $$select public.update_household_work_enrichment(
    (select corpus_work_id from public.books where id = '71000000-0000-4000-8000-000000000003'),
    array['household curated sibling'],
    '[{"name":"Only One Bed"}]'::jsonb
  )$$,
  'household tags can be independently curated before a personal trope edit'
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
select is(
  (select array_to_string(household_tags, ',') from public.household_library_works()
   where title = 'A Borrowed Book'),
  'household curated sibling',
  'a trope-only edit preserves curated household tags and does not republish historical personal tags'
);
select set_config('request.headers', '{"host":"127.0.0.1:55321"}', true);
select lives_ok(
  $$update public.books
    set genre = 'Mystery', subgenre = 'Gothic', genres = array['mystery'],
        subgenres = array['gothic'], cover_url = 'https://attacker.example/personal-choice.jpg',
        cover_source = 'url'
    where id = '71000000-0000-4000-8000-000000000003'$$,
  'a personal genre and unsafe cover edit remains personal'
);
select is(
  (select coalesce(genre, 'none') || '|' || coalesce(subgenre, 'none') || '|' ||
          coalesce(cover_url, 'none') || '|' ||
          jsonb_array_length(cover_options)::text
   from public.works
   where id = (select corpus_work_id from public.books
               where id = '71000000-0000-4000-8000-000000000003')),
  'none|none|none|0',
  'personal objective metadata is not implicitly published to the corpus'
);
select set_config('request.headers', '{"host":"attacker.example"}', true);
select lives_ok(
  $$update public.books
    set cover_url = 'https://attacker.example/storage/v1/object/public/covers/u/71111111-1111-4111-8111-111111111111/71000000-0000-4000-8000-000000000003/personal.webp',
        cover_source = 'upload', cover_source_url = null
    where id = '71000000-0000-4000-8000-000000000003'$$,
  'a caller-controlled Host header cannot redefine the trusted cover origin'
);
select is(
  (select coalesce(cover_url, 'none') || '|' || jsonb_array_length(cover_options)::text
   from public.works
   where id = (select corpus_work_id from public.books
               where id = '71000000-0000-4000-8000-000000000003')),
  'none|0',
  'a lookalike path on the request Host is not published despite the local object existing'
);
select lives_ok(
  $$update public.books
    set cover_url = 'http://127.0.0.1:55321/storage/v1/object/public/covers/u/71111111-1111-4111-8111-111111111111/71000000-0000-4000-8000-000000000003/personal.webp',
        cover_source = 'attacker-controlled', cover_source_url = 'javascript:alert(1)'
    where id = '71000000-0000-4000-8000-000000000003'$$,
  'a hosted personal object may retain invalid owner-controlled source metadata privately'
);
select is(
  (select coalesce(cover_url, 'none') || '|' || jsonb_array_length(cover_options)::text
   from public.works
   where id = (select corpus_work_id from public.books
               where id = '71000000-0000-4000-8000-000000000003')),
  'none|0',
  'hosted path matching cannot bypass the shared cover-option object schema'
);
select lives_ok(
  $$update public.books
    set cover_url = 'http://127.0.0.1:55321/storage/v1/object/public/covers/u/71111111-1111-4111-8111-111111111111/71000000-0000-4000-8000-000000000003/personal.webp',
        cover_source = 'upload', cover_source_url = null
    where id = '71000000-0000-4000-8000-000000000003'$$,
  'a hosted personal cover remains private without an explicit corpus edit'
);
select is(
  (select coalesce(cover_options -> -1 ->> 'url', 'none') from public.works
   where id = (select corpus_work_id from public.books
               where id = '71000000-0000-4000-8000-000000000003')),
  'none',
  'a valid hosted personal object still requires an explicit corpus edit'
);

select throws_ok(
  $$select public.edit_corpus_work_metadata(
    (select corpus_work_id from public.books where id = '71000000-0000-4000-8000-000000000003'),
    null, null, null, 'standalone',
    'Mystery', 'Gothic', array['mystery'], array['gothic'],
    'https://attacker.example/lookalike.webp',
    '[{"url":"https://attacker.example/lookalike.webp","source":"url"}]'::jsonb,
    null, null, null
  )$$,
  '22023',
  null,
  'the scoped corpus RPC rejects an arbitrary peer-loaded cover URL'
);
select throws_ok(
  $$select public.edit_corpus_work_metadata(
    (select corpus_work_id from public.books where id = '71000000-0000-4000-8000-000000000003'),
    null, null, null, 'standalone',
    'Mystery', 'Gothic', array['mystery'], array['gothic'], null,
    '[{"url":42,"unexpected":true}]'::jsonb, null, null, null
  )$$,
  '22023',
  null,
  'the scoped corpus RPC rejects cover options outside the reviewed object schema'
);
select throws_ok(
  $$select public.edit_corpus_work_metadata(
    (select corpus_work_id from public.books where id = '71000000-0000-4000-8000-000000000003'),
    null, null, null, 'standalone',
    'Mystery', 'Gothic', array['mystery'], array['gothic'], null,
    '["not-an-object"]'::jsonb, null, null, null
  )$$,
  '22023',
  null,
  'the shared cover schema rejects scalar options without evaluating object keys'
);

select lives_ok(
  $$select public.edit_corpus_work_metadata(
    (select corpus_work_id from public.books where id = '71000000-0000-4000-8000-000000000003'),
    null, null, null, 'standalone',
    'Romance',
    'Contemporary',
    array['Romance', 'romance'],
    array['Contemporary'],
    'http://127.0.0.1:55321/storage/v1/object/public/covers/u/71111111-1111-4111-8111-111111111111/71000000-0000-4000-8000-000000000003/direct.webp',
    '[{"url":"http://127.0.0.1:55321/storage/v1/object/public/covers/u/71111111-1111-4111-8111-111111111111/71000000-0000-4000-8000-000000000003/direct.webp","source":"upload"}]'::jsonb,
    null, null, null
  )$$,
  'a household owner can explicitly update the reviewed objective corpus fields'
);
select is(
  (select genre || '|' || subgenre from public.works
   where id = (select corpus_work_id from public.books
               where id = '71000000-0000-4000-8000-000000000003')),
  'romance|contemporary',
  'genre and subgenre are stored on the shared corpus work'
);
reset role;
select is((select count(*)::int from public.work_metadata_edits), 1,
  'only the explicit corpus change reaches the append-only audit');

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
select is((select count(*)::int from public.household_library_books()), 3,
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
  $$select public.edit_corpus_work_metadata(
    current_setting('test.absent_work_id')::uuid,
    null, null, null, 'standalone',
    'Fantasy', null, array['fantasy'], '{}', null, '[]'::jsonb, null, null, null
  )$$,
  '42501',
  null,
  'a reader cannot edit a real target UUID absent from their active personal or household library'
);
reset role;

select * from finish();
rollback;
