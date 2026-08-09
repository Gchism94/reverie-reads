-- series-integrity schema guards — Phase 1 of feat/series-integrity-mechanism
-- (20260813010000_series_integrity_schema.sql).
--
-- WHY THIS TEST. The migration adds two guards: `series_entries_position_uidx`, a partial
-- unique index making (series_id, position) unique among LIVE entries only, and
-- `series.length` with check (length >= 1). Each assertion here targets the real
-- constraint firing — the collision must surface as SQLSTATE 23505 (unique_violation)
-- and the length boundary as 23514 (check_violation), not as any body-level or mocked
-- approximation. The tombstone case asserts the partial predicate specifically: a
-- removed_at row at the same position must NOT collide, and after reuse BOTH rows exist
-- at that position (proving the predicate excluded the tombstone, not that the tombstone
-- was replaced).
--
-- Role shape per the standing testing rules: writes run as `authenticated` (the real
-- client role, RLS active — the path production writers take), value assertions run
-- after `reset role` so RLS can never hide a row and collapse `is(x, expected)` into a
-- two-NULLs false positive; where NULL is the expected value, `ok(x is null)` is used so
-- a missing row fails loudly instead of comparing NULL = NULL.

begin;
select plan(14);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('99999999-1111-2222-3333-444444444444', 'authenticated', 'authenticated',
        'series-integrity@example.com', '{}'::jsonb, '{}'::jsonb, now(), now());

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"99999999-1111-2222-3333-444444444444","role":"authenticated"}', true);

-- ── Fixture: one series, one real book ──────────────────────────────────────────────────
insert into public.series (id, owner_id, name)
values ('aaaa1111-0000-0000-0000-000000000001', '99999999-1111-2222-3333-444444444444', 'Integrity Saga');

insert into public.books (id, owner_id, title)
values ('bbbb2222-0000-0000-0000-000000000001', '99999999-1111-2222-3333-444444444444', 'Book One');

-- ── series_entries_position_uidx ────────────────────────────────────────────────────────
select lives_ok(
  $$insert into public.series_entries (id, series_id, owner_id, position, title, author, book_id)
    values ('cccc3333-0000-0000-0000-000000000001', 'aaaa1111-0000-0000-0000-000000000001',
            '99999999-1111-2222-3333-444444444444', 1, '', '', 'bbbb2222-0000-0000-0000-000000000001')$$,
  'linked entry takes position 1');

select lives_ok(
  $$insert into public.series_entries (id, series_id, owner_id, position, title, author)
    values ('cccc3333-0000-0000-0000-000000000002', 'aaaa1111-0000-0000-0000-000000000001',
            '99999999-1111-2222-3333-444444444444', 2, 'Ghost Two', 'A. Uthor')$$,
  'ghost entry takes position 2 — distinct positions coexist');

select throws_ok(
  $$insert into public.series_entries (series_id, owner_id, position, title, author)
    values ('aaaa1111-0000-0000-0000-000000000001', '99999999-1111-2222-3333-444444444444',
            1, 'Ghost Collider', 'A. Uthor')$$,
  '23505', null,
  'a ghost colliding with a linked entry at position 1 is rejected as 23505 — the guard is slot-based, ghosts occupy the uniqueness space');

select lives_ok(
  $$insert into public.series_entries (series_id, owner_id, position, title, author)
    values ('aaaa1111-0000-0000-0000-000000000001', '99999999-1111-2222-3333-444444444444',
            3.5, 'Novella', 'A. Uthor')$$,
  'fractional position 3.5 is a first-class slot');

select throws_ok(
  $$insert into public.series_entries (series_id, owner_id, position, title, author)
    values ('aaaa1111-0000-0000-0000-000000000001', '99999999-1111-2222-3333-444444444444',
            3.50, 'Novella Duplicate', 'A. Uthor')$$,
  '23505', null,
  'position 3.50 collides with 3.5 as 23505 — numeric equality ignores scale');

-- ── tombstones do not collide, and reuse keeps both rows ────────────────────────────────
select lives_ok(
  $$update public.series_entries set removed_at = now()
    where id = 'cccc3333-0000-0000-0000-000000000002'$$,
  'tombstoning the position-2 ghost');

select lives_ok(
  $$insert into public.series_entries (series_id, owner_id, position, title, author)
    values ('aaaa1111-0000-0000-0000-000000000001', '99999999-1111-2222-3333-444444444444',
            2, 'Ghost Two Reborn', 'A. Uthor')$$,
  'a new live entry reuses position 2 after the tombstone — removed_at rows are outside the index predicate');

-- ── series.length boundary ──────────────────────────────────────────────────────────────
select throws_ok(
  $$update public.series set length = 0 where id = 'aaaa1111-0000-0000-0000-000000000001'$$,
  '23514', null, 'length 0 rejected as 23514');

select throws_ok(
  $$update public.series set length = -3 where id = 'aaaa1111-0000-0000-0000-000000000001'$$,
  '23514', null, 'length -3 rejected as 23514');

select lives_ok(
  $$update public.series set length = 5 where id = 'aaaa1111-0000-0000-0000-000000000001'$$,
  'length 5 accepted');

-- ── value assertions as an unfiltered role ──────────────────────────────────────────────
reset role;

select is(
  (select count(*)::int from public.series_entries
   where series_id = 'aaaa1111-0000-0000-0000-000000000001' and position = 2),
  2, 'tombstone and its replacement BOTH exist at position 2 — the predicate excluded the tombstone, nothing was replaced');

select is(
  (select length::int from public.series where id = 'aaaa1111-0000-0000-0000-000000000001'),
  5, 'length 5 stored');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"99999999-1111-2222-3333-444444444444","role":"authenticated"}', true);

select lives_ok(
  $$update public.series set length = null where id = 'aaaa1111-0000-0000-0000-000000000001'$$,
  'length null accepted — null means "not set", outside the check');

reset role;

select ok(
  (select length from public.series where id = 'aaaa1111-0000-0000-0000-000000000001') is null,
  'length null stored — ok(x is null), so a missing row fails instead of comparing NULL = NULL');

select * from finish();
rollback;
