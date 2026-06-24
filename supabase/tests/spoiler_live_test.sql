-- Realtime spoiler edge (acceptance C): when a comment is posted AHEAD of a reader,
-- their locked-count must be able to update live via a content-free signal, while the
-- gated comment rows themselves never reach them.

begin;
select plan(6);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'alice2@example.com', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bob2@example.com', '{}'::jsonb, '{}'::jsonb, now(), now());

set local role authenticated;

-- Alice creates a club, joins fully read, and posts a comment about chapter 10.
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
insert into public.clubs (id, title, unit_type, unit_count, unit_label, created_by)
  values ('cccccccc-0000-0000-0000-000000000003', 'Fourth Wing', 'chapter', 40, 'Chapter',
          'aaaaaaaa-0000-0000-0000-000000000001');
insert into public.club_members (club_id, user_id, display_name, progress)
  values ('cccccccc-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Alice', 40);

-- Bob joins at progress 0.
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true);
insert into public.club_members (club_id, user_id, display_name, progress)
  values ('cccccccc-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000002', 'Bob', 0);

-- Alice posts AHEAD of Bob (chapter 10).
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
insert into public.club_comments (club_id, user_id, unit, body)
  values ('cccccccc-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 10, 'the twist');

-- ── As Bob (behind, progress 0) ──
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.club_comments where club_id = 'cccccccc-0000-0000-0000-000000000003'),
  0, 'gated comment rows never reach the behind-progress reader (RLS)');

select is(
  (select hidden from public.club_locked_info('cccccccc-0000-0000-0000-000000000003')),
  1, 'locked count updates to reflect the ahead comment (content-free count)');

select is(
  (select next_unit from public.club_locked_info('cccccccc-0000-0000-0000-000000000003')),
  10, 'next-unlock unit is reported');

select is(
  (select count(*)::int from public.clubs where id = 'cccccccc-0000-0000-0000-000000000003'),
  1, 'behind reader can read the club row — the live signal reaches them');

select ok(
  (select last_activity_at from public.clubs where id = 'cccccccc-0000-0000-0000-000000000003')
    > (select created_at from public.clubs where id = 'cccccccc-0000-0000-0000-000000000003'),
  'comment insert bumped clubs.last_activity_at (the content-free Realtime signal)');

-- Advancing Bob's progress reveals exactly the now-eligible comment.
update public.club_members set progress = 10
  where club_id = 'cccccccc-0000-0000-0000-000000000003'
    and user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
select is(
  (select count(*)::int from public.club_comments where club_id = 'cccccccc-0000-0000-0000-000000000003'),
  1, 'advancing progress reveals the now-eligible comment');

select * from finish();
rollback;
