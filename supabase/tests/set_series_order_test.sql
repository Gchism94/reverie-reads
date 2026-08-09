-- set_series_order — Phase 2 of feat/series-integrity-mechanism
-- (20260814010000_set_series_order.sql).
--
-- ── WHAT THIS MUST PROVE, AND THE PROXY IT MUST NOT SETTLE FOR ──────────────────────────────────
-- The defect: a multi-row reorder cannot be written under series_entries_position_uidx, because a
-- non-deferrable partial unique index is checked per row as a statement walks them. The tempting
-- proxy guard is "call the RPC with a batch and assert it did not error" — which passes trivially
-- if the index is absent, and would have passed against every broken draft of this function.
--
-- So the swap and renumber assertions below are written to fail if the parking pass is removed:
-- each is a batch whose FINAL state is legal but whose naive intermediate state is not, and the
-- test asserts the stored positions afterwards rather than merely that the call lived. The
-- mutation to check this against is deleting the park UPDATE in the function body — that must turn
-- these green assertions red with 23505, not leave them green.
--
-- NOTE ON ORDERING WITH THE INDEX. This file exercises behaviour that only MATTERS under
-- series_entries_position_uidx (20260816010000), which sorts after the RPC's own migration. Both
-- are applied by the time any test runs, so the assertions here run with the index present — which
-- is the point. If the index migration is ever held back locally, these tests keep passing while
-- proving much less; that is exactly the proxy this header warns about.
--
-- Role shape per the standing testing rules: the RPC is CALLED as `authenticated` (the real client
-- role, and the role its ownership raises are the boundary for), while value assertions run after
-- `reset role` so RLS cannot hide a row and collapse an equality into a two-NULLs false positive.

begin;
select plan(27);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('11111111-aaaa-bbbb-cccc-000000000001', 'authenticated', 'authenticated',
        'sso-owner@example.com', '{}'::jsonb, '{}'::jsonb, now(), now()),
       ('22222222-aaaa-bbbb-cccc-000000000002', 'authenticated', 'authenticated',
        'sso-other@example.com', '{}'::jsonb, '{}'::jsonb, now(), now());

-- ── Fixture, built as an unfiltered role so the setup itself cannot be shaped by RLS ────────────
insert into public.series (id, owner_id, name, length) values
  ('5e100000-0000-0000-0000-000000000001', '11111111-aaaa-bbbb-cccc-000000000001', 'Order Saga', null),
  ('5e100000-0000-0000-0000-000000000002', '22222222-aaaa-bbbb-cccc-000000000002', 'Other Saga', null);

insert into public.books (id, owner_id, title, series, position) values
  ('b0000000-0000-0000-0000-000000000001', '11111111-aaaa-bbbb-cccc-000000000001', 'One',   'Order Saga', 1),
  ('b0000000-0000-0000-0000-000000000002', '11111111-aaaa-bbbb-cccc-000000000001', 'Two',   'Order Saga', 2),
  ('b0000000-0000-0000-0000-000000000003', '11111111-aaaa-bbbb-cccc-000000000001', 'Three', 'Order Saga', 3),
  ('b0000000-0000-0000-0000-000000000009', '22222222-aaaa-bbbb-cccc-000000000002', 'Alien', 'Other Saga', 1),
  -- ANOTHER reader's book filed under the SAME series name. The length sync resolves member books
  -- by name, so without this row the owner-scoping assertion would pass for the wrong reason —
  -- an untouched book proves nothing if its series name never matched in the first place.
  ('b0000000-0000-0000-0000-00000000000a', '22222222-aaaa-bbbb-cccc-000000000002', 'Twin',  'Order Saga', 1);

insert into public.series_entries (id, series_id, owner_id, position, title, author, book_id, user_edited) values
  ('e0000000-0000-0000-0000-000000000001', '5e100000-0000-0000-0000-000000000001',
   '11111111-aaaa-bbbb-cccc-000000000001', 1, 'One', 'A', 'b0000000-0000-0000-0000-000000000001', false),
  ('e0000000-0000-0000-0000-000000000002', '5e100000-0000-0000-0000-000000000001',
   '11111111-aaaa-bbbb-cccc-000000000001', 2, 'Two', 'A', 'b0000000-0000-0000-0000-000000000002', false),
  ('e0000000-0000-0000-0000-000000000003', '5e100000-0000-0000-0000-000000000001',
   '11111111-aaaa-bbbb-cccc-000000000001', 3, 'Three', 'A', 'b0000000-0000-0000-0000-000000000003', false),
  -- A GHOST the reader has arranged. Its user_edited=true is what the source-origin case must honour.
  ('e0000000-0000-0000-0000-000000000004', '5e100000-0000-0000-0000-000000000001',
   '11111111-aaaa-bbbb-cccc-000000000001', 4, 'Ghost Four', 'A', null, true),
  -- A ghost the reader has NOT arranged, held back from every reader-origin batch below so it is
  -- still user_edited=false by the time the source-refresh case needs a movable row.
  ('e0000000-0000-0000-0000-000000000005', '5e100000-0000-0000-0000-000000000001',
   '11111111-aaaa-bbbb-cccc-000000000001', 6, 'Ghost Six', 'A', null, false),
  -- An entry of ANOTHER reader's series, for the cross-owner refusals.
  ('e0000000-0000-0000-0000-000000000009', '5e100000-0000-0000-0000-000000000002',
   '22222222-aaaa-bbbb-cccc-000000000002', 1, 'Alien', 'A', 'b0000000-0000-0000-0000-000000000009', false);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"11111111-aaaa-bbbb-cccc-000000000001","role":"authenticated"}', true);

-- ── 1. THE SWAP. Two live entries exchange positions in ONE call. ───────────────────────────────
--    Naive form fails 23505 (probe A). This is the assertion the parking pass exists for.
select lives_ok(
  $$select public.set_series_order(
      '5e100000-0000-0000-0000-000000000001',
      '[{"entry_id":"e0000000-0000-0000-0000-000000000001","position":2},
        {"entry_id":"e0000000-0000-0000-0000-000000000002","position":1}]'::jsonb)$$,
  'two entries swap positions in one call — the park pass absorbs the intermediate collision');

reset role;

select is((select position::text from public.series_entries where id = 'e0000000-0000-0000-0000-000000000001'),
  '2', 'swap: entry one landed at 2');
select is((select position::text from public.series_entries where id = 'e0000000-0000-0000-0000-000000000002'),
  '1', 'swap: entry two landed at 1');

-- The dual-write closed: books.position moved WITH the entry, in the same transaction, without the
-- caller naming a book id anywhere.
select is((select position::text from public.books where id = 'b0000000-0000-0000-0000-000000000001'),
  '2', 'swap: books.position mirrored for book one — derived from the entry, never passed in');
select is((select position::text from public.books where id = 'b0000000-0000-0000-0000-000000000002'),
  '1', 'swap: books.position mirrored for book two');

-- Nothing was left parked. Parked values land above BOTH the live max and the highest requested
-- target, so a row the final write silently skipped survives at a position no slot ever asked for.
-- Asserting the whole multiset catches that; asserting only the two swapped rows would not.
select is(
  (select string_agg(position::text, ',' order by position)
     from public.series_entries
    where series_id = '5e100000-0000-0000-0000-000000000001' and removed_at is null),
  '1,2,3,4,6', 'the live position multiset is exactly the intended one — no row left at a parked value');

-- ── 2. WHOLE-LIST RENUMBER — useMoveEntry's `updates` branch, probe B's exact shape. ────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"11111111-aaaa-bbbb-cccc-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$select public.set_series_order(
      '5e100000-0000-0000-0000-000000000001',
      '[{"entry_id":"e0000000-0000-0000-0000-000000000003","position":1},
        {"entry_id":"e0000000-0000-0000-0000-000000000002","position":2},
        {"entry_id":"e0000000-0000-0000-0000-000000000001","position":3}]'::jsonb)$$,
  'a three-row rotation lands in one call — probe B fails this without the park pass');

reset role;

select is(
  (select string_agg(position::text, ',' order by position)
     from public.series_entries
    where series_id = '5e100000-0000-0000-0000-000000000001' and removed_at is null),
  '1,2,3,4,6', 'rotation: the live order is clean afterwards, with the untouched ghosts where they were');

select is((select position::text from public.series_entries where id = 'e0000000-0000-0000-0000-000000000003'),
  '1', 'rotation: the entry asked for position 1 is at 1');

-- ── 3. user_edited: a READER gesture claims the row ─────────────────────────────────────────────
select is((select user_edited::text from public.series_entries where id = 'e0000000-0000-0000-0000-000000000003'),
  'true', 'a reader-origin move sets user_edited true');

-- ── 4. user_edited: a SOURCE refresh may NOT move an arranged row ───────────────────────────────
--    Entry four is user_edited and sits at 4. A source batch asking to move it to 9 must leave it
--    at 4 AND report the skip. Asserting the stored position (not merely that the call lived) is
--    what makes this fail if the filter is removed.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"11111111-aaaa-bbbb-cccc-000000000001","role":"authenticated"}', true);

select is(
  (select public.set_series_order(
     '5e100000-0000-0000-0000-000000000001',
     '[{"entry_id":"e0000000-0000-0000-0000-000000000004","position":9}]'::jsonb,
     'source') ->> 'skipped_user_edited'),
  '1', 'a source batch reports the reader-arranged slot it left alone');

-- ...and the same batch shape as a reader gesture DOES move it, so the assertion above cannot be
-- passing because the call is inert.
select lives_ok(
  $$select public.set_series_order(
      '5e100000-0000-0000-0000-000000000001',
      '[{"entry_id":"e0000000-0000-0000-0000-000000000004","position":9}]'::jsonb,
      'reader')$$,
  'the identical batch as a reader gesture is accepted');

reset role;

select is((select position::text from public.series_entries where id = 'e0000000-0000-0000-0000-000000000004'),
  '9', 'the reader gesture moved the row the source refresh could not — the filter is user_edited, not inertness');

-- ── 5. A source refresh may still move an UNTOUCHED row ─────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"11111111-aaaa-bbbb-cccc-000000000001","role":"authenticated"}', true);

select is(
  (select public.set_series_order(
     '5e100000-0000-0000-0000-000000000001',
     '[{"entry_id":"e0000000-0000-0000-0000-000000000005","position":5}]'::jsonb,
     'source') ->> 'moved'),
  '1', 'a source batch moves a row the reader has not arranged');

reset role;
select is((select position::text from public.series_entries where id = 'e0000000-0000-0000-0000-000000000005'),
  '5', 'the un-arranged ghost actually moved — "moved: 1" is not the only witness');
select is((select user_edited::text from public.series_entries where id = 'e0000000-0000-0000-0000-000000000005'),
  'false', 'a source move does NOT stamp user_edited — nothing here can raise the flag but a reader gesture');

-- ── 6. Series length and its synced copies, atomically ──────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"11111111-aaaa-bbbb-cccc-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$select public.set_series_order('5e100000-0000-0000-0000-000000000001', '[]'::jsonb, 'reader',
      '{"length":7}'::jsonb)$$,
  'length 7 written with an empty slot batch');

reset role;

select is((select length::int from public.series where id = '5e100000-0000-0000-0000-000000000001'),
  7, 'series.length is 7 — the canonical home');

select is(
  (select count(*)::int from public.books
    where owner_id = '11111111-aaaa-bbbb-cccc-000000000001' and series = 'Order Saga' and series_count = 7),
  3, 'every member book carries the synced copy — one statement, same transaction');

-- `ok(x is null)`, never `is(x, null)`: is() is null-safe equality, so a row hidden from the
-- querying role returns zero rows, collapses to NULL, and compares equal to the expected NULL —
-- passing identically whether the book was genuinely untouched or simply invisible.
select ok(
  (select series_count from public.books where id = 'b0000000-0000-0000-0000-00000000000a') is null,
  'ANOTHER reader''s book under the SAME series name is untouched — the length sync is owner-scoped');

-- ── 7. Refusals. Each is the ONLY boundary, since security definer bypasses RLS. ────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"11111111-aaaa-bbbb-cccc-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$select public.set_series_order('5e100000-0000-0000-0000-000000000002', '[]'::jsonb)$$,
  'not owner of series',
  'another reader''s series is refused');

-- A live entry that belongs to a DIFFERENT series raises rather than being silently skipped: a
-- write that looks successful and did not happen is the removal-bug shape this repo has paid for.
select throws_ok(
  $$select public.set_series_order(
      '5e100000-0000-0000-0000-000000000001',
      '[{"entry_id":"e0000000-0000-0000-0000-000000000009","position":2}]'::jsonb)$$,
  'set_series_order: a slot does not name a live entry of this series',
  'a foreign entry id RAISES — it is not quietly dropped from the batch');

select throws_ok(
  $$select public.set_series_order(
      '5e100000-0000-0000-0000-000000000001',
      '[{"entry_id":"e0000000-0000-0000-0000-000000000001","position":2},
        {"entry_id":"e0000000-0000-0000-0000-000000000003","position":2}]'::jsonb)$$,
  'set_series_order: two slots claim the same position',
  'two slots claiming one position are named, not left to surface as a bare index violation');

-- Two DIFFERENT positions for one entry collide with nothing, so neither the position-duplicate
-- check nor the index would catch this; without its own guard the last occurrence quietly wins and
-- the call reports success having discarded the other instruction.
select throws_ok(
  $$select public.set_series_order(
      '5e100000-0000-0000-0000-000000000001',
      '[{"entry_id":"e0000000-0000-0000-0000-000000000001","position":11},
        {"entry_id":"e0000000-0000-0000-0000-000000000001","position":12}]'::jsonb)$$,
  'set_series_order: the same entry appears twice in one batch',
  'one entry named twice in a batch RAISES — array order does not get to pick the winner');

-- A slot with no position is REFUSED, not translated. `series_entries.position` is NOT NULL
-- because a live slot always occupies a place in the reading order; deciding where a cleared
-- number belongs is the client's rule, not this function's guess. Asserted on the named raise
-- rather than the column's own 23502, so the refusal cannot silently become a schema accident.
select throws_ok(
  $$select public.set_series_order(
      '5e100000-0000-0000-0000-000000000001',
      '[{"entry_id":"e0000000-0000-0000-0000-000000000001"}]'::jsonb)$$,
  'set_series_order: a slot has no position — a live slot always occupies a place in the order',
  'a slot OMITTING position is refused by name — an entry cannot be live and nowhere in the order');

-- ...and an explicit jsonb null too. `->>` flattens both shapes to SQL NULL, so one assertion
-- would leave the other's behaviour merely assumed — and they are different payloads a client
-- can genuinely send (an absent key vs. a serialized `position: null`).
select throws_ok(
  $$select public.set_series_order(
      '5e100000-0000-0000-0000-000000000001',
      '[{"entry_id":"e0000000-0000-0000-0000-000000000001","position":null}]'::jsonb)$$,
  'set_series_order: a slot has no position — a live slot always occupies a place in the order',
  'an explicit null position is refused the same way');

-- ── 8. The grant layer, asserted as 42501 SPECIFICALLY ──────────────────────────────────────────
-- CLAUDE.md is explicit about the shape of this one: a P0001 here would mean PUBLIC (or a
-- platform-issued named grant) regained EXECUTE and the call reached the body's ownership raise
-- anyway — the exact silent regression the assertion exists to catch. Matching the message would
-- accept that regression as a pass.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$select public.set_series_order('5e100000-0000-0000-0000-000000000001', '[]'::jsonb)$$,
  '42501', null,
  'anon is refused at the GRANT layer (42501), not by the body reaching its ownership raise');

reset role;

select * from finish();
rollback;
