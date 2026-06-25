-- RLS verification for the Phase-5 personalization tables (run with `supabase test db`):
-- merge_verdicts (remembered duplicate decisions) and the default-store columns on profiles
-- must be owner-scoped — user B can never read or alter user A's verdicts or chosen store.

begin;
select plan(10);

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

-- ---- act as Alice: she has a book, a default store, and a remembered verdict ----
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

insert into public.books (id, owner_id, title)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Alice''s book');

select lives_ok(
  $$update public.profiles set default_store_id = 's1', default_store_name = 'Powell''s',
       default_store_website = 'https://powells.com'
     where id = '11111111-1111-1111-1111-111111111111'$$,
  'Alice can set her own default store');

select lives_ok(
  $$insert into public.merge_verdicts (owner_id, book_id, incoming_key, verdict)
    values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001',
            'isbn:9780000000001', 'keep_separate')$$,
  'Alice can record a verdict she owns');

select is((select count(*)::int from public.merge_verdicts), 1, 'Alice sees her own verdict');

select throws_ok(
  $$insert into public.merge_verdicts (owner_id, book_id, incoming_key, verdict)
    values ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000001', 'k', 'always_merge')$$,
  '42501', null, 'Alice cannot record a verdict owned by someone else');

-- ---- act as Bob ----
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

select is((select count(*)::int from public.merge_verdicts), 0, 'Bob cannot see Alice''s verdicts');

select is(
  (select count(*)::int from public.profiles where default_store_id is not null),
  0, 'Bob cannot read Alice''s default store');

select lives_ok($$update public.merge_verdicts set verdict = 'always_merge'$$,
  'Bob''s verdict update touches no rows (RLS hides Alice''s)');

-- ---- back as Alice: her data is untouched ----
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select is((select default_store_name from public.profiles), 'Powell''s',
  'Alice''s default store survived Bob''s attempts');
select is((select verdict from public.merge_verdicts), 'keep_separate',
  'Alice''s verdict survived Bob''s update');

select * from finish();
rollback;
