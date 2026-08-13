-- merge_books derives books.position / books.series_count instead of merging them.
-- Phase 2 of feat/series-integrity-mechanism (20260815010000_merge_books_derive_series.sql).
--
-- ── WHAT THIS MUST PROVE, AND THE PROXY IT MUST NOT SETTLE FOR ──────────────────────────────────
-- Before this change, step 4 wrote both columns from `p_fields`. After it, the surviving series
-- entry is the authority and p_fields is only a fallback for books with no live entry.
--
-- The proxy to avoid: merging with an EMPTY p_fields and asserting the result matches the entry.
-- That passes identically under the old body (which would coalesce to the primary's existing
-- value) and the new one, certifying nothing. So every assertion below hands merge_books a
-- p_fields that DISAGREES with the entry, and asserts the entry won. Under the old body those
-- assertions read the p_fields value and fail.
--
-- The whole point of the owner's option (a) ruling is that "synced copy" is a true claim rather
-- than an aspirational one, so the discriminating case is precisely the disagreement.
--
-- Role shape per the standing testing rules: merge runs as `authenticated` (its ownership raises
-- are the boundary), assertions after `reset role` so RLS cannot hide a row and collapse an
-- equality into a two-NULLs false positive.

begin;
select plan(8);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('3a3a3a3a-0000-0000-0000-00000000000d', 'authenticated', 'authenticated',
        'merge-derive@example.com', '{}'::jsonb, '{}'::jsonb, now(), now());

-- ── Fixture ─────────────────────────────────────────────────────────────────────────────────────
--   Series X carries a length; Series Y deliberately does not, so the series_count fallback has a
--   case of its own. Pair 3 has no series entry at all — the 366-of-437 unreconciled shape.
insert into public.series (id, owner_id, name, length) values
  ('d5000000-0000-0000-0000-000000000001', '3a3a3a3a-0000-0000-0000-00000000000d', 'Series X', 9),
  ('d5000000-0000-0000-0000-000000000002', '3a3a3a3a-0000-0000-0000-00000000000d', 'Series Y', null);

insert into public.books (id, owner_id, title, series, position, series_count) values
  -- Pair 1 — primary HAS a live entry in Series X (which has a length).
  ('da000000-0000-0000-0000-000000000001', '3a3a3a3a-0000-0000-0000-00000000000d', 'P1', 'Series X', 3, 9),
  ('da000000-0000-0000-0000-000000000002', '3a3a3a3a-0000-0000-0000-00000000000d', 'L1', 'Series X', 99, 42),
  -- Pair 2 — primary HAS a live entry in Series Y (no length): series_count must fall back.
  ('da000000-0000-0000-0000-000000000003', '3a3a3a3a-0000-0000-0000-00000000000d', 'P2', 'Series Y', 2, null),
  ('da000000-0000-0000-0000-000000000004', '3a3a3a3a-0000-0000-0000-00000000000d', 'L2', 'Series Y', 88, 11),
  -- Pair 3 — NO series entry anywhere: the unreconciled-claim shape, where p_fields still fills.
  ('da000000-0000-0000-0000-000000000005', '3a3a3a3a-0000-0000-0000-00000000000d', 'P3', null, null, null),
  ('da000000-0000-0000-0000-000000000006', '3a3a3a3a-0000-0000-0000-00000000000d', 'L3', null, 7, 5);

insert into public.series_entries (id, series_id, owner_id, position, title, author, book_id, user_edited) values
  ('de000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001',
   '3a3a3a3a-0000-0000-0000-00000000000d', 3, 'P1', 'A', 'da000000-0000-0000-0000-000000000001', false),
  ('de000000-0000-0000-0000-000000000002', 'd5000000-0000-0000-0000-000000000002',
   '3a3a3a3a-0000-0000-0000-00000000000d', 2, 'P2', 'A', 'da000000-0000-0000-0000-000000000003', false);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"3a3a3a3a-0000-0000-0000-00000000000d","role":"authenticated"}', true);

-- ── 1. Entry present: p_fields is OVERRULED by the surviving entry ──────────────────────────────
select lives_ok(
  $$select public.merge_books(
      'da000000-0000-0000-0000-000000000001',
      'da000000-0000-0000-0000-000000000002',
      '{"position":99,"series_count":42}'::jsonb)$$,
  'a merge carrying a position/series_count that disagree with the entry succeeds');

reset role;

select is(
  (select position::text from public.books where id = 'da000000-0000-0000-0000-000000000001'),
  '3', 'books.position came from the surviving entry (3), NOT from p_fields (99)');

select is(
  (select series_count::int from public.books where id = 'da000000-0000-0000-0000-000000000001'),
  9, 'books.series_count came from series.length (9), NOT from p_fields (42)');

-- ── 2. Entry present, series has no length: position still derived, count falls back ────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"3a3a3a3a-0000-0000-0000-00000000000d","role":"authenticated"}', true);

select lives_ok(
  $$select public.merge_books(
      'da000000-0000-0000-0000-000000000003',
      'da000000-0000-0000-0000-000000000004',
      '{"position":88,"series_count":11}'::jsonb)$$,
  'a merge into a series with no length succeeds');

reset role;

select is(
  (select position::text from public.books where id = 'da000000-0000-0000-0000-000000000003'),
  '2', 'position still derived from the entry (2), not p_fields (88) — length being unset does not weaken the position rule');

select is(
  (select series_count::int from public.books where id = 'da000000-0000-0000-0000-000000000003'),
  11, 'series_count falls back to p_fields (11) when series.length is unset — the fallback is live, not dead code');

-- ── 3. No entry at all: the unreconciled-claim path keeps merging as before ─────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"3a3a3a3a-0000-0000-0000-00000000000d","role":"authenticated"}', true);

select lives_ok(
  $$select public.merge_books(
      'da000000-0000-0000-0000-000000000005',
      'da000000-0000-0000-0000-000000000006',
      '{"position":7,"series_count":5}'::jsonb)$$,
  'a merge of two books with no series entry succeeds');

reset role;

select is(
  (select position::text || '/' || series_count::text
     from public.books where id = 'da000000-0000-0000-0000-000000000005'),
  '7/5',
  'with no live entry, p_fields still fills both columns — a position with no entry behind it is an unreconciled claim, not a copy of anything');

select * from finish();
rollback;
