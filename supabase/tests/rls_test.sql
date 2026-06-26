-- RLS verification (run with `supabase test db`). Proves two things the data model
-- promises: (1) a signed-in user can CRUD only their own books and nothing else, and
-- (2) club comments are spoiler-gated server-side by the reader's progress.

begin;
select plan(13);

-- Two users. The on_auth_user_created trigger should create a profile for each.
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated',
   'alice@example.com', '{}'::jsonb, '{"display_name":"Alice"}'::jsonb, now(), now()),
  ('22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated',
   'bob@example.com', '{}'::jsonb, '{}'::jsonb, now(), now());

select is(
  (select count(*)::int from public.profiles
   where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')),
  2, 'signup trigger created a profile for each new auth user');

-- ---- act as Alice ----
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select lives_ok(
  $$insert into public.books (owner_id, title) values ('11111111-1111-1111-1111-111111111111', 'Alice''s book')$$,
  'Alice can insert a book she owns');

select is((select count(*)::int from public.books), 1, 'Alice sees her own book');

select throws_ok(
  $$insert into public.books (owner_id, title) values ('22222222-2222-2222-2222-222222222222', 'spoofed')$$,
  '42501', null, 'Alice cannot insert a book owned by someone else');

-- ---- act as Bob ----
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

select is((select count(*)::int from public.books), 0, 'Bob cannot see Alice''s books');

-- Bob's update/delete run without error but match no rows (RLS hides Alice's books).
select lives_ok($$update public.books set title = 'hacked'$$, 'Bob''s update touches no rows');
select lives_ok($$delete from public.books$$, 'Bob''s delete touches no rows');

select lives_ok(
  $$insert into public.books (owner_id, title) values ('22222222-2222-2222-2222-222222222222', 'Bob''s book')$$,
  'Bob can insert his own book');

-- Back as Alice: her book is untouched by Bob's attempts.
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select is((select title from public.books), 'Alice''s book',
  'Alice''s book survived Bob''s update and delete');

-- ---- spoiler gate ----
-- Alice creates a club, joins it, and posts comments about chapters 3 and 10.
insert into public.clubs (id, title, unit_type, unit_count, created_by)
  values ('33333333-3333-3333-3333-333333333333', 'Iron Flame', 'chapter', 40,
          '11111111-1111-1111-1111-111111111111');
insert into public.club_members (club_id, user_id, progress)
  values ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 40);
insert into public.club_comments (club_id, user_id, unit, body) values
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 3, 'early take'),
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 10, 'the twist!');

-- Bob joins at progress 0.
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
insert into public.club_members (club_id, user_id, progress)
  values ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 0);

select is(
  (select count(*)::int from public.club_comments
   where club_id = '33333333-3333-3333-3333-333333333333'),
  0, 'at progress 0, Bob sees no spoiler comments');

-- Bob reads up to chapter 5.
update public.club_members set progress = 5
  where club_id = '33333333-3333-3333-3333-333333333333'
    and user_id = '22222222-2222-2222-2222-222222222222';

select is(
  (select count(*)::int from public.club_comments
   where club_id = '33333333-3333-3333-3333-333333333333'),
  1, 'at progress 5, Bob sees the chapter-3 comment but not chapter 10');

-- ---- enrichment_cache is service-role only (reference data, never client-reachable) ----
-- It is granted ONLY to service_role (no grants to authenticated/anon), so a client can't even
-- SELECT it — the Edge Function reaches it via the service role, never the browser.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select throws_ok(
  $$select count(*) from public.enrichment_cache$$,
  '42501', null, 'authenticated client cannot read the enrichment cache (service-role only)');
select throws_ok(
  $$insert into public.enrichment_cache (key, record) values ('ta:hack', '{}'::jsonb)$$,
  '42501', null, 'authenticated client cannot write the enrichment cache');

select * from finish();
rollback;
