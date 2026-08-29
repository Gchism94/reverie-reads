-- Eligible copy covers reach the household read model, while only a corpus administrator's own
-- reviewed cover becomes an additive corpus candidate.
begin;
select plan(17);

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
    'anon', 'public.promote_admin_personal_cover_to_corpus()', 'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated', 'public.promote_admin_personal_cover_to_corpus()', 'EXECUTE'
  )
  and not has_function_privilege(
    'service_role', 'public.promote_admin_personal_cover_to_corpus()', 'EXECUTE'
  ),
  'the internal promotion trigger has no direct API grant'
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
      and trigger.tgenabled = 'O'
      and not trigger.tgisinternal
  ),
  2,
  'both administrator cover promotion triggers are installed and enabled'
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
  (
    select cover_url from public.works
    where id = 'd4444444-4444-4444-8444-444444444441'
  ),
  null::text,
  'an ordinary member personal cover does not become corpus metadata'
);
select is(
  (
    select cover_url from public.household_library_works()
    where work_id = 'd4444444-4444-4444-8444-444444444441'
  ),
  null::text,
  'the household contract keeps the canonical cover separate from copy fallbacks'
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
  'the eligible personal cover is present in the household copy projection'
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
  'the eligible personal thumbnail is present in the household copy projection'
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
update public.books
set cover_url = 'http://127.0.0.1:55321/storage/v1/object/public/covers/u/a1111111-1111-4111-8111-111111111111/e5555555-5555-4555-8555-555555555552/adminone.webp',
    cover_source = 'upload',
    cover_color = '#abcdef'
where id = 'e5555555-5555-4555-8555-555555555552';
reset role;

select is(
  (
    select cover_url from public.works
    where id = 'd4444444-4444-4444-8444-444444444442'
  ),
  'http://127.0.0.1:55321/storage/v1/object/public/covers/u/a1111111-1111-4111-8111-111111111111/e5555555-5555-4555-8555-555555555552/adminone.webp',
  'the first reviewed administrator cover fills a missing corpus default'
);
select is(
  (
    select concat_ws('|', cover_source, cover_color) from public.works
    where id = 'd4444444-4444-4444-8444-444444444442'
  ),
  'upload|#abcdef',
  'the fill-only default retains its source and color'
);
select is(
  (
    select jsonb_array_length(cover_options) from public.works
    where id = 'd4444444-4444-4444-8444-444444444442'
  ),
  1,
  'the first administrator cover is also a corpus option'
);
select is(
  (
    select count(*)::int from public.work_metadata_edits
    where work_id = 'd4444444-4444-4444-8444-444444444442'
      and editor_id = 'a1111111-1111-4111-8111-111111111111'
  ),
  1,
  'the administrator cover promotion is audited'
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
    select cover_url from public.works
    where id = 'd4444444-4444-4444-8444-444444444442'
  ),
  'http://127.0.0.1:55321/storage/v1/object/public/covers/u/a1111111-1111-4111-8111-111111111111/e5555555-5555-4555-8555-555555555552/adminone.webp',
  'a later administrator option does not replace the established corpus default'
);
select is(
  (
    select jsonb_array_length(cover_options) from public.works
    where id = 'd4444444-4444-4444-8444-444444444442'
  ),
  2,
  'a later administrator personal cover remains available as an option'
);
select is(
  (
    select count(*)::int from public.work_metadata_edits
    where work_id = 'd4444444-4444-4444-8444-444444444442'
      and editor_id = 'a1111111-1111-4111-8111-111111111111'
  ),
  2,
  'each distinct administrator candidate addition is audited once'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated","iss":"http://127.0.0.1:55321/auth/v1"}',
  true
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
reset role;

select is(
  (
    select cover_url from public.works
    where id = 'd4444444-4444-4444-8444-444444444443'
  ),
  null::text,
  'administrator status does not bypass the reviewed cover-ingestion boundary'
);
select is(
  (
    select jsonb_array_length(cover_options) from public.works
    where id = 'd4444444-4444-4444-8444-444444444443'
  ),
  0,
  'an unreviewed administrator URL is not retained as a corpus option'
);

select * from finish();
rollback;
