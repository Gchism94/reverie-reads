-- remove_series_entry (fix/atomic-series-removal, S3a). Five guards: the owner succeeds with BOTH
-- writes applied; repeating that same call on an already-tombstoned slot is harmless; a non-owner is
-- refused with NEITHER applied; a ghost removal touches no books row; and atomicity is FORCED rather
-- than asserted.
--
-- ASSERTIONS READ AS THE SESSION ROLE, CALLS RUN AS `authenticated`. This is not tidiness — the
-- first draft asserted as `authenticated` and RLS silently hid the rows being checked, so a
-- non-owner's refusal was "verified" against rows that role cannot see. `select removed_at is null
-- from series_entries where id = <other reader's entry>` returns NULL, not true, so `ok()` caught it
-- here; `is(removed_at, null)` would have PASSED for entirely the wrong reason. An RLS-hidden row and
-- an unmodified row are indistinguishable to a whole class of assertion shapes. So every assertion
-- below runs after `reset role`, where nothing is filtered, and only the RPC calls themselves run as
-- the role a reader actually has.
--
-- THE FORCED-FAILURE LEVER IS A TRIGGER, not merge_test.sql's bad-CHECK-value trick, because no
-- CHECK is reachable here: nothing on series_entries constrains removed_at, book_id or user_edited
-- (its only CHECK is on source, which a removal never touches), and books.series is nullable text,
-- so `set series = null` cannot be made to fail by data alone. Its FK and partial unique index both
-- permit null. DDL is transactional in Postgres, so the trigger and its function die with the
-- rollback at the bottom of this file.
--
-- The trigger is FOR EACH STATEMENT, deliberately, and one lever proves two different things:
--   · linked removal — the books UPDATE runs, the trigger raises, and the tombstone must roll back.
--   · ghost removal  — a row-level trigger would not fire on `where id = null` (zero rows matched),
--     so it could not tell "no UPDATE was issued" from "an UPDATE matched nothing". A statement-level
--     trigger fires once per statement regardless of rows matched, so the ghost path surviving it
--     proves the RPC issues no books UPDATE at all.
-- It raises a DISTINCTIVE message that the test matches on, so a pass cannot be earned by the call
-- failing somewhere else for some other reason.
--
-- throws_ok wraps each call in a subtransaction, so the assertions after a refusal read the state the
-- aborted call left behind. That is the property under test, not an artefact of the harness: an
-- implementation that swallowed the second write's error would return normally and fail throws_ok,
-- and one that committed the first write independently would leave removed_at stamped.

begin;
select plan(30);

-- Two readers. The on_auth_user_created trigger gives each a profile, which books.owner_id needs.
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-1111-1111-1111-111111111111', 'authenticated', 'authenticated',
   'series-owner@example.com', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('bbbbbbbb-2222-2222-2222-222222222222', 'authenticated', 'authenticated',
   'series-other@example.com', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.series (id, owner_id, name)
values ('cccccccc-3333-3333-3333-333333333333', 'aaaaaaaa-1111-1111-1111-111111111111', 'Test Series');

-- Book One   → the happy path.       Book Two → the non-owner refusal.
-- Book Three → the forced failure.   B Book   → owned by the OTHER reader, linked from an entry the
--                                               first reader owns. Legal: series_entries' insert
--                                               policy constrains the entry's owner and its parent
--                                               series, and says nothing about book_id's owner.
insert into public.books (id, owner_id, title, series)
values
  ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-1111-1111-1111-111111111111', 'Book One', 'Test Series'),
  ('dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-1111-1111-1111-111111111111', 'Book Two', 'Test Series'),
  ('dddddddd-0000-0000-0000-000000000003', 'aaaaaaaa-1111-1111-1111-111111111111', 'Book Three', 'Test Series'),
  ('dddddddd-0000-0000-0000-000000000005', 'bbbbbbbb-2222-2222-2222-222222222222', 'B Book', 'Test Series');

-- user_edited starts FALSE on every fixture, so the flag flipping is observed rather than assumed.
insert into public.series_entries (id, series_id, owner_id, position, title, author, book_id, user_edited)
values
  ('eeeeeeee-0000-0000-0000-000000000001', 'cccccccc-3333-3333-3333-333333333333', 'aaaaaaaa-1111-1111-1111-111111111111', 1, 'Book One', 'A Author', 'dddddddd-0000-0000-0000-000000000001', false),
  ('eeeeeeee-0000-0000-0000-000000000002', 'cccccccc-3333-3333-3333-333333333333', 'aaaaaaaa-1111-1111-1111-111111111111', 2, 'Book Two', 'A Author', 'dddddddd-0000-0000-0000-000000000002', false),
  ('eeeeeeee-0000-0000-0000-000000000003', 'cccccccc-3333-3333-3333-333333333333', 'aaaaaaaa-1111-1111-1111-111111111111', 3, 'Book Three', 'A Author', 'dddddddd-0000-0000-0000-000000000003', false),
  ('eeeeeeee-0000-0000-0000-000000000004', 'cccccccc-3333-3333-3333-333333333333', 'aaaaaaaa-1111-1111-1111-111111111111', 4, 'Ghost Slot', 'A Author', null, false),
  ('eeeeeeee-0000-0000-0000-000000000005', 'cccccccc-3333-3333-3333-333333333333', 'aaaaaaaa-1111-1111-1111-111111111111', 5, 'B Book', 'B Author', 'dddddddd-0000-0000-0000-000000000005', false);

-- ── The function's shape. security definer is the reason the ownership checks are the only boundary
--    that exists here, so a later `create or replace` dropping it has to fail on this line. ──
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'remove_series_entry'
     and pg_get_function_identity_arguments(p.oid) = 'p_entry uuid'),
  1, 'remove_series_entry(uuid) exists');
select is(
  (select prosecdef from pg_proc where oid = 'public.remove_series_entry(uuid)'::regprocedure),
  true, 'remove_series_entry is security definer');

-- ── Guard 1: the owner succeeds, and BOTH writes are applied ──
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1111-1111-1111-111111111111","role":"authenticated"}', true);
select lives_ok(
  $$ select public.remove_series_entry('eeeeeeee-0000-0000-0000-000000000001') $$,
  'the owner can remove a linked slot');
reset role;
select ok(
  (select removed_at is not null from public.series_entries where id = 'eeeeeeee-0000-0000-0000-000000000001'),
  'removal stamps removed_at on the entry');
select ok(
  (select book_id is null from public.series_entries where id = 'eeeeeeee-0000-0000-0000-000000000001'),
  'removal releases book_id, freeing the slot for a later re-add');
select is(
  (select user_edited from public.series_entries where id = 'eeeeeeee-0000-0000-0000-000000000001'),
  true, 'removal marks the entry user_edited, so a source refresh cannot reposition it');
select ok(
  (select series is null from public.books where id = 'dddddddd-0000-0000-0000-000000000001'),
  'removal clears the linked book''s series in the same call');
select ok(
  (select series_user_chosen from public.books where id = 'dddddddd-0000-0000-0000-000000000001'),
  'removal marks series_user_chosen alongside the clear — the audit''s actual finding: without it, '
  || 'the next enrich sweep sees a blank series it still matches and re-fills what was just removed');
select is(
  (select series_claim ->> 'source' from public.books where id = 'dddddddd-0000-0000-0000-000000000001'),
  'series_remove', 'removal records the explicit refusal instead of an unexplained blank');

-- ── Repeat removal: calling the RPC again on a slot it already tombstoned is harmless. A real
--    client scenario once S3b lands — a double-tap, or a retry after a failed toast. book_id is
--    already null from the first call, so the second call's books branch never fires: v_book comes
--    back null, the `if v_book is not null` guard skips the books UPDATE entirely, and there is
--    nothing left to re-clear or break. ──
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1111-1111-1111-111111111111","role":"authenticated"}', true);
select lives_ok(
  $$ select public.remove_series_entry('eeeeeeee-0000-0000-0000-000000000001') $$,
  'removing an already-removed slot succeeds rather than erroring');
reset role;
select ok(
  (select removed_at is not null from public.series_entries where id = 'eeeeeeee-0000-0000-0000-000000000001'),
  'the entry is still tombstoned after the repeat call');
select ok(
  (select book_id is null from public.series_entries where id = 'eeeeeeee-0000-0000-0000-000000000001'),
  'book_id is still released after the repeat call');
select ok(
  (select series is null from public.books where id = 'dddddddd-0000-0000-0000-000000000001'),
  'the already-cleared book is untouched by the repeat call — no re-write, no error');
select ok(
  (select series_user_chosen from public.books where id = 'dddddddd-0000-0000-0000-000000000001'),
  'series_user_chosen is still set after the repeat call — no books UPDATE fires to unset it');

-- ── Guard 2: a non-owner is refused, and NEITHER write is applied ──
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-2222-2222-2222-222222222222","role":"authenticated"}', true);
select throws_ok(
  $$ select public.remove_series_entry('eeeeeeee-0000-0000-0000-000000000002') $$,
  null, 'not owner of series entry', 'a non-owner is refused');
reset role;
select ok(
  (select removed_at is null from public.series_entries where id = 'eeeeeeee-0000-0000-0000-000000000002'),
  'the refused entry is still live — no tombstone applied');
select is(
  (select series from public.books where id = 'dddddddd-0000-0000-0000-000000000002'),
  'Test Series', 'the refused book still names the series — no second write applied');

-- ── Guard 2b: an entry the caller owns, linking a book they do NOT own, is refused outright ──
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1111-1111-1111-111111111111","role":"authenticated"}', true);
select throws_ok(
  $$ select public.remove_series_entry('eeeeeeee-0000-0000-0000-000000000005') $$,
  null, 'not owner of linked book', 'an entry linking someone else''s book is refused');
reset role;
select ok(
  (select removed_at is null from public.series_entries where id = 'eeeeeeee-0000-0000-0000-000000000005'),
  'the cross-owner entry is still live — no tombstone applied');
select is(
  (select series from public.books where id = 'dddddddd-0000-0000-0000-000000000005'),
  'Test Series', 'the other reader''s book is untouched');

-- ── Arm the lever. Created as the session role: `authenticated` does not own public.books. ──
create function public.force_books_update_failure() returns trigger language plpgsql as $$
begin
  raise exception 'forced books update failure';
end;
$$;
create trigger zz_force_books_update_failure
  before update on public.books
  for each statement execute function public.force_books_update_failure();

-- ── Guard 3: a ghost removal issues NO books UPDATE. Surviving a statement-level trigger that
--    raises on any UPDATE against books is the proof — nothing weaker distinguishes "no statement
--    issued" from "a statement that matched no rows". ──
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1111-1111-1111-111111111111","role":"authenticated"}', true);
select lives_ok(
  $$ select public.remove_series_entry('eeeeeeee-0000-0000-0000-000000000004') $$,
  'a ghost removal succeeds without issuing any UPDATE against books');
reset role;
select ok(
  (select removed_at is not null from public.series_entries where id = 'eeeeeeee-0000-0000-0000-000000000004'),
  'ghost removal stamps removed_at');
select is(
  (select user_edited from public.series_entries where id = 'eeeeeeee-0000-0000-0000-000000000004'),
  true, 'ghost removal pins the tombstone against a source refresh too');

-- ── Guard 4: atomicity, FORCED. The books write fails; the tombstone must not survive. ──
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1111-1111-1111-111111111111","role":"authenticated"}', true);
select throws_ok(
  $$ select public.remove_series_entry('eeeeeeee-0000-0000-0000-000000000003') $$,
  null, 'forced books update failure',
  'a failure on the books write aborts the whole call');
reset role;
-- The defect, stated as assertions: the half-committed state cannot outlive its own transaction.
select ok(
  (select removed_at is null from public.series_entries where id = 'eeeeeeee-0000-0000-0000-000000000003'),
  'the tombstone rolled back when the books write failed');
select is(
  (select book_id from public.series_entries where id = 'eeeeeeee-0000-0000-0000-000000000003'),
  'dddddddd-0000-0000-0000-000000000003'::uuid,
  'the released book_id rolled back too — the slot is still linked');
select is(
  (select user_edited from public.series_entries where id = 'eeeeeeee-0000-0000-0000-000000000003'),
  false, 'the user_edited flip rolled back too');
select is(
  (select series from public.books where id = 'dddddddd-0000-0000-0000-000000000003'),
  'Test Series', 'the book still names the series — nothing half-applied');
select is(
  (select series_user_chosen from public.books where id = 'dddddddd-0000-0000-0000-000000000003'),
  false, 'series_user_chosen rolled back too — the forced failure aborts the whole books UPDATE');

-- ── fix/rpc-execute-grants: anon has no EXECUTE on remove_series_entry at all — refused at the
--    GRANT layer, before the function body (and its ownership raises) ever runs. An arbitrary,
--    nonexistent id: the privilege check happens before any row lookup, so this holds regardless
--    of whether it exists. Asserted on SQLSTATE 42501 specifically, never P0001 — a P0001 here
--    would mean PUBLIC still had execute and the call reached 'not owner of series entry' instead,
--    which is exactly the silent regression a future `drop function` (rather than
--    `create or replace`) would produce. Guard 1 above is the paired half of this claim: it already
--    proves the authenticated owner still succeeds under these same grants.
set local role anon;
select set_config('request.jwt.claims', '', true);
select throws_ok(
  $$ select public.remove_series_entry('00000000-0000-0000-0000-000000000000') $$,
  '42501', null, 'anon has no EXECUTE on remove_series_entry — refused before the body ever runs');
reset role;

select * from finish();
rollback;
