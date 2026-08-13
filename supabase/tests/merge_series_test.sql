-- merge_series — PR 2 of docs/tasks/task-series-consolidation.md (20260820010000_merge_series.sql),
-- and the decision table it writes into (20260819010000_series_merge_decisions.sql).
--
-- ── WHAT THIS MUST PROVE, AND THE PROXY IT MUST NOT SETTLE FOR ──────────────────────────────────
-- "The merge lived and the loser is gone" is the proxy every draft of this would pass, including one
-- that silently drops cargo. Every assertion below reads the SURVIVING record's actual contents —
-- which entry, which position, whose book — not just that the call returned without error. Per the
-- task doc: "a test proving a merge preserves ghosts, tombstones, and positions — asserting the
-- surviving record's contents, not that the call returned ok."
--
-- ── The position-collision fixture is not incidental — it is the mutant this file exists to kill ──
-- Reviewed before this ever ran: a loser entry's ORIGINAL position can read as free against the
-- PRIMARY's live positions and still collide with a value an EARLIER loser entry in the same batch
-- was just bumped to (bumped values climb monotonically above the running max; a later entry's
-- untouched original value can sit anywhere above that max too). The fixture below is built exactly
-- to expose that: primary occupies 1/2/3; the loser carries entries at original positions 2, 4, and
-- 10, in that order. Entry-at-2 collides with primary's 2 and bumps to 4. Entry-at-4, checked ONLY
-- against the primary's original 1/2/3, would read as free and keep 4 — landing on the value the
-- previous entry was just bumped to, a real collision the naive check misses. The mutation to check
-- this against is dropping the `merge_series_position_plan` half of the collision `exists` clause in
-- the function body — that must turn assertion 6 below false (or 23505, if the position index is
-- deployed in this run), not leave it green.
--
-- ── Role shape, per the standing testing rules ──────────────────────────────────────────────────
-- RPCs called as `authenticated` (the real client role and the role its ownership raises are the
-- boundary for); value assertions run after `reset role` so RLS cannot hide a row and collapse an
-- equality into a two-NULLs false positive. Wherever NULL is the desired outcome, `ok(x is null)` is
-- used over a derived boolean rather than `is(x, null)`, for the same reason.

begin;
select plan(34);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('a1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
        'merge-series-owner@example.com', '{}'::jsonb, '{}'::jsonb, now(), now()),
       ('a1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
        'merge-series-other@example.com', '{}'::jsonb, '{}'::jsonb, now(), now());

-- ── Fixture ─────────────────────────────────────────────────────────────────────────────────────
-- Primary (survivor) — "A Court of Thorns and Roses"-shaped: three live entries at 1/2/3, length 5,
-- one already-owned book at position 1 carrying series_count 5 (proves the sync is idempotent, not
-- just additive).
insert into public.series (id, owner_id, name, length) values
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
   'A Court of Thorns and Roses', 5),
  ('a2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'ACOTAR', null),
  -- Another reader's series under a name that WOULD collide if owner-scoping were dropped.
  ('a2000000-0000-0000-0000-000000000009', 'a1000000-0000-0000-0000-000000000002', 'Other Reader Saga', null);

insert into public.books (id, owner_id, title, series, position, series_count) values
  ('a3000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
   'Book One', 'A Court of Thorns and Roses', 1, 5),
  ('a3000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001',
   'Book Two', 'A Court of Thorns and Roses', 2, 5),
  ('a3000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001',
   'Book Four (at 2, collides)', 'ACOTAR', 2, null),
  ('a3000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000001',
   'Book Five (at 4, would-also-collide)', 'ACOTAR', 4, null),
  ('a3000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000001',
   'Book Six (at 10, clean)', 'ACOTAR', 10, null),
  -- Redundant-book case: this book already has a LIVE entry in the primary (id 7 below) AND the
  -- loser links it too (id 8 below) — the same-book-two-series-rows shape.
  ('a3000000-0000-0000-0000-000000000007', 'a1000000-0000-0000-0000-000000000001',
   'Redundant Book', 'A Court of Thorns and Roses', 3, 5),
  -- Carries the LOSER's name string with NO series_entries row at all — proves the rename reaches
  -- books.series independent of entry membership, closing defect #2's fragmentation, not just the
  -- entries.
  ('a3000000-0000-0000-0000-000000000008', 'a1000000-0000-0000-0000-000000000001',
   'Bare-string Book', 'ACOTAR', null, null),
  -- ANOTHER reader's book under the SAME loser name string — the rename and the length sync must
  -- both be owner-scoped, the same shape set_series_order_test.sql proves for the length sync alone.
  ('a3000000-0000-0000-0000-000000000009', 'a1000000-0000-0000-0000-000000000002',
   'Other Reader Book', 'ACOTAR', 1, null);

insert into public.series_entries
  (id, series_id, owner_id, position, title, author, book_id, user_edited, removed_at) values
  -- Primary's own three live entries.
  ('a4000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001', 1, 'Book One', 'A', 'a3000000-0000-0000-0000-000000000001',
   false, null),
  ('a4000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001', 2, 'Book Two', 'A', 'a3000000-0000-0000-0000-000000000002',
   false, null),
  ('a4000000-0000-0000-0000-000000000007', 'a2000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001', 3, 'Redundant Book', 'A', 'a3000000-0000-0000-0000-000000000007',
   false, null),
  -- Loser's live entries — the collision fixture, in original-position order 2, 4, 10.
  ('a4000000-0000-0000-0000-000000000004', 'a2000000-0000-0000-0000-000000000002',
   'a1000000-0000-0000-0000-000000000001', 2, 'Book Four (at 2, collides)', 'A',
   'a3000000-0000-0000-0000-000000000004', false, null),
  ('a4000000-0000-0000-0000-000000000005', 'a2000000-0000-0000-0000-000000000002',
   'a1000000-0000-0000-0000-000000000001', 4, 'Book Five (at 4, would-also-collide)', 'A',
   'a3000000-0000-0000-0000-000000000005', false, null),
  ('a4000000-0000-0000-0000-000000000006', 'a2000000-0000-0000-0000-000000000002',
   'a1000000-0000-0000-0000-000000000001', 10, 'Book Six (at 10, clean)', 'A',
   'a3000000-0000-0000-0000-000000000006', false, null),
  -- A GHOST in the loser, already reader-arranged (user_edited true) — proves ghosts survive the
  -- merge AND that an existing true flag is never lowered by re-parenting.
  ('a4000000-0000-0000-0000-000000000010', 'a2000000-0000-0000-0000-000000000002',
   'a1000000-0000-0000-0000-000000000001', 20, 'Ghost Seven', 'A', null, true, null),
  -- A TOMBSTONE the loser holds — the highest-risk cargo. removed_at set, book_id already null.
  ('a4000000-0000-0000-0000-000000000011', 'a2000000-0000-0000-0000-000000000002',
   'a1000000-0000-0000-0000-000000000001', 99, 'Old Bundle', 'A', null, true, now() - interval '3 days'),
  -- The redundant-book entry: same book_id as primary's entry 7, sitting live in the loser.
  ('a4000000-0000-0000-0000-000000000008', 'a2000000-0000-0000-0000-000000000002',
   'a1000000-0000-0000-0000-000000000001', 1, 'Redundant Book (loser copy)', 'A',
   'a3000000-0000-0000-0000-000000000007', false, null);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

-- ── 1. Refusals, checked BEFORE anything is touched ────────────────────────────────────────────
select throws_ok(
  $$select public.merge_series('a2000000-0000-0000-0000-000000000001',
      'a2000000-0000-0000-0000-000000000001', 'x', 'y')$$,
  'merge_series: cannot merge a series into itself',
  'merging a series into itself is refused by name');

select throws_ok(
  $$select public.merge_series('a2000000-0000-0000-0000-000000000001',
      'a2000000-0000-0000-0000-000000000002', null, 'y')$$,
  'merge_series: name keys must be computed by the caller (seriesNameKey)',
  'a missing name key is refused rather than silently defaulted');

select throws_ok(
  $$select public.merge_series('a2000000-0000-0000-0000-000000000009',
      'a2000000-0000-0000-0000-000000000002', 'x', 'y')$$,
  'not owner of primary series',
  'another reader''s series as primary is refused');

select throws_ok(
  $$select public.merge_series('a2000000-0000-0000-0000-000000000001',
      'a2000000-0000-0000-0000-000000000009', 'x', 'y')$$,
  'not owner of loser series',
  'another reader''s series as loser is refused — cross-owner merge is structurally impossible in one JWT');

-- ── 2. THE MERGE — the key doubles as proof it doesn't matter which order the pair is proposed in.
select lives_ok(
  $$select public.merge_series('a2000000-0000-0000-0000-000000000001',
      'a2000000-0000-0000-0000-000000000002', 'courtofthornsandroses', 'acotar')$$,
  'the merge lives end-to-end: redundant-book tombstone, tombstone re-parent, position plan, rename, length sync, delete, ruling');

reset role;

-- ── 3. The loser row is actually gone — the delete path this task never had. ───────────────────
select is(
  (select count(*)::int from public.series where id = 'a2000000-0000-0000-0000-000000000002'),
  0, 'the loser series row no longer exists');

select is(
  (select count(*)::int from public.series_entries where series_id = 'a2000000-0000-0000-0000-000000000002'),
  0, 'nothing still references the deleted series_id — the cascade had nothing left to destroy');

-- ── 4. TOMBSTONE survives — the highest-risk cargo, re-parented not lost. ───────────────────────
select is(
  (select series_id::text from public.series_entries where id = 'a4000000-0000-0000-0000-000000000011'),
  'a2000000-0000-0000-0000-000000000001', 'the tombstone re-parented onto the survivor');

select ok(
  (select removed_at is not null from public.series_entries where id = 'a4000000-0000-0000-0000-000000000011'),
  'the tombstone is still removed — the merge did not revive it');

-- ── 5. GHOST survives with its own reader-arranged position, untouched by the collision plan. ──
select is(
  (select series_id::text from public.series_entries where id = 'a4000000-0000-0000-0000-000000000010'),
  'a2000000-0000-0000-0000-000000000001', 'the ghost re-parented onto the survivor');

select ok(
  (select book_id is null from public.series_entries where id = 'a4000000-0000-0000-0000-000000000010'),
  'the ghost is still a ghost — no book_id materialized out of nowhere');

select is(
  (select position::text from public.series_entries where id = 'a4000000-0000-0000-0000-000000000010'),
  '20', 'the ghost kept its original position — 20 does not collide with anything the primary holds');

-- ── 6. THE COLLISION FIXTURE — the mutant this file exists to kill. ─────────────────────────────
-- Original loser positions 2, 4, 10 must land at 4, 5, 10 respectively: entry-at-2 bumps to 4
-- (collides with primary's 2); entry-at-4 must ALSO bump, to 5 — not keep 4, which is only free
-- against the PRIMARY's original set and not against what entry-at-2 was just assigned; entry-at-10
-- is genuinely clean and keeps its value.
select is(
  (select position::text from public.series_entries where id = 'a4000000-0000-0000-0000-000000000004'),
  '4', 'entry originally at 2 bumped to 4 — collided with the primary''s live position 2');

select is(
  (select position::text from public.series_entries where id = 'a4000000-0000-0000-0000-000000000005'),
  '5', 'entry originally at 4 bumped to 5, NOT kept at 4 — 4 was just claimed by the previous entry in this same batch, the exact collision the plan-table check exists to catch');

select is(
  (select position::text from public.series_entries where id = 'a4000000-0000-0000-0000-000000000006'),
  '10', 'entry originally at 10 kept its position — genuinely free against the primary and the plan');

-- Sanity on the whole multiset: no duplicate, no gap left at a value nothing claims.
select is(
  (select string_agg(position::text, ',' order by position)
     from public.series_entries
    where series_id = 'a2000000-0000-0000-0000-000000000001' and removed_at is null),
  '1,2,3,4,5,10,20',
  'the survivor''s complete live position multiset after merge — every value distinct, nothing collided');

-- ── 7. user_edited — raised on every re-parented live entry, never lowered on the survivor's own.
select ok(
  (select user_edited = true from public.series_entries where id = 'a4000000-0000-0000-0000-000000000004'),
  're-parented entry (originally false) now carries user_edited = true — the merge is a deliberate owner action');

select ok(
  (select user_edited = true from public.series_entries where id = 'a4000000-0000-0000-0000-000000000010'),
  'the ghost, already user_edited = true before the merge, is still true — never lowered');

select ok(
  (select user_edited = false from public.series_entries where id = 'a4000000-0000-0000-0000-000000000001'),
  'the survivor''s OWN untouched entry keeps user_edited = false — this merge never re-flags rows it did not move');

-- ── 8. REDUNDANT-BOOK collision — the loser's copy tombstones, does not re-parent live. ────────
select ok(
  (select removed_at is not null from public.series_entries where id = 'a4000000-0000-0000-0000-000000000008'),
  'the loser''s redundant entry (same book, already live in the primary) tombstoned rather than colliding on series_entries_book_uidx');

select ok(
  (select book_id is null from public.series_entries where id = 'a4000000-0000-0000-0000-000000000008'),
  'the redundant tombstone''s book_id cleared — remove_series_entry''s exact shape');

select is(
  (select series_id::text from public.series_entries where id = 'a4000000-0000-0000-0000-000000000008'),
  'a2000000-0000-0000-0000-000000000001', 'even tombstoned, the redundant entry re-parents onto the survivor — it does not stay orphaned on the deleted loser id');

select is(
  (select book_id::text from public.series_entries where id = 'a4000000-0000-0000-0000-000000000007'),
  'a3000000-0000-0000-0000-000000000007', 'the PRIMARY''s own entry for that book is untouched — the redundancy check never disturbs the survivor');

-- ── 9. books.series STRING renamed — including the bare-string book with no entry at all. ──────
select is(
  (select series from public.books where id = 'a3000000-0000-0000-0000-000000000008'),
  'A Court of Thorns and Roses',
  'a book carrying the loser''s name with NO series_entries row is still renamed — books.series is independent free text, not just an entry-driven fact');

select is(
  (select count(*)::int from public.books
    where owner_id = 'a1000000-0000-0000-0000-000000000001' and series = 'ACOTAR'),
  0, 'no book of this owner still names the loser after the merge');

-- ── 10. books.series_count synced to the survivor's length — AFTER the rename, so it reaches the
--       books this merge just renamed, not only the ones that already matched.
select is(
  (select series_count::int from public.books where id = 'a3000000-0000-0000-0000-000000000004'),
  5, 'a book renamed onto the survivor by this merge is synced to the survivor''s length');

select is(
  (select series_count::int from public.books where id = 'a3000000-0000-0000-0000-000000000001'),
  5, 'a book that already matched the survivor and already read 5 is untouched (idempotent, not merely additive)');

-- ── 11. Owner-scoping — another reader's book under the identical name string is untouched. ─────
select ok(
  (select series from public.books where id = 'a3000000-0000-0000-0000-000000000009') = 'ACOTAR',
  'ANOTHER reader''s book under the loser''s exact name string is untouched by the rename — owner-scoped');

select ok(
  (select series_count from public.books where id = 'a3000000-0000-0000-0000-000000000009') is null,
  'ANOTHER reader''s book is untouched by the length sync either — same owner-scoping, second write');

-- ── 12. The decision table — the ruling persists, keyed canonically regardless of call order. ──
select is(
  (select ruling from public.series_merge_decisions
    where owner_id = 'a1000000-0000-0000-0000-000000000001'
      and name_key_a = 'acotar' and name_key_b = 'courtofthornsandroses'),
  'same', 'the ruling is stored same, keyed with name_key_a <= name_key_b regardless of which order the call passed them in');

select is(
  (select alias_name from public.series_merge_decisions
    where owner_id = 'a1000000-0000-0000-0000-000000000001'
      and name_key_a = 'acotar' and name_key_b = 'courtofthornsandroses'),
  'ACOTAR', 'the alias recorded is the LOSING name, so it is recognized forever');

-- ── 13. record_series_ruling refuses 'same' outright — merge_series is the only writer of it. ──
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$select public.record_series_ruling('a2000000-0000-0000-0000-000000000001',
      'a2000000-0000-0000-0000-000000000009', 'x', 'y', 'same')$$,
  'record_series_ruling: ruling must be distinct or related_but_separate — same is recorded by merge_series only, never here',
  'record_series_ruling refuses to record same — recording it without a merge would suppress re-proposal of a duplicate that is still live');

reset role;

-- ── 14. The grant layer — both new functions, asserted as 42501 specifically. ────────────────────
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$select public.merge_series('00000000-0000-0000-0000-000000000000',
      '00000000-0000-0000-0000-000000000001', 'x', 'y')$$,
  '42501', null, 'anon refused merge_series at the grant layer, not the body''s ownership raise');

select throws_ok(
  $$select public.record_series_ruling('00000000-0000-0000-0000-000000000000',
      '00000000-0000-0000-0000-000000000001', 'x', 'y', 'distinct')$$,
  '42501', null, 'anon refused record_series_ruling at the grant layer too');

reset role;

select * from finish();
rollback;
