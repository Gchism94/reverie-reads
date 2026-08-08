-- series_entries re-parent on merge — closes a gap in `merge_books`.
--
-- WHY THIS TEST. Before 20260812010000_merge_series_entries_reparent landed, step 6's
-- `delete from public.books where id = p_loser` would, given a loser whose book_id was referenced
-- by series_entries, silently fire the `on delete set null` FK and turn the linked entry into a
-- ghost slot with book_id = NULL — driving /series/<series> via entries whose state suddenly read
-- as "no book" instead of "the merged-away book". The Iron Flame duplicate was the first user-visible
-- instance: the linked entry pointed at the loser, the reader's "I read this" was on the OTHER copy,
-- and merge_books' step 6 was destroying the slot the merger was supposed to preserve. Rule: 1 book
-- → 1 series entry per series (the partial unique `series_entries_book_uidx (series_id, book_id)
-- where book_id is not null`). The fix tombstones redundant entries FIRST, then re-parents the
-- rest, so the partial unique stays valid either way.
--
-- Twelve assertions, asserted as the session role, calls running as authenticated. Same role/play
-- shape as merge_test.sql: lives_ok on the merge → reset role → assertions see the row the very
-- role under test just wrote. Avoids RLS hiding the row that would silently turn `is(x, expected)`
-- into a "two-NULLs compare equal" false positive; wherever null is the desired outcome (a tombstoned
-- entry's book_id NULL'd per `on delete set null`), `ok(x is null)` is used so a hidden row fails
-- loudly.

begin;
select plan(15);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('66666666-7777-8888-9999-aaaaaaaaaaaa', 'authenticated', 'authenticated',
        'merge-series-entry@example.com', '{}'::jsonb, '{}'::jsonb, now(), now());

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"66666666-7777-8888-9999-aaaaaaaaaaaa","role":"authenticated"}', true);

-- ── Fixture ─────────────────────────────────────────────────────────────────────────────────────
--   Series A — primary already has a live linked entry; loser's Series A entry is REDUNDANT
--              by the (series_id, book_id) partial unique and MUST go through the tombstone branch.
--   Series B — only the loser has a Series B entry; this is the headline happy-path re-parent
--              (matches the Iron Flame shape: the loser's slot is the only Empyrean slot in the
--              series-by-book rename, until the partial unique vanishes the re-parent).
-- Same reader owns both book rows — the entire point of a dedupe.
insert into public.series (id, owner_id, name)
values
  ('77777777-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '66666666-7777-8888-9999-aaaaaaaaaaaa', 'Series A'),
  ('77777777-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '66666666-7777-8888-9999-aaaaaaaaaaaa', 'Series B');

insert into public.books (id, owner_id, title)
values
  ('88888888-1111-1111-1111-111111111111', '66666666-7777-8888-9999-aaaaaaaaaaaa', 'Primary'),
  ('88888888-2222-2222-2222-222222222222', '66666666-7777-8888-9999-aaaaaaaaaaaa', 'Loser');

insert into public.series_entries (id, series_id, owner_id, position, title, author, book_id)
values
  ('99999999-aaaa-1111-1111-aaaaaaaaaaaa', '77777777-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '66666666-7777-8888-9999-aaaaaaaaaaaa', 1, 'Primary Slot', 'A Author',
   '88888888-1111-1111-1111-111111111111'),
  ('99999999-aaaa-2222-2222-aaaaaaaaaaaa', '77777777-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '66666666-7777-8888-9999-aaaaaaaaaaaa', 1, 'Loser Slot A', 'A Author',
   '88888888-2222-2222-2222-222222222222'),
  ('99999999-bbbb-1111-1111-bbbbbbbbbbbb', '77777777-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   '66666666-7777-8888-9999-aaaaaaaaaaaa', 1, 'Loser Slot B', 'B Author',
   '88888888-2222-2222-2222-222222222222');

select lives_ok(
  $$ select public.merge_books(
       '88888888-1111-1111-1111-111111111111',
       '88888888-2222-2222-2222-222222222222',
       '{}'::jsonb) $$,
  'a merge with a loser whose book_id sits in two series_entries succeeds end-to-end (tombstone + re-parent)');

reset role;

-- ── 1. Primary's existing Series A entry untouched ──────────────────────────────────────────────
select is(
  (select book_id::text
     from public.series_entries
    where id = '99999999-aaaa-1111-1111-aaaaaaaaaaaa'),
  '88888888-1111-1111-1111-111111111111',
  'primary''s Series A entry remains linked to primary — the redundancy check does not disturb the survivor');

select is(
  (select removed_at is null
     from public.series_entries
    where id = '99999999-aaaa-1111-1111-aaaaaaaaaaaa'),
  true,
  'primary''s Series A entry keeps removed_at null');

-- ── 2. Redundant Series A entry TOMBSTONES (not re-parents, would clash with partial unique) ──
select ok(
  (select removed_at is not null
     from public.series_entries
    where id = '99999999-aaaa-2222-2222-aaaaaaaaaaaa'),
  'redundant Series A entry tombstoned — slot is kept for history, no longer drives UI');

select is(
  (select removed_at is null
     from public.series_entries
    where id = '99999999-aaaa-2222-2222-aaaaaaaaaaaa'),
  false,
  'tombstoned row visible as removed_at-is-not-null: a hidden (RLS) row would still come back null and the is() comparison would falsely pass — using is() over a derived boolean, not a raw NULL column, to dodge that hole');

select ok(
  (select book_id is null
     from public.series_entries
    where id = '99999999-aaaa-2222-2222-aaaaaaaaaaaa'),
  'tombstone NULL''s book_id — same shape as remove_series_entry''s row post-removal');

select ok(
  (select user_edited = true
     from public.series_entries
    where id = '99999999-aaaa-2222-2222-aaaaaaaaaaaa'),
  'tombstone sets user_edited = true — pin against any future source refresh from hardcover sweep');

select is(
  (select count(*)::int from public.series_entries
    where id = '99999999-aaaa-2222-2222-aaaaaaaaaaaa'),
  1,
  'tombstoned row is preserved (not delete-cascaded away): the slot''s user history kept, just hidden');

-- ── 3. Happy-path re-parent on Series B ─────────────────────────────────────────────────────────
-- The single linked entry points at the PRIMARY now; this is fix/iron-flame-duplicate's
-- headline shape (the loser's Empyrean slot survives the merge as a live link to the survivor).
select is(
  (select book_id::text
     from public.series_entries
    where id = '99999999-bbbb-1111-1111-bbbbbbbbbbbb'),
  '88888888-1111-1111-1111-111111111111',
  'Series B entry re-parented from loser to primary — Iron Flame / The Empyrean shape');

select ok(
  (select removed_at is null
     from public.series_entries
    where id = '99999999-bbbb-1111-1111-bbbbbbbbbbbb'),
  're-parented Series B entry keeps removed_at null');

-- ── 4. Series A and Series B each end with exactly the rows they deserve ───────────────────────
-- The post-merge live row count: 1 in Series A (primary's own untouched entry) plus 1 in Series B
-- (the re-parented slot). Tombstone doesn't count (removed_at is not null). Anything more would be
-- a ghost slot; anything less would be data loss.
select is(
  (select count(*)::int from public.series_entries
    where series_id = '77777777-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and removed_at is null),
  1,
  'Series A has exactly one live entry post-merge (primary''s, not a ghost)');

select is(
  (select count(*)::int from public.series_entries
    where series_id = '77777777-bbbb-bbbb-bbbb-bbbbbbbbbbbb' and removed_at is null),
  1,
  'Series B has exactly one live entry post-merge (the re-parented slot, not a ghost)');

-- ── 5. Ghost-slot absence (boolean form so a hidden row fails loud, not silently) ───────────────
select ok(
  (select bool_and(book_id is not null)
     from public.series_entries
    where series_id = '77777777-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      and removed_at is null),
  'every live Series B entry has a non-null book_id post-merge — no ghost slots left behind');

-- ── 6. Loser delete still fires (preserves end-to-end behaviour of the RPC) ─────────────────────
select is(
  (select count(*)::int from public.books
    where id = '88888888-2222-2222-2222-222222222222'),
  0,
  'loser row removed post-merge — the RPC still does its actual job');

-- ── 7. Grant-layer guard: anon still gets SQLSTATE 42501, never a body-level P0001 ──────────────
-- Re-asserting the 20260801010000 revoke survived `create or replace`. The merge_steps body has no
-- raise BEFORE the ownership checks — `cannot merge a book into itself` is the first thing the
-- body would say if exec wrap were re-granted to PUBLIC. A P0001 here means the revoke regressed;
-- the body actually ran; the linked-entry re-parent shape is now reachable to anon callers.
set local role anon;
select set_config('request.jwt.claims', '', true);
select throws_ok(
  $$ select public.merge_books('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000001', '{}'::jsonb) $$,
  '42501', null, 'anon still refused with 42501 — the create-or-replace did not regress the revoke');
reset role;

select * from finish();
rollback;
