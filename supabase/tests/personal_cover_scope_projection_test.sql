-- Trusted eligible copy covers reach the household read model. Corpus publication is an explicit,
-- audited administrator review action and never a side effect of a personal-book write.
begin;
select plan(45);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    'a1111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated',
    'cover-admin@example.com', '{}', '{"display_name":"Cover Admin"}', now(), now()
  ),
  (
    'b2222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated',
    'cover-member@example.com', '{}', '{"display_name":"Cover Member"}', now(), now()
  );

insert into public.corpus_admins (user_id)
values ('a1111111-1111-4111-8111-111111111111');

insert into public.households (id, name)
values ('c3333333-3333-4333-8333-333333333333', 'Cover household');
insert into public.household_members (household_id, user_id, role) values
  (
    'c3333333-3333-4333-8333-333333333333',
    'a1111111-1111-4111-8111-111111111111',
    'owner'
  ),
  (
    'c3333333-3333-4333-8333-333333333333',
    'b2222222-2222-4222-8222-222222222222',
    'member'
  );

insert into public.works (id, work_key, title, author_text, contributors) values
  (
    'd4444444-4444-4444-8444-444444444441',
    public.library_work_key('Household Cover', 'Writer One'),
    'Household Cover',
    'Writer One',
    '[{"name":"Writer One","role":"author","position":0}]'::jsonb
  ),
  (
    'd4444444-4444-4444-8444-444444444442',
    public.library_work_key('Administrator Cover', 'Writer Two'),
    'Administrator Cover',
    'Writer Two',
    '[{"name":"Writer Two","role":"author","position":0}]'::jsonb
  ),
  (
    'd4444444-4444-4444-8444-444444444443',
    public.library_work_key('Unsafe Administrator Cover', 'Writer Three'),
    'Unsafe Administrator Cover',
    'Writer Three',
    '[{"name":"Writer Three","role":"author","position":0}]'::jsonb
  );

insert into public.books (
  id, owner_id, corpus_work_id, title, authors_display, ownership
) values
  (
    'e5555555-5555-4555-8555-555555555551',
    'b2222222-2222-4222-8222-222222222222',
    'd4444444-4444-4444-8444-444444444441',
    'Household Cover',
    'Writer One',
    'owned'
  ),
  (
    'e5555555-5555-4555-8555-555555555552',
    'a1111111-1111-4111-8111-111111111111',
    'd4444444-4444-4444-8444-444444444442',
    'Administrator Cover',
    'Writer Two',
    'owned'
  );

insert into storage.objects (bucket_id, name, owner) values
  (
    'covers',
    'u/b2222222-2222-4222-8222-222222222222/e5555555-5555-4555-8555-555555555551/member.webp',
    'b2222222-2222-4222-8222-222222222222'
  ),
  (
    'covers',
    'u/b2222222-2222-4222-8222-222222222222/e5555555-5555-4555-8555-555555555551/member_t.webp',
    'b2222222-2222-4222-8222-222222222222'
  ),
  (
    'covers',
    'u/a1111111-1111-4111-8111-111111111111/e5555555-5555-4555-8555-555555555552/adminone.webp',
    'a1111111-1111-4111-8111-111111111111'
  ),
  (
    'covers',
    'u/a1111111-1111-4111-8111-111111111111/e5555555-5555-4555-8555-555555555553/admintwo.webp',
    'a1111111-1111-4111-8111-111111111111'
  );

select ok(
  not has_function_privilege(
    'anon', 'public.admin_review_personal_cover_for_corpus(uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated', 'public.admin_review_personal_cover_for_corpus(uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'service_role', 'public.admin_review_personal_cover_for_corpus(uuid)', 'EXECUTE'
  ),
  'the stale UUID-only administrator review boundary is unavailable to every API role'
);
select ok(
  not has_function_privilege(
    'anon', 'public.admin_review_personal_cover_for_corpus(uuid,uuid,text)', 'EXECUTE'
  )
  and has_function_privilege(
    'authenticated', 'public.admin_review_personal_cover_for_corpus(uuid,uuid,text)', 'EXECUTE'
  )
  and not has_function_privilege(
    'service_role', 'public.admin_review_personal_cover_for_corpus(uuid,uuid,text)', 'EXECUTE'
  ),
  'only authenticated callers can reach the exact-context administrator review boundary'
);
select is(
  (
    select count(*)::int
    from pg_catalog.pg_trigger trigger
    where trigger.tgrelid = 'public.books'::regclass
      and trigger.tgname in (
        'books_promote_admin_cover_after_insert',
        'books_promote_admin_cover_after_update'
      )
      and not trigger.tgisinternal
  ),
  0,
  'personal cover writes install no implicit corpus-promotion trigger'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"b2222222-2222-4222-8222-222222222222","role":"authenticated","iss":"http://127.0.0.1:55321/auth/v1"}',
  true
);
update public.books
set cover_url = 'http://127.0.0.1:55321/storage/v1/object/public/covers/u/b2222222-2222-4222-8222-222222222222/e5555555-5555-4555-8555-555555555551/member.webp',
    cover_thumb_url = 'http://127.0.0.1:55321/storage/v1/object/public/covers/u/b2222222-2222-4222-8222-222222222222/e5555555-5555-4555-8555-555555555551/member_t.webp',
    cover_source = 'upload',
    cover_source_url = 'https://private.example/member-source',
    cover_color = '#123456'
where id = 'e5555555-5555-4555-8555-555555555551';

select is(
  (select cover_url from public.works where id = 'd4444444-4444-4444-8444-444444444441'),
  null::text,
  'an ordinary personal cover write does not become corpus metadata'
);
select is(
  (
    select cover_url from public.household_library_works()
    where work_id = 'd4444444-4444-4444-8444-444444444441'
  ),
  null::text,
  'the canonical household cover remains separate from copy fallbacks'
);
select is(
  (
    select owner ->> 'coverUrl'
    from public.household_library_works() household_work
    cross join lateral jsonb_array_elements(household_work.owners) owner
    where household_work.work_id = 'd4444444-4444-4444-8444-444444444441'
      and owner ->> 'bookId' = 'e5555555-5555-4555-8555-555555555551'
  ),
  'http://127.0.0.1:55321/storage/v1/object/public/covers/u/b2222222-2222-4222-8222-222222222222/e5555555-5555-4555-8555-555555555551/member.webp',
  'a reader sees their own eligible personal cover in the household projection'
);
select is(
  (
    select owner ->> 'coverThumbUrl'
    from public.household_library_works() household_work
    cross join lateral jsonb_array_elements(household_work.owners) owner
    where household_work.work_id = 'd4444444-4444-4444-8444-444444444441'
      and owner ->> 'bookId' = 'e5555555-5555-4555-8555-555555555551'
  ),
  'http://127.0.0.1:55321/storage/v1/object/public/covers/u/b2222222-2222-4222-8222-222222222222/e5555555-5555-4555-8555-555555555551/member_t.webp',
  'a reader sees their own eligible personal thumbnail'
);
select is(
  (
    select owner ->> 'coverColor'
    from public.household_library_works() household_work
    cross join lateral jsonb_array_elements(household_work.owners) owner
    where household_work.work_id = 'd4444444-4444-4444-8444-444444444441'
      and owner ->> 'bookId' = 'e5555555-5555-4555-8555-555555555551'
  ),
  '#123456',
  'the personal cover color accompanies the household fallback'
);
select ok(
  not exists (
    select 1
    from public.household_library_works() household_work
    cross join lateral jsonb_array_elements(household_work.owners) owner
    where household_work.work_id = 'd4444444-4444-4444-8444-444444444441'
      and owner ? 'coverSourceUrl'
  ),
  'the personal cover source URL remains outside the household projection'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated","iss":"http://127.0.0.1:55321/auth/v1"}',
  true
);
select is(
  (
    select owner ->> 'coverUrl'
    from public.household_library_works() household_work
    cross join lateral jsonb_array_elements(household_work.owners) owner
    where household_work.work_id = 'd4444444-4444-4444-8444-444444444441'
      and owner ->> 'bookId' = 'e5555555-5555-4555-8555-555555555551'
  ),
  'http://127.0.0.1:55321/storage/v1/object/public/covers/u/b2222222-2222-4222-8222-222222222222/e5555555-5555-4555-8555-555555555551/member.webp',
  'a peer sees a real hosted personal cover'
);

reset role;
update public.books
set cover_url = 'https://attacker.example/tracker.jpg',
    cover_thumb_url = 'https://attacker.example/tracker-thumb.jpg',
    cover_source = 'url',
    cover_color = '#badbad'
where id = 'e5555555-5555-4555-8555-555555555551';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated","iss":"http://127.0.0.1:55321/auth/v1"}',
  true
);
select is(
  (
    select owner ->> 'coverUrl'
    from public.household_library_works() household_work
    cross join lateral jsonb_array_elements(household_work.owners) owner
    where household_work.work_id = 'd4444444-4444-4444-8444-444444444441'
      and owner ->> 'bookId' = 'e5555555-5555-4555-8555-555555555551'
  ),
  null::text,
  'an arbitrary peer hotlink never reaches the household browser contract'
);
select is(
  (
    select concat_ws('|', owner ->> 'coverThumbUrl', owner ->> 'coverColor')
    from public.household_library_works() household_work
    cross join lateral jsonb_array_elements(household_work.owners) owner
    where household_work.work_id = 'd4444444-4444-4444-8444-444444444441'
      and owner ->> 'bookId' = 'e5555555-5555-4555-8555-555555555551'
  ),
  '',
  'the arbitrary peer thumbnail and its presentation color are withheld too'
);

reset role;
update public.books
set cover_url = 'https://books.google.evil.example/books/content?id=tracker',
    cover_thumb_url = null,
    cover_source = 'google'
where id = 'e5555555-5555-4555-8555-555555555551';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated","iss":"http://127.0.0.1:55321/auth/v1"}',
  true
);
select is(
  (
    select owner ->> 'coverUrl'
    from public.household_library_works() household_work
    cross join lateral jsonb_array_elements(household_work.owners) owner
    where household_work.work_id = 'd4444444-4444-4444-8444-444444444441'
      and owner ->> 'bookId' = 'e5555555-5555-4555-8555-555555555551'
  ),
  null::text,
  'a Google-lookalike hostname cannot bypass the peer hotlink boundary'
);

reset role;
update public.books
set cover_url = 'https://books.google.com/books/content?id=trusted',
    cover_source = 'google',
    cover_color = '#456789'
where id = 'e5555555-5555-4555-8555-555555555551';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated","iss":"http://127.0.0.1:55321/auth/v1"}',
  true
);
select is(
  (
    select owner ->> 'coverUrl'
    from public.household_library_works() household_work
    cross join lateral jsonb_array_elements(household_work.owners) owner
    where household_work.work_id = 'd4444444-4444-4444-8444-444444444441'
      and owner ->> 'bookId' = 'e5555555-5555-4555-8555-555555555551'
  ),
  'https://books.google.com/books/content?id=trusted',
  'the explicit Google Books display allowlist remains available to peers'
);

update public.books
set cover_url = 'http://127.0.0.1:55321/storage/v1/object/public/covers/u/a1111111-1111-4111-8111-111111111111/e5555555-5555-4555-8555-555555555552/adminone.webp',
    cover_source = 'upload',
    cover_color = '#abcdef'
where id = 'e5555555-5555-4555-8555-555555555552';
reset role;

select is(
  (select cover_url from public.works where id = 'd4444444-4444-4444-8444-444444444442'),
  null::text,
  'an administrator personal-cover write remains unreviewed and does not publish'
);
select is(
  (
    select jsonb_array_length(cover_options)
    from public.works where id = 'd4444444-4444-4444-8444-444444444442'
  ),
  0,
  'the unreviewed administrator cover starts with the review toggle off'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated","iss":"http://127.0.0.1:55321/auth/v1"}',
  true
);
select throws_ok(
  $$select public.admin_review_personal_cover_for_corpus(
    'e5555555-5555-4555-8555-555555555552',
    'd4444444-4444-4444-8444-444444444443',
    'http://127.0.0.1:55321/storage/v1/object/public/covers/u/a1111111-1111-4111-8111-111111111111/e5555555-5555-4555-8555-555555555552/adminone.webp'
  )$$,
  'PT409',
  'personal cover context changed before review; refresh and try again',
  'review refuses when the personal book is no longer bound to the displayed corpus work'
);
select throws_ok(
  $$select public.admin_review_personal_cover_for_corpus(
    'e5555555-5555-4555-8555-555555555552',
    'd4444444-4444-4444-8444-444444444442',
    'https://books.google.com/books/content?id=stale-display'
  )$$,
  'PT409',
  'personal cover context changed before review; refresh and try again',
  'review refuses when the personal cover differs from the one displayed to the administrator'
);
update public.books
set isbn = '0306406152'
where id = 'e5555555-5555-4555-8555-555555555552';
select throws_ok(
  $$select public.admin_review_personal_cover_for_corpus(
    'e5555555-5555-4555-8555-555555555552',
    'd4444444-4444-4444-8444-444444444442',
    'http://127.0.0.1:55321/storage/v1/object/public/covers/u/a1111111-1111-4111-8111-111111111111/e5555555-5555-4555-8555-555555555552/adminone.webp'
  )$$,
  'PT409',
  'personal book ISBN is not established on the displayed corpus work; refresh after identity reconciliation',
  'review canonicalizes ISBN-10 and refuses a fallback-only binding whose identity is unestablished'
);
update public.books
set isbn = null
where id = 'e5555555-5555-4555-8555-555555555552';
select is(
  public.admin_review_personal_cover_for_corpus(
    'e5555555-5555-4555-8555-555555555552',
    'd4444444-4444-4444-8444-444444444442',
    'http://127.0.0.1:55321/storage/v1/object/public/covers/u/a1111111-1111-4111-8111-111111111111/e5555555-5555-4555-8555-555555555552/adminone.webp'
  )::text,
  'd4444444-4444-4444-8444-444444444442',
  'the explicit administrator review returns the bound corpus work'
);
reset role;

select is(
  (select cover_url from public.works where id = 'd4444444-4444-4444-8444-444444444442'),
  'http://127.0.0.1:55321/storage/v1/object/public/covers/u/a1111111-1111-4111-8111-111111111111/e5555555-5555-4555-8555-555555555552/adminone.webp',
  'the first explicitly reviewed administrator cover fills a missing corpus default'
);
select is(
  (
    select concat_ws('|', cover_source, cover_color)
    from public.works where id = 'd4444444-4444-4444-8444-444444444442'
  ),
  'upload|#abcdef',
  'the fill-only default retains its reviewed source and color'
);
select is(
  (
    select jsonb_array_length(cover_options)
    from public.works where id = 'd4444444-4444-4444-8444-444444444442'
  ),
  1,
  'the reviewed administrator cover becomes one corpus option'
);
select is(
  (
    select count(*)::int from public.work_metadata_edits
    where work_id = 'd4444444-4444-4444-8444-444444444442'
      and editor_id = 'a1111111-1111-4111-8111-111111111111'
  ),
  1,
  'the explicit administrator review is audited'
);

-- Reproduce the reviewed finding: a stale owner form omits the newly accepted option. The shared
-- works trigger keeps the reviewed URL at the table boundary instead of silently retracting it.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated","iss":"http://127.0.0.1:55321/auth/v1"}',
  true
);
select public.edit_corpus_work_metadata(
  'd4444444-4444-4444-8444-444444444442',
  null, null, null, null, null, null, '{}', '{}',
  'http://127.0.0.1:55321/storage/v1/object/public/covers/u/a1111111-1111-4111-8111-111111111111/e5555555-5555-4555-8555-555555555552/adminone.webp',
  '[]'::jsonb, null, null, null
);
reset role;
select is(
  (
    select jsonb_array_length(cover_options)
    from public.works where id = 'd4444444-4444-4444-8444-444444444442'
  ),
  1,
  'an authenticated stale metadata edit cannot retract an accepted corpus cover option'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated","iss":"http://127.0.0.1:55321/auth/v1"}',
  true
);
select public.admin_review_personal_cover_for_corpus(
  'e5555555-5555-4555-8555-555555555552',
  'd4444444-4444-4444-8444-444444444442',
  'http://127.0.0.1:55321/storage/v1/object/public/covers/u/a1111111-1111-4111-8111-111111111111/e5555555-5555-4555-8555-555555555552/adminone.webp'
);
reset role;
select is(
  (
    select count(*)::int from public.work_metadata_edits
    where work_id = 'd4444444-4444-4444-8444-444444444442'
      and editor_id = 'a1111111-1111-4111-8111-111111111111'
      and not previous_value ? 'series'
  ),
  1,
  'reviewing the same exact cover again is idempotent'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated","iss":"http://127.0.0.1:55321/auth/v1"}',
  true
);
insert into public.books (
  id, owner_id, corpus_work_id, title, authors_display, ownership,
  cover_url, cover_source, cover_color
) values (
  'e5555555-5555-4555-8555-555555555553',
  'a1111111-1111-4111-8111-111111111111',
  'd4444444-4444-4444-8444-444444444442',
  'Administrator Cover',
  'Writer Two',
  'owned',
  'http://127.0.0.1:55321/storage/v1/object/public/covers/u/a1111111-1111-4111-8111-111111111111/e5555555-5555-4555-8555-555555555553/admintwo.webp',
  'camera',
  '#fedcba'
);
reset role;
select is(
  (
    select jsonb_array_length(cover_options)
    from public.works where id = 'd4444444-4444-4444-8444-444444444442'
  ),
  1,
  'inserting another administrator cover does not bypass explicit review'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated","iss":"http://127.0.0.1:55321/auth/v1"}',
  true
);
select public.admin_review_personal_cover_for_corpus(
  'e5555555-5555-4555-8555-555555555553',
  'd4444444-4444-4444-8444-444444444442',
  'http://127.0.0.1:55321/storage/v1/object/public/covers/u/a1111111-1111-4111-8111-111111111111/e5555555-5555-4555-8555-555555555553/admintwo.webp'
);
reset role;
select is(
  (
    select concat_ws('|', cover_url, jsonb_array_length(cover_options))
    from public.works where id = 'd4444444-4444-4444-8444-444444444442'
  ),
  'http://127.0.0.1:55321/storage/v1/object/public/covers/u/a1111111-1111-4111-8111-111111111111/e5555555-5555-4555-8555-555555555552/adminone.webp|2',
  'a later reviewed option is additive and does not replace the established default'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated","iss":"http://127.0.0.1:55321/auth/v1"}',
  true
);
select public.edit_corpus_work_metadata(
  'd4444444-4444-4444-8444-444444444442',
  null, null, null, null, null, null, '{}', '{}',
  'http://127.0.0.1:55321/storage/v1/object/public/covers/u/a1111111-1111-4111-8111-111111111111/e5555555-5555-4555-8555-555555555552/adminone.webp',
  (
    select jsonb_agg(option order by ordinality desc)
    from public.works work
    cross join lateral jsonb_array_elements(work.cover_options) with ordinality options(option, ordinality)
    where work.id = 'd4444444-4444-4444-8444-444444444442'
      and ordinality = 2
  ),
  null, null, null
);
reset role;
select is(
  (
    select string_agg(option ->> 'url', '|' order by ordinality)
    from public.works work
    cross join lateral jsonb_array_elements(work.cover_options)
      with ordinality options(option, ordinality)
    where work.id = 'd4444444-4444-4444-8444-444444444442'
  ),
  'http://127.0.0.1:55321/storage/v1/object/public/covers/u/a1111111-1111-4111-8111-111111111111/e5555555-5555-4555-8555-555555555553/admintwo.webp|http://127.0.0.1:55321/storage/v1/object/public/covers/u/a1111111-1111-4111-8111-111111111111/e5555555-5555-4555-8555-555555555552/adminone.webp',
  'a stale authorized reorder keeps its submitted order and appends the omitted accepted option'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"b2222222-2222-4222-8222-222222222222","role":"authenticated","iss":"http://127.0.0.1:55321/auth/v1"}',
  true
);
select throws_ok(
  $$select public.admin_review_personal_cover_for_corpus(
    'e5555555-5555-4555-8555-555555555551',
    'd4444444-4444-4444-8444-444444444441',
    'https://books.google.com/books/content?id=trusted'
  )$$,
  '42501',
  'corpus administrator required',
  'an ordinary reader cannot review their own cover for the corpus'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated","iss":"http://127.0.0.1:55321/auth/v1"}',
  true
);
select throws_ok(
  $$select public.admin_review_personal_cover_for_corpus(
    'e5555555-5555-4555-8555-555555555551',
    'd4444444-4444-4444-8444-444444444441',
    'https://books.google.com/books/content?id=trusted'
  )$$,
  'P0002',
  'active personal book not found',
  'an administrator cannot publish another reader''s personal cover'
);

insert into public.books (
  id, owner_id, corpus_work_id, title, authors_display, ownership,
  cover_url, cover_source
) values (
  'e5555555-5555-4555-8555-555555555554',
  'a1111111-1111-4111-8111-111111111111',
  'd4444444-4444-4444-8444-444444444443',
  'Unsafe Administrator Cover',
  'Writer Three',
  'owned',
  'https://attacker.example/not-ingested.jpg',
  'url'
);
select throws_ok(
  $$select public.admin_review_personal_cover_for_corpus(
    'e5555555-5555-4555-8555-555555555554',
    'd4444444-4444-4444-8444-444444444443',
    'https://attacker.example/not-ingested.jpg'
  )$$,
  '22023',
  'personal cover must use the reviewed cover-ingestion boundary',
  'administrator review cannot approve an arbitrary remote URL'
);
reset role;
select is(
  (
    select concat_ws('|', coalesce(cover_url, ''), jsonb_array_length(cover_options))
    from public.works where id = 'd4444444-4444-4444-8444-444444444443'
  ),
  '|0',
  'a refused remote URL leaves the corpus unchanged'
);

select ok(
  not has_function_privilege(
    'anon', 'public.admin_review_household_cover_for_corpus(uuid,uuid,uuid,text)', 'EXECUTE'
  )
  and has_function_privilege(
    'authenticated', 'public.admin_review_household_cover_for_corpus(uuid,uuid,uuid,text)', 'EXECUTE'
  )
  and not has_function_privilege(
    'service_role', 'public.admin_review_household_cover_for_corpus(uuid,uuid,uuid,text)', 'EXECUTE'
  ),
  'only authenticated callers can reach the exact household-cover review boundary'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"b2222222-2222-4222-8222-222222222222","role":"authenticated","iss":"http://127.0.0.1:55321/auth/v1"}',
  true
);
select throws_ok(
  $$select public.admin_review_household_cover_for_corpus(
    'c3333333-3333-4333-8333-333333333333',
    'e5555555-5555-4555-8555-555555555551',
    'd4444444-4444-4444-8444-444444444441',
    'https://books.google.com/books/content?id=trusted'
  )$$,
  '42501',
  'corpus administrator required',
  'an ordinary household member cannot review their cover for the corpus'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated","iss":"http://127.0.0.1:55321/auth/v1"}',
  true
);
select is(
  public.admin_review_household_cover_for_corpus(
    'c3333333-3333-4333-8333-333333333333',
    'e5555555-5555-4555-8555-555555555551',
    'd4444444-4444-4444-8444-444444444441',
    'https://books.google.com/books/content?id=trusted'
  )::text,
  'd4444444-4444-4444-8444-444444444441',
  'an administrator can review the exact safe cover displayed from a household peer'
);
reset role;
select is(
  (select cover_url from public.works where id = 'd4444444-4444-4444-8444-444444444441'),
  'https://books.google.com/books/content?id=trusted',
  'the first reviewed household cover fills the missing corpus default'
);
select ok(
  exists (
    select 1
    from public.works work
    cross join lateral jsonb_array_elements(work.cover_options) option
    where work.id = 'd4444444-4444-4444-8444-444444444441'
      and option ->> 'url' = 'https://books.google.com/books/content?id=trusted'
  ),
  'the reviewed household cover becomes an accepted corpus option'
);
select is(
  (
    select count(*)::int from public.work_metadata_edits
    where work_id = 'd4444444-4444-4444-8444-444444444441'
      and editor_id = 'a1111111-1111-4111-8111-111111111111'
  ),
  1,
  'the household-cover review is audited as the administrator action'
);

insert into public.households (id, name)
values ('c3333333-3333-4333-8333-333333333334', 'Unrelated household');
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated","iss":"http://127.0.0.1:55321/auth/v1"}',
  true
);
select throws_ok(
  $$select public.admin_review_household_cover_for_corpus(
    'c3333333-3333-4333-8333-333333333334',
    'e5555555-5555-4555-8555-555555555551',
    'd4444444-4444-4444-8444-444444444441',
    'https://books.google.com/books/content?id=trusted'
  )$$,
  'PT409',
  'household cover is no longer available for review; refresh and try again',
  'administrator status does not expose a copy from an unrelated household'
);
reset role;

insert into public.works (
  id, work_key, title, author_text, contributors, cover_url
) values
  (
    'd4444444-4444-4444-8444-444444444444',
    public.library_work_key('Established Household Cover', 'Writer Four'),
    'Established Household Cover', 'Writer Four',
    '[{"name":"Writer Four","role":"author","position":0}]'::jsonb,
    'https://books.google.com/books/content?id=established'
  ),
  (
    'd4444444-4444-4444-8444-444444444445',
    public.library_work_key('Recoverable Household Cover', 'Writer Five'),
    'Recoverable Household Cover', 'Writer Five',
    '[{"name":"Writer Five","role":"author","position":0}]'::jsonb,
    null
  );
insert into public.books (
  id, owner_id, corpus_work_id, title, authors_display, ownership, cover_url, cover_source
) values
  (
    'e5555555-5555-4555-8555-555555555555',
    'b2222222-2222-4222-8222-222222222222',
    'd4444444-4444-4444-8444-444444444444',
    'Established Household Cover', 'Writer Four', 'owned',
    'https://books.google.com/books/content?id=alternate', 'google'
  ),
  (
    'e5555555-5555-4555-8555-555555555556',
    'b2222222-2222-4222-8222-222222222222',
    'd4444444-4444-4444-8444-444444444445',
    'Recoverable Household Cover', 'Writer Five', 'owned',
    'https://books.google.com/books/content?id=recoverable', 'google'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated","iss":"http://127.0.0.1:55321/auth/v1"}',
  true
);
select public.admin_review_household_cover_for_corpus(
  'c3333333-3333-4333-8333-333333333333',
  'e5555555-5555-4555-8555-555555555555',
  'd4444444-4444-4444-8444-444444444444',
  'https://books.google.com/books/content?id=alternate'
);
reset role;
select is(
  (select cover_url from public.works where id = 'd4444444-4444-4444-8444-444444444444'),
  'https://books.google.com/books/content?id=established',
  'a reviewed household option does not replace an established corpus default'
);
select ok(
  exists (
    select 1
    from public.works work
    cross join lateral jsonb_array_elements(work.cover_options) option
    where work.id = 'd4444444-4444-4444-8444-444444444444'
      and option ->> 'url' = 'https://books.google.com/books/content?id=alternate'
  ),
  'the later household cover remains available as an additive option'
);

update public.books
set removed_at = now()
where owner_id = 'a1111111-1111-4111-8111-111111111111' and removed_at is null;
select is(
  (
    select count(*)::int from public.books
    where owner_id = 'a1111111-1111-4111-8111-111111111111' and removed_at is null
  ),
  0,
  'the recovery fixture administrator has no active personal books'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated","iss":"http://127.0.0.1:55321/auth/v1"}',
  true
);
select is(
  public.admin_recover_personal_corpus_covers() ->> 'recoveredCovers',
  '1',
  'bulk recovery fills one missing corpus cover from the administrator household library'
);
reset role;
select is(
  (select cover_url from public.works where id = 'd4444444-4444-4444-8444-444444444445'),
  'https://books.google.com/books/content?id=recoverable',
  'the administrator with no personal books recovers the peer household cover'
);

select * from finish();
rollback;
