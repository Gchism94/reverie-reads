-- D2: ordered, multi-contributor authorship. Proves (1) authors + book_authors are owner-scoped
-- (RLS), (2) set_book_contributors stores an ordered, role-tagged list and refreshes the
-- denormalized primary + byline, (3) merge_books reconciles contributor lists, and (4) the backfill
-- is idempotent.

begin;
select plan(10);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated',
   'alice@example.com', '{}'::jsonb, '{"display_name":"Alice"}'::jsonb, now(), now()),
  ('22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated',
   'bob@example.com', '{}'::jsonb, '{}'::jsonb, now(), now());

-- ---- act as Alice ----
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

insert into public.books (id, owner_id, title, author_first, author_last)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
          'Drive Your Plow', 'Olga', 'Tokarczuk');

-- set_book_contributors stores an author + a translator, in order.
select lives_ok(
  $$select public.set_book_contributors(
      'aaaaaaaa-0000-0000-0000-000000000001',
      '[{"name":"Olga Tokarczuk","role":"author","position":0},
        {"name":"Antonia Lloyd-Jones","role":"translator","position":1}]'::jsonb,
      'Olga', 'Tokarczuk', 'Olga Tokarczuk')$$,
  'Alice can set a book''s contributors');

select is((select count(*)::int from public.book_authors
           where book_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  2, 'both contributors stored');

select is(
  (select a.name from public.book_authors ba join public.authors a on a.id = ba.author_id
   where ba.book_id = 'aaaaaaaa-0000-0000-0000-000000000001' and ba.role = 'translator'),
  'Antonia Lloyd-Jones', 'the translator is stored with its role');

select is((select author_last from public.books where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'Tokarczuk', 'the denormalized primary author is refreshed');

-- Re-setting with the same names dedupes the author rows (no duplicate authors created).
select public.set_book_contributors(
  'aaaaaaaa-0000-0000-0000-000000000001',
  '[{"name":"Olga Tokarczuk","role":"author","position":0}]'::jsonb,
  'Olga', 'Tokarczuk', 'Olga Tokarczuk');
select is((select count(*)::int from public.authors where owner_id = '11111111-1111-1111-1111-111111111111'),
  2, 'authors are deduped by name (no duplicates on re-set)');

-- ---- merge reconciles contributor lists ----
insert into public.books (id, owner_id, title)
  values ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Plow (dup)');
select public.set_book_contributors(
  'aaaaaaaa-0000-0000-0000-000000000002',
  '[{"name":"Olga Tokarczuk","role":"author","position":0},
    {"name":"Jennifer Croft","role":"translator","position":1}]'::jsonb,
  'Olga', 'Tokarczuk', 'Olga Tokarczuk');

-- Put the translator back on book 1 so the merge has something to union.
select public.set_book_contributors(
  'aaaaaaaa-0000-0000-0000-000000000001',
  '[{"name":"Olga Tokarczuk","role":"author","position":0},
    {"name":"Antonia Lloyd-Jones","role":"translator","position":1}]'::jsonb,
  'Olga', 'Tokarczuk', 'Olga Tokarczuk');

select lives_ok(
  $$select public.merge_books('aaaaaaaa-0000-0000-0000-000000000001',
                              'aaaaaaaa-0000-0000-0000-000000000002', '{}'::jsonb)$$,
  'Alice can merge the duplicate');

select is(
  (select count(*)::int from public.book_authors where book_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  3, 'merge unioned contributors (author + both translators), deduping the shared author');

-- ---- backfill idempotency: a second pass adds nothing ----
-- (the original backfill ran in the migration; re-run its author insert and assert no growth)
select set_config('test.a_before', (select count(*)::text from public.authors), false);
insert into public.authors (owner_id, name, name_key)
select b.owner_id, btrim(coalesce(b.author_first, '') || ' ' || coalesce(b.author_last, '')),
       lower(btrim(regexp_replace(btrim(coalesce(b.author_first, '') || ' ' || coalesce(b.author_last, '')), '\s+', ' ', 'g')))
from public.books b
where btrim(coalesce(b.author_first, '') || ' ' || coalesce(b.author_last, '')) <> ''
on conflict (owner_id, name_key) do nothing;
select is((select count(*)::int from public.authors), current_setting('test.a_before')::int,
  'backfill is idempotent (a second author insert adds 0 rows)');

-- ---- RLS: Bob can't see or write Alice's contributors ----
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select is((select count(*)::int from public.authors), 0, 'Bob cannot see Alice''s authors');
select is((select count(*)::int from public.book_authors), 0, 'Bob cannot see Alice''s book_authors');

select * from finish();
rollback;
