-- Phase 7 H1: account deletion. The delete-account Edge Function deletes the auth user; everything
-- owned must disappear via ON DELETE CASCADE and nobody else's data may be touched. This proves the
-- cascade covers EVERY owned table (the function's correctness rests on it) and is owner-isolated.

begin;
select plan(17);

-- Two users; the signup trigger makes a profile for each.
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'a@example.com', '{}', '{"display_name":"A"}', now(), now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'b@example.com', '{}', '{}', now(), now());

-- Seed A across every owned table (as the table owner; this test is about cascade, not RLS).
-- Adaptive state lives on profiles (cascades with the profile).
update public.profiles set adaptive_skin = '{"weights":{}}'::jsonb, skin = 'grimoire' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

insert into public.books (id, owner_id, title, author_first, author_last, series)
  values ('a0000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A book', 'Ada', 'Author', 'A Series');
insert into public.authors (id, owner_id, name, name_key)
  values ('a0000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Ada Author', 'ada author');
insert into public.book_authors (book_id, author_id, owner_id, position, role)
  values ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 0, 'author');
insert into public.reads (book_id, owner_id, read_on) values ('a0000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-01-01');
insert into public.lists (id, owner_id, name, kind) values ('a0000000-0000-0000-0000-0000000000c1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'TBR', 'tbr');
insert into public.list_items (list_id, book_id, owner_id) values ('a0000000-0000-0000-0000-0000000000c1', 'a0000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into public.reviews (reviewer_id, work_key, reviewer_name, rating, body) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'work:a', 'A', 4, 'good');
insert into public.merge_verdicts (owner_id, book_id, incoming_key, verdict) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a0000000-0000-0000-0000-000000000001', 'isbn:1', 'keep_separate');
insert into public.clubs (id, title, unit_type, unit_count, created_by) values ('a0000000-0000-0000-0000-0000000000d1', 'A Club', 'chapter', 30, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into public.club_members (club_id, user_id, progress) values ('a0000000-0000-0000-0000-0000000000d1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 5);
insert into public.club_comments (club_id, user_id, unit, body) values ('a0000000-0000-0000-0000-0000000000d1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 'hi');
insert into public.reading_orders (id, owner_id, name) values ('a0000000-0000-0000-0000-0000000000e1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Order');
insert into public.reading_order_items (reading_order_id, owner_id, position, book_id) values ('a0000000-0000-0000-0000-0000000000e1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1024, 'a0000000-0000-0000-0000-000000000001');
insert into public.shared_refs (owner_id, code, kind) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'code-a', 'list');

-- B keeps a book (and their profile) — must survive A's deletion untouched.
insert into public.books (id, owner_id, title) values ('b0000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B book');

-- ── delete A's auth user → cascade ──
delete from auth.users where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- Every owned table is empty for A.
select is((select count(*)::int from public.profiles where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0, 'profile (+ adaptive state) deleted');
select is((select count(*)::int from public.books where owner_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0, 'books deleted');
select is((select count(*)::int from public.authors where owner_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0, 'authors deleted');
select is((select count(*)::int from public.book_authors where owner_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0, 'book_authors deleted');
select is((select count(*)::int from public.reads where owner_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0, 'reads deleted');
select is((select count(*)::int from public.lists where owner_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0, 'lists deleted');
select is((select count(*)::int from public.list_items where owner_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0, 'list_items deleted');
select is((select count(*)::int from public.reviews where reviewer_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0, 'reviews deleted');
select is((select count(*)::int from public.merge_verdicts where owner_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0, 'merge_verdicts deleted');
select is((select count(*)::int from public.clubs where created_by = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0, 'clubs deleted');
select is((select count(*)::int from public.club_members where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0, 'club_members deleted');
select is((select count(*)::int from public.club_comments where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0, 'club_comments deleted');
select is((select count(*)::int from public.reading_orders where owner_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0, 'reading_orders deleted');
select is((select count(*)::int from public.reading_order_items where owner_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0, 'reading_order_items deleted');
select is((select count(*)::int from public.shared_refs where owner_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0, 'shared_refs deleted');

-- B is untouched.
select is((select count(*)::int from public.books where owner_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 1, 'another user''s books are untouched');
select is((select count(*)::int from public.profiles where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 1, 'another user''s profile is untouched');

select * from finish();
rollback;
