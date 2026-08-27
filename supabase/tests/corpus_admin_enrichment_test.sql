begin;
select plan(62);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('81111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated',
   'corpus-admin@example.com', '{}', '{"display_name":"Corpus Admin"}', now(), now()),
  ('82222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated',
   'corpus-reader@example.com', '{}', '{"display_name":"Corpus Reader"}', now(), now());

insert into public.corpus_admins (user_id)
values ('81111111-1111-4111-8111-111111111111');

insert into public.works (id, work_key, title, author_text, contributors, cover_url)
values
  (
    '80000000-0000-4000-8000-000000000001', 'adminwork|writer', 'Admin Work', 'A Writer',
    '[{"name":"A Writer","role":"author","position":0}]'::jsonb, null
  ),
  (
    '80000000-0000-4000-8000-000000000004', 'legacycover|writer', 'Legacy Cover', 'D Writer',
    '[{"name":"D Writer","role":"author","position":0}]'::jsonb,
    'https://legacy.example/selected-cover.webp'
  ),
  (
    '80000000-0000-4000-8000-000000000005', 'lookalikework|writer', 'Lookalike Work', 'L Writer',
    '[]'::jsonb, null
  );

select ok(
  public.google_books_display_cover_url_is_valid(
    'https://books.google.com/books/content?id=legitimate'
  ),
  'the Google Books API image host remains a sanctioned display-only cover'
);
select ok(
  public.google_books_display_cover_url_is_valid(
    'https://books.googleusercontent.com/books/content?id=legitimate'
  ),
  'the exact Google Books image mirror remains sanctioned'
);
select ok(
  not public.google_books_display_cover_url_is_valid(
    'https://books.google.evil.example/books/content?id=attacker'
  )
  and not public.google_books_display_cover_url_is_valid(
    'https://books.googleusercontent.com.evil.example/books/content?id=attacker'
  )
  and not public.google_books_display_cover_url_is_valid(
    'https://books.google.com@evil.example/books/content?id=attacker'
  ),
  'lookalike and userinfo hosts are never classified as Google-owned artwork'
);

insert into storage.objects (bucket_id, name, owner)
values
  (
    'covers',
    'w/80000000-0000-4000-8000-000000000001/rev1.webp',
    '81111111-1111-4111-8111-111111111111'
  ),
  (
    'covers',
    'w/80000000-0000-4000-8000-000000000004/rev2.webp',
    '81111111-1111-4111-8111-111111111111'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82222222-2222-4222-8222-222222222222","role":"authenticated","iss":"http://127.0.0.1:55321/auth/v1"}',
  true
);

select is(public.is_corpus_admin(), false, 'an ordinary reader is not a corpus administrator');
select throws_ok(
  $$select public.complete_corpus_work_metadata(
    '80000000-0000-4000-8000-000000000001', '{"pages":320}'::jsonb, now()
  )$$,
  '42501', null, 'an ordinary reader cannot complete corpus metadata'
);
select throws_ok(
  $$select public.admin_add_corpus_work_trope(
    '80000000-0000-4000-8000-000000000001', 'Quietly Competent', 'characters'
  )$$,
  '42501', null, 'an ordinary reader cannot promote a corpus trope'
);
select throws_ok(
  $$select public.admin_recover_personal_corpus_covers()$$,
  '42501', null, 'an ordinary reader cannot run the personal-cover recovery preflight'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"81111111-1111-4111-8111-111111111111","role":"authenticated","iss":"http://127.0.0.1:55321/auth/v1"}',
  true
);

select is(public.is_corpus_admin(), true, 'the service-managed grant authorizes its account');
select public.complete_corpus_work_metadata(
  '80000000-0000-4000-8000-000000000005',
  '{"coverUrl":"https://books.google.evil.example/books/content?id=attacker","coverSource":"google"}'::jsonb,
  '2026-08-31T12:00:00Z'
);
select is(
  (select cover_url from public.works where id = '80000000-0000-4000-8000-000000000005'),
  null::text,
  'administrator completion cannot publish a Google lookalike host'
);
select is(
  public.complete_corpus_work_metadata(
    '80000000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'pages', 320, 'pubY', 2025, 'pubM', 6, 'publisher', 'Warm House', 'language', 'en',
      'description', 'A durable description.', 'isbns', jsonb_build_array('978-0-306-40615-7'),
      'genre', 'Fantasy', 'genres', jsonb_build_array('Fantasy', 'Romance'),
      'coverUrl', 'http://127.0.0.1:55321/storage/v1/object/public/covers/w/80000000-0000-4000-8000-000000000001/rev1.webp',
      'coverSource', 'openlibrary', 'coverSourceUrl', 'https://covers.openlibrary.org/b/id/1-L.jpg',
      'externalWorkId', 'OLW1', 'editionId', 'OLE1', 'confidence', 'high',
      'provenance', jsonb_build_object('pageCount', jsonb_build_object('source', 'openlibrary'))
    ),
    '2026-08-31T12:00:00Z'
  ),
  '80000000-0000-4000-8000-000000000001'::uuid,
  'an administrator can complete one corpus work'
);

select is((select pages from public.works where work_key = 'adminwork|writer'), 320,
  'page count is retained in the corpus');
select is((select publisher from public.works where work_key = 'adminwork|writer'), 'Warm House',
  'publisher is retained in the corpus');
select is((select language from public.works where work_key = 'adminwork|writer'), 'en',
  'language is retained in the corpus');
select is((select description from public.works where work_key = 'adminwork|writer'),
  'A durable description.', 'description is retained in the corpus');
select is((select isbns[1] from public.works where work_key = 'adminwork|writer'),
  '9780306406157', 'ISBN is canonicalized and retained in the corpus');
select is((select edition_ids[1] from public.works where work_key = 'adminwork|writer'),
  'OLE1', 'external edition identity is retained in the corpus');
select is((select cover_url from public.works where work_key = 'adminwork|writer'),
  'http://127.0.0.1:55321/storage/v1/object/public/covers/w/80000000-0000-4000-8000-000000000001/rev1.webp',
  'canonical cover points to a corpus-owned object');
select is((select jsonb_array_length(cover_options) from public.works where work_key = 'adminwork|writer'),
  1, 'the durable corpus cover is retained as an option');
select is((select enriched_at from public.works where work_key = 'adminwork|writer'),
  '2026-08-31T12:00:00Z'::timestamptz, 'the corpus has its own recheck clock');
select is((select metadata_provenance -> 'pageCount' ->> 'source' from public.works where work_key = 'adminwork|writer'),
  'openlibrary', 'field provenance remains with the corpus work');

select public.complete_corpus_work_metadata(
  '80000000-0000-4000-8000-000000000004',
  jsonb_build_object(
    'coverUrl', 'http://127.0.0.1:55321/storage/v1/object/public/covers/w/80000000-0000-4000-8000-000000000004/rev2.webp',
    'coverSource', 'url',
    'coverSourceUrl', 'https://legacy.example/selected-cover.webp'
  ),
  '2026-08-31T12:00:00Z'
);
select is(
  (select cover_url from public.works where id = '80000000-0000-4000-8000-000000000004'),
  'http://127.0.0.1:55321/storage/v1/object/public/covers/w/80000000-0000-4000-8000-000000000004/rev2.webp',
  'an exact existing cover is relocated from a fragile URL to corpus-owned storage'
);

select public.complete_corpus_work_metadata(
  '80000000-0000-4000-8000-000000000001',
  '{"pages":999,"publisher":"Replacement","genre":"mystery","provenance":{"pageCount":{"source":"google"}}}'::jsonb,
  '2026-09-01T12:00:00Z'
);
select is(
  (select concat_ws('|', pages, publisher, genre) from public.works where work_key = 'adminwork|writer'),
  '320|Warm House|fantasy',
  'automated completion is fill-only and cannot replace existing corpus facts'
);
select is(
  (select metadata_provenance -> 'pageCount' ->> 'source'
   from public.works where work_key = 'adminwork|writer'),
  'openlibrary', 'a rejected replacement cannot relabel existing corpus provenance'
);
reset role;
select ok((select count(*) >= 1 from public.work_metadata_edits
  where work_id = '80000000-0000-4000-8000-000000000001'),
  'corpus completion remains append-only audited');

insert into public.works (id, work_key, title, author_text, contributors)
values (
  '80000000-0000-4000-8000-000000000002', 'leavingwork|writer', 'Leaving Work', 'B Writer',
  '[{"name":"B Writer","role":"author","position":0}]'::jsonb
);
insert into public.books (
  id, owner_id, corpus_work_id, title, author_first, author_last, series, position, pages,
  pub_y, isbn, ownership, cover_url, cover_source, cover_source_url
) values (
  '81000000-0000-4000-8000-000000000002',
  '81111111-1111-4111-8111-111111111111',
  '80000000-0000-4000-8000-000000000002',
  'Leaving Work', 'B', 'Writer', 'Leaving Series', 2, 444, 2024, '9780140328721', 'unowned',
  'https://books.google.com/books/content?id=leaving-work&printsec=frontcover&img=1',
  'google',
  'https://books.google.com/books/content?id=leaving-work&printsec=frontcover&img=1'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"81111111-1111-4111-8111-111111111111","role":"authenticated","iss":"http://127.0.0.1:55321/auth/v1"}',
  true
);
select is(
  public.remove_personal_book('81000000-0000-4000-8000-000000000002'),
  '81000000-0000-4000-8000-000000000002'::uuid,
  'the owner can remove the personal membership'
);
select is(
  (select concat_ws('|', series, position, pages, pub_y, isbns[1])
   from public.works where id = '80000000-0000-4000-8000-000000000002'),
  'Leaving Series|2|444|2024|9780140328721',
  'soft removal first preserves every available objective gap in the corpus'
);
select is(
  (select cover_url from public.works where id = '80000000-0000-4000-8000-000000000002'),
  'https://books.google.com/books/content?id=leaving-work&printsec=frontcover&img=1',
  'the sanctioned display-only Google cover survives personal removal without byte storage'
);

reset role;
select set_config('request.jwt.claims', '{}', true);
insert into public.books (
  id, owner_id, corpus_work_id, title, author_first, author_last, ownership,
  cover_url, cover_source, cover_source_url
) values (
  '81000000-0000-4000-8000-000000000005',
  '82222222-2222-4222-8222-222222222222',
  '80000000-0000-4000-8000-000000000005',
  'Lookalike Work', 'L', 'Writer', 'unowned',
  'https://books.google.evil.example/books/content?id=attacker', 'google',
  'https://books.google.evil.example/books/content?id=attacker'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82222222-2222-4222-8222-222222222222","role":"authenticated","iss":"http://127.0.0.1:55321/auth/v1"}',
  true
);
select public.remove_personal_book('81000000-0000-4000-8000-000000000005');
select is(
  (select cover_url from public.works where id = '80000000-0000-4000-8000-000000000005'),
  null::text,
  'ordinary personal removal cannot promote an attacker-controlled Google lookalike'
);

reset role;
select set_config('request.jwt.claims', '{}', true);
insert into public.works (id, work_key, title, author_text, contributors)
values (
  '80000000-0000-4000-8000-000000000003', 'deletedwork|writer', 'Deleted Work', 'C Writer',
  '[]'::jsonb
);
insert into public.books (
  id, owner_id, corpus_work_id, title, author_first, author_last, pages, isbn, ownership
) values (
  '81000000-0000-4000-8000-000000000003',
  '81111111-1111-4111-8111-111111111111',
  '80000000-0000-4000-8000-000000000003',
  'Deleted Work', 'C', 'Writer', 555, '0439023521', 'unowned'
);
insert into public.authors (id, owner_id, name, name_key)
values
  ('83000000-0000-4000-8000-000000000001', '81111111-1111-4111-8111-111111111111',
   'C Writer', 'c writer'),
  ('83000000-0000-4000-8000-000000000002', '81111111-1111-4111-8111-111111111111',
   'D Collaborator', 'd collaborator');
insert into public.book_authors (book_id, author_id, owner_id, position, role)
values
  ('81000000-0000-4000-8000-000000000003', '83000000-0000-4000-8000-000000000001',
   '81111111-1111-4111-8111-111111111111', 0, 'author'),
  ('81000000-0000-4000-8000-000000000003', '83000000-0000-4000-8000-000000000002',
   '81111111-1111-4111-8111-111111111111', 1, 'co_author');
delete from public.books where id = '81000000-0000-4000-8000-000000000003';
select is((select pages from public.works where id = '80000000-0000-4000-8000-000000000003'),
  555, 'hard deletion and merge paths preserve objective metadata too');
select is((select isbns[1] from public.works where id = '80000000-0000-4000-8000-000000000003'),
  '9780439023528', 'ISBN-10 is converted and retained as canonical ISBN-13 before deletion');
select is(
  (select concat_ws('|', jsonb_array_length(contributors), contributors -> 1 ->> 'role')
   from public.works where id = '80000000-0000-4000-8000-000000000003'),
  '2|co_author', 'ordered multi-contributor identity and roles survive personal deletion'
);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values (
  '85555555-5555-4555-8555-555555555555', 'authenticated', 'authenticated',
  'account-cascade@example.com', '{}', '{}', now(), now()
);
insert into public.works (id, work_key, title, author_text, contributors)
values (
  '85000000-0000-4000-8000-000000000001', 'accountcascade|writer',
  'Account Cascade', 'E Writer', '[]'::jsonb
);
insert into public.books (id, owner_id, corpus_work_id, title, author_first, author_last, ownership)
values (
  '85000000-0000-4000-8000-000000000002', '85555555-5555-4555-8555-555555555555',
  '85000000-0000-4000-8000-000000000001', 'Account Cascade', 'E', 'Writer', 'unowned'
);
insert into public.authors (id, owner_id, name, name_key)
values
  ('85000000-0000-4000-8000-000000000003', '85555555-5555-4555-8555-555555555555',
   'E Writer', 'e writer'),
  ('85000000-0000-4000-8000-000000000004', '85555555-5555-4555-8555-555555555555',
   'F Collaborator', 'f collaborator');
insert into public.book_authors (book_id, author_id, owner_id, position, role)
values
  ('85000000-0000-4000-8000-000000000002', '85000000-0000-4000-8000-000000000003',
   '85555555-5555-4555-8555-555555555555', 0, 'author'),
  ('85000000-0000-4000-8000-000000000002', '85000000-0000-4000-8000-000000000004',
   '85555555-5555-4555-8555-555555555555', 1, 'co_author');
delete from auth.users where id = '85555555-5555-4555-8555-555555555555';
select is(
  (select concat_ws('|', jsonb_array_length(contributors), contributors -> 1 ->> 'role')
   from public.works where id = '85000000-0000-4000-8000-000000000001'),
  '2|co_author',
  'account deletion preserves the complete contributor graph before sibling cascades begin'
);
insert into public.books (
  id, owner_id, corpus_work_id, title, author_first, author_last, ownership
) values (
  '81000000-0000-4000-8000-000000000004',
  '81111111-1111-4111-8111-111111111111',
  '80000000-0000-4000-8000-000000000003',
  'Deleted Work', 'C', 'Writer', 'unowned'
);
insert into storage.objects (bucket_id, name, owner)
values (
  'covers',
  'u/81111111-1111-4111-8111-111111111111/81000000-0000-4000-8000-000000000004/recovered.webp',
  '81111111-1111-4111-8111-111111111111'
);
update public.books
set cover_url = 'http://127.0.0.1:55321/storage/v1/object/public/covers/u/81111111-1111-4111-8111-111111111111/81000000-0000-4000-8000-000000000004/recovered.webp',
    cover_source = 'upload',
    cover_source_url = null
where id = '81000000-0000-4000-8000-000000000004';

insert into public.households (id, name)
values ('80000000-0000-4000-8000-000000000010', 'Corpus Household');
insert into public.household_members (household_id, user_id, role)
values
  ('80000000-0000-4000-8000-000000000010',
   '81111111-1111-4111-8111-111111111111', 'owner'),
  ('80000000-0000-4000-8000-000000000010',
   '82222222-2222-4222-8222-222222222222', 'member');
insert into public.household_works (household_id, work_id, added_by, inclusion_source)
values ('80000000-0000-4000-8000-000000000010',
  '80000000-0000-4000-8000-000000000001',
  '81111111-1111-4111-8111-111111111111', 'manual');
insert into public.tropes (id, owner_id, name, facet)
values (
  '84000000-0000-4000-8000-000000000001',
  '82222222-2222-4222-8222-222222222222',
  'Private Reader Observation',
  'vibe'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"81111111-1111-4111-8111-111111111111","role":"authenticated","iss":"http://127.0.0.1:55321/auth/v1"}',
  true
);
select is(
  public.admin_recover_personal_corpus_covers() ->> 'recoveredCovers',
  '1',
  'the administrator preflight recovers an exact selected personal cover'
);
select is(
  (select cover_url from public.works where id = '80000000-0000-4000-8000-000000000003'),
  'http://127.0.0.1:55321/storage/v1/object/public/covers/u/81111111-1111-4111-8111-111111111111/81000000-0000-4000-8000-000000000004/recovered.webp',
  'cover recovery retains the selected artwork for later corpus-owned relocation'
);
select is(
  (select enriched_at from public.works where id = '80000000-0000-4000-8000-000000000003'),
  null::timestamptz,
  'cover recovery does not postpone the still-needed metadata check'
);
select ok(
  public.admin_add_corpus_work_trope(
    '80000000-0000-4000-8000-000000000001', 'Quietly Competent', 'characters'
  ) is not null,
  'an administrator can add a trope directly to a corpus work'
);
select is(
  (select source_scope from public.work_tropes wt
   join public.tropes t on t.id = wt.trope_id
   where wt.work_id = '80000000-0000-4000-8000-000000000001'
     and t.name = 'Quietly Competent'),
  'direct', 'direct corpus trope promotion retains its source attribution'
);
select is((select cover_url from public.household_library_works()
  where work_id = '80000000-0000-4000-8000-000000000001'),
  'http://127.0.0.1:55321/storage/v1/object/public/covers/w/80000000-0000-4000-8000-000000000001/rev1.webp',
  'household-only reads receive the completed corpus cover');
select is(
  (select count(*)::int from jsonb_array_elements(
    (select household_tropes from public.household_library_works()
     where work_id = '80000000-0000-4000-8000-000000000001')
  ) item where item ->> 'name' = 'Quietly Competent'),
  1, 'accepted corpus tropes are visible in the household library exactly once'
);

select throws_ok(
  $$insert into public.book_tropes (book_id, trope_id, owner_id, emphasis)
    values (
      '81000000-0000-4000-8000-000000000004',
      '84000000-0000-4000-8000-000000000001',
      '81111111-1111-4111-8111-111111111111',
      'present'
    )$$,
  '42501', null,
  'an administrator cannot promote another reader''s private trope by guessed id'
);

insert into public.tropes (owner_id, canonical_id, name, facet)
values (
  '81111111-1111-4111-8111-111111111111',
  '84000000-0000-4000-8000-000000000001',
  'Safely Canonicalized',
  'vibe'
);
insert into public.book_tropes (book_id, trope_id, owner_id, emphasis)
select
  '81000000-0000-4000-8000-000000000004', t.id,
  '81111111-1111-4111-8111-111111111111', 'present'
from public.tropes t
where t.owner_id = '81111111-1111-4111-8111-111111111111'
  and t.name = 'Safely Canonicalized';
select is(
  (select count(*)::int from public.work_tropes wt
   join public.tropes t on t.id = wt.trope_id
   where wt.work_id = '80000000-0000-4000-8000-000000000003'
     and t.name = 'Safely Canonicalized' and t.owner_id is null),
  1,
  'a malformed personal canonical link cannot place another private trope in the corpus'
);

insert into public.tropes (owner_id, name, facet)
values ('81111111-1111-4111-8111-111111111111', 'Rain-Soaked Quest', 'vibe');
insert into public.book_tropes (book_id, trope_id, owner_id, emphasis)
select
  '81000000-0000-4000-8000-000000000004', t.id,
  '81111111-1111-4111-8111-111111111111', 'present'
from public.tropes t
where t.owner_id = '81111111-1111-4111-8111-111111111111'
  and t.name = 'Rain-Soaked Quest';
select is(
  (select wt.source_scope from public.work_tropes wt
   join public.tropes t on t.id = wt.trope_id
   where wt.work_id = '80000000-0000-4000-8000-000000000003'
     and t.owner_id is null and t.name = 'Rain-Soaked Quest'),
  'personal', 'an administrator personal-library assignment promotes a canonical corpus trope'
);
delete from public.book_tropes where book_id = '81000000-0000-4000-8000-000000000004';
select is(
  (select count(*)::int from public.work_tropes wt
   join public.tropes t on t.id = wt.trope_id
   where wt.work_id = '80000000-0000-4000-8000-000000000003'
     and t.name = 'Rain-Soaked Quest'),
  1, 'removing a personal assignment does not retract accepted corpus metadata'
);

select is(
  public.update_household_work_enrichment(
    '80000000-0000-4000-8000-000000000001', '{}',
    '[{"name":"Tender Rivalry","emphasis":"present"}]'::jsonb
  ),
  '80000000-0000-4000-8000-000000000001'::uuid,
  'an administrator can add a trope through household enrichment'
);
select is(
  (select wt.source_scope from public.work_tropes wt
   join public.tropes t on t.id = wt.trope_id
   where wt.work_id = '80000000-0000-4000-8000-000000000001'
     and t.owner_id is null and t.name = 'Tender Rivalry'),
  'household', 'household-origin promotion retains its source attribution'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"82222222-2222-4222-8222-222222222222","role":"authenticated","iss":"http://127.0.0.1:55321/auth/v1"}',
  true
);
select public.update_household_work_enrichment(
  '80000000-0000-4000-8000-000000000001', '{}',
  '[{"name":"Reader-Only Observation","emphasis":"present"}]'::jsonb
);
select is(
  (select count(*)::int from public.work_tropes wt
   join public.tropes t on t.id = wt.trope_id
   where wt.work_id = '80000000-0000-4000-8000-000000000001'
     and t.name = 'Reader-Only Observation'),
  0, 'ordinary household edits remain household-only until the later voting mechanism exists'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"81111111-1111-4111-8111-111111111111","role":"authenticated","iss":"http://127.0.0.1:55321/auth/v1"}',
  true
);

select ok(has_function_privilege('authenticated', 'public.is_corpus_admin()', 'EXECUTE'),
  'authenticated may ask only for its own admin status');
select ok(not has_function_privilege('anon', 'public.is_corpus_admin()', 'EXECUTE'),
  'anon cannot inspect corpus-admin status');
select ok(has_function_privilege('authenticated',
  'public.complete_corpus_work_metadata(uuid,jsonb,timestamp with time zone)', 'EXECUTE'),
  'authenticated can reach the RPC whose body enforces corpus-admin authorization');
select ok(not has_function_privilege('anon',
  'public.complete_corpus_work_metadata(uuid,jsonb,timestamp with time zone)', 'EXECUTE'),
  'anon cannot reach corpus completion');
select ok(not has_function_privilege('service_role',
  'public.complete_corpus_work_metadata(uuid,jsonb,timestamp with time zone)', 'EXECUTE'),
  'service-role jobs use explicit table writes rather than impersonating a corpus admin');
select ok(has_function_privilege('authenticated',
  'public.admin_add_corpus_work_trope(uuid,text,text)', 'EXECUTE'),
  'authenticated can reach the direct trope RPC whose body enforces corpus-admin authorization');
select ok(not has_function_privilege('anon',
  'public.admin_add_corpus_work_trope(uuid,text,text)', 'EXECUTE'),
  'anon cannot reach direct corpus trope promotion');
select ok(not has_function_privilege('service_role',
  'public.admin_add_corpus_work_trope(uuid,text,text)', 'EXECUTE'),
  'service role cannot impersonate a reader through direct corpus trope promotion');
select ok(has_function_privilege('authenticated',
  'public.admin_recover_personal_corpus_covers()', 'EXECUTE'),
  'authenticated can reach the owner-scoped cover recovery body');
select ok(not has_function_privilege('anon',
  'public.admin_recover_personal_corpus_covers()', 'EXECUTE'),
  'anon cannot reach personal-cover recovery');
select ok(not has_function_privilege('service_role',
  'public.admin_recover_personal_corpus_covers()', 'EXECUTE'),
  'service role cannot inspect a reader library through the recovery preflight');
select ok(not has_table_privilege('authenticated', 'public.work_tropes', 'INSERT'),
  'authenticated readers cannot bypass promotion with direct work-trope inserts');

select ok(not has_function_privilege('authenticated',
  'public.reconcile_household_library_memberships(uuid,jsonb,uuid[])', 'EXECUTE'),
  'a reader cannot run the cross-account reconciliation operator');
select ok(has_function_privilege('service_role',
  'public.reconcile_household_library_memberships(uuid,jsonb,uuid[])', 'EXECUTE'),
  'the reviewed reconciliation operator is service-role-only');

reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.reconcile_household_library_memberships(
    '80000000-0000-4000-8000-000000000010',
    '[{"accountId":"81111111-1111-4111-8111-111111111111","workIds":["80000000-0000-4000-8000-000000000001"]},{"accountId":"82222222-2222-4222-8222-222222222222","workIds":[]}]'::jsonb,
    array['80000000-0000-4000-8000-000000000001']::uuid[]
  ) ->> 'personalCreated',
  '1',
  'the atomic operator creates the exact reviewed personal membership set'
);
select is(
  (select count(*)::int from public.books
   where owner_id = '81111111-1111-4111-8111-111111111111'
     and corpus_work_id = '80000000-0000-4000-8000-000000000001'
     and removed_at is null and ownership = 'unowned' and read_status = 'Read'),
  1,
  'operator-created personal rows are read history, not invented ownership'
);

reset role;
select * from finish();
rollback;
