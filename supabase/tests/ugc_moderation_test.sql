-- Phase 7 H3: UGC report + hide. Anyone can report; a hidden review/comment is not served to other
-- users while its author still sees it; reports are private to the reporter.

begin;
select plan(9);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'a@example.com', '{}', '{"display_name":"A"}', now(), now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'b@example.com', '{}', '{"display_name":"B"}', now(), now());

-- Seed as table owner (RLS bypass): B authors a review + a club comment; both A and B are members.
insert into public.reviews (id, work_key, reviewer_id, reviewer_name, rating, body)
  values ('a0000000-0000-0000-0000-000000000001', 'work:x', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B', 5, 'B review');
insert into public.clubs (id, title, unit_type, unit_count, created_by)
  values ('a0000000-0000-0000-0000-000000000002', 'Club', 'chapter', 40, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.club_members (club_id, user_id, progress) values
  ('a0000000-0000-0000-0000-000000000002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 40),
  ('a0000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 5);
insert into public.club_comments (id, club_id, user_id, unit, body)
  values ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1, 'B comment');

-- ── act as A ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);

select lives_ok(
  $$insert into public.content_reports (reporter_id, target_type, target_id, reason)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'review', 'a0000000-0000-0000-0000-000000000001', 'spam')$$,
  'any user can report a review');
select is((select count(*)::int from public.content_reports), 1, 'reporter sees their own report');
select is((select count(*)::int from public.reviews where work_key = 'work:x'), 1, 'A sees the review before it is hidden');
select is((select count(*)::int from public.club_comments where club_id = 'a0000000-0000-0000-0000-000000000002'), 1,
  'A (progress 5) sees B''s comment before it is hidden');

-- ── hide both as their author (B, self-takedown) ──
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select lives_ok($$update public.reviews set hidden = true where id = 'a0000000-0000-0000-0000-000000000001'$$, 'author can hide their review');
update public.club_comments set hidden = true where id = 'a0000000-0000-0000-0000-000000000003';
select is((select count(*)::int from public.reviews where work_key = 'work:x'), 1, 'the author still sees their own hidden review');

-- ── back as A: hidden content is not served ──
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select is((select count(*)::int from public.reviews where work_key = 'work:x'), 0, 'a hidden review is not served to others');
select is((select count(*)::int from public.club_comments where club_id = 'a0000000-0000-0000-0000-000000000002'), 0,
  'a hidden club comment is not served to others');
select is((select count(*)::int from public.content_reports where reporter_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 0,
  'a user cannot read someone else''s reports');

select * from finish();
rollback;
