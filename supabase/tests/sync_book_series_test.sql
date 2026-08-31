-- sync_book_series (20260817010000). Seven guards: REASSIGN with a claim-path placement, CLEAR,
-- a no-series book proving empty-to-empty is not a CLEAR, a series with no row yet (claim path
-- both fields), UNCHANGED-name delegating through set_series_order, a non-owner refusal touching
-- neither table, and atomicity FORCED rather than asserted. Anon's grant-layer refusal closes it
-- out.
--
-- ASSERTIONS READ AS THE SESSION ROLE, CALLS RUN AS `authenticated` — series_removal_test.sql's own
-- rule: RLS must not be able to hide a row from a check the way it hides one from a reader, or
-- "the row is untouched" and "the row is invisible to me" collapse into the same observation. Every
-- assertion below runs after `reset role`.
--
-- ok(x is null) / ok(x = y), never is(x, null) or is(x, y) for a comparison that could hide behind
-- two NULLs comparing equal — this file's established idiom, matching series_removal_test.sql.
--
-- THE FORCED-FAILURE LEVER is a statement-level trigger on books, same shape as
-- series_removal_test.sql's Guard 4: nothing on series_entries or books can be made to fail by data
-- alone (both writes touch only nullable/unconstrained columns for this path), so the lever has to
-- be external. Verified locally before this file was written: forcing the failure raises exactly
-- inside sync_book_series's final books UPDATE, and the transaction aborts as a whole — this proves
-- the property rather than assuming plpgsql's default (a function body with no exception block is
-- one transaction).

begin;
select plan(37);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-1111-1111-1111-111111111111', 'authenticated', 'authenticated',
   'sbs-owner@example.com', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('bbbbbbbb-2222-2222-2222-222222222222', 'authenticated', 'authenticated',
   'sbs-other@example.com', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.series (id, owner_id, name)
values
  ('cccccccc-1111-1111-1111-111111111111', 'aaaaaaaa-1111-1111-1111-111111111111', 'Old Saga'),
  ('cccccccc-2222-2222-2222-222222222222', 'aaaaaaaa-1111-1111-1111-111111111111', 'New Saga (No Entry Yet)'),
  ('cccccccc-3333-3333-3333-333333333333', 'aaaaaaaa-1111-1111-1111-111111111111', 'New Saga (Has Entry)');

-- Book One   — REASSIGN, target series row exists but no live entry for this book yet (claim path).
-- Book Two   — CLEAR.
-- Book Three — REASSIGN into a series with NO row at all (claim path, both fields).
-- Book Four  — UNCHANGED name, delegates through set_series_order (a live entry already links it).
-- Book Five  — owned by the OTHER reader, for the refusal guard.
-- Book Six   — never named a series at all, for the "empty is not always CLEAR" guard.
insert into public.books (id, owner_id, title, series, position, series_count)
values
  ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-1111-1111-1111-111111111111', 'Book One', 'Old Saga', 2, 5),
  ('dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-1111-1111-1111-111111111111', 'Book Two', 'Old Saga', 1, 3),
  ('dddddddd-0000-0000-0000-000000000003', 'aaaaaaaa-1111-1111-1111-111111111111', 'Book Three', 'Old Saga', 3, 4),
  ('dddddddd-0000-0000-0000-000000000004', 'aaaaaaaa-1111-1111-1111-111111111111', 'Book Four', 'New Saga (Has Entry)', 4, 9),
  ('dddddddd-0000-0000-0000-000000000005', 'bbbbbbbb-2222-2222-2222-222222222222', 'Book Five', 'Old Saga', 6, 1),
  ('dddddddd-0000-0000-0000-000000000006', 'aaaaaaaa-1111-1111-1111-111111111111', 'Book Six', null, null, null);

insert into public.series_entries (id, series_id, owner_id, position, title, author, book_id, user_edited)
values
  ('eeeeeeee-0000-0000-0000-000000000001', 'cccccccc-1111-1111-1111-111111111111', 'aaaaaaaa-1111-1111-1111-111111111111', 2, 'Book One', '', 'dddddddd-0000-0000-0000-000000000001', false),
  ('eeeeeeee-0000-0000-0000-000000000002', 'cccccccc-1111-1111-1111-111111111111', 'aaaaaaaa-1111-1111-1111-111111111111', 1, 'Book Two', '', 'dddddddd-0000-0000-0000-000000000002', false),
  ('eeeeeeee-0000-0000-0000-000000000003', 'cccccccc-1111-1111-1111-111111111111', 'aaaaaaaa-1111-1111-1111-111111111111', 3, 'Book Three', '', 'dddddddd-0000-0000-0000-000000000003', false),
  ('eeeeeeee-0000-0000-0000-000000000004', 'cccccccc-3333-3333-3333-333333333333', 'aaaaaaaa-1111-1111-1111-111111111111', 4, 'Book Four', '', 'dddddddd-0000-0000-0000-000000000004', false);

-- ── Guard 0: shape ──
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'sync_book_series'
     and pg_get_function_identity_arguments(p.oid) = 'p_book uuid, p_new_series text, p_position numeric, p_length integer'),
  1, 'sync_book_series(uuid, text, numeric, int) exists');
select is(
  (select prosecdef from pg_proc where oid = 'public.sync_book_series(uuid, text, numeric, int)'::regprocedure),
  true, 'sync_book_series is security definer');

-- ── Guard 1: REASSIGN, claim path (target series row exists, no live entry for this book yet) ──
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1111-1111-1111-111111111111","role":"authenticated"}', true);
select lives_ok(
  $$ select public.sync_book_series('dddddddd-0000-0000-0000-000000000001', 'New Saga (No Entry Yet)', 7, 6) $$,
  'reassign into a series with no live entry for this book succeeds');
reset role;
select ok(
  (select removed_at is not null and book_id is null and user_edited
     from public.series_entries where id = 'eeeeeeee-0000-0000-0000-000000000001'),
  'the OLD slot is tombstoned — byte-identical shape to remove_series_entry');
select ok(
  (select series = 'New Saga (No Entry Yet)' from public.books where id = 'dddddddd-0000-0000-0000-000000000001'),
  'books.series is written to the new name');
select ok(
  (select position = 7 from public.books where id = 'dddddddd-0000-0000-0000-000000000001'),
  'position is claimed directly (no live entry to place through the RPC)');
select ok(
  (select series_count = 5 from public.books where id = 'dddddddd-0000-0000-0000-000000000001'),
  'series_count is NOT claimed (a series row exists — length belongs to it, not to a bare claim)');
select ok(
  (select series_user_chosen from public.books where id = 'dddddddd-0000-0000-0000-000000000001'),
  'REASSIGN marks series_user_chosen — a reader-driven save, never re-offered by enrichment');
select is(
  (select series_claim ->> 'source' from public.books where id = 'dddddddd-0000-0000-0000-000000000001'),
  'book_edit', 'REASSIGN records the reader edit as the source of the current series');

-- ── Guard 2: CLEAR ──
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1111-1111-1111-111111111111","role":"authenticated"}', true);
select lives_ok(
  $$ select public.sync_book_series('dddddddd-0000-0000-0000-000000000002', null, null, null) $$,
  'clearing the series succeeds');
reset role;
select ok(
  (select removed_at is not null and book_id is null and user_edited
     from public.series_entries where id = 'eeeeeeee-0000-0000-0000-000000000002'),
  'CLEAR tombstones the old slot too — same shape as reassign');
select ok(
  (select series is null and position is null and series_count is null
     from public.books where id = 'dddddddd-0000-0000-0000-000000000002'),
  'series, position AND series_count all clear — the synced copies of a fact that no longer applies');
select ok(
  (select series_user_chosen from public.books where id = 'dddddddd-0000-0000-0000-000000000002'),
  'CLEAR marks series_user_chosen — the gap this migration closes: without it, the next enrich '
  || 'sweep sees a blank series it still matches and re-fills what the reader just removed');
select is(
  (select series_claim ->> 'origin' from public.books where id = 'dddddddd-0000-0000-0000-000000000002'),
  'reader', 'CLEAR records a positive reader refusal rather than an unexplained blank');

-- ── Guard 2b: Phase 2B makes position/length compatibility projections of a primary membership,
--    so a book that still has no series cannot retain orphaned numeric series fields. ──
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1111-1111-1111-111111111111","role":"authenticated"}', true);
select lives_ok(
  $$ select public.sync_book_series('dddddddd-0000-0000-0000-000000000006', null, 4, 7) $$,
  'a no-series book, saved with number/length set, succeeds');
reset role;
select ok(
  (select series is null and position is null and series_count is null
     from public.books where id = 'dddddddd-0000-0000-0000-000000000006'),
  'a no-series save cannot leave orphaned compatibility position or length values');
select ok(
  (select series_user_chosen from public.books where id = 'dddddddd-0000-0000-0000-000000000006'),
  'the "never had one" CLEAR branch marks series_user_chosen too — a reader-driven save either way');
select is(
  (select series_claim ->> 'source' from public.books where id = 'dddddddd-0000-0000-0000-000000000006'),
  'book_edit', 'the no-series save still records its explicit reader source');

-- ── Guard 3: REASSIGN into a series with NO row at all — claim path, both fields ──
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1111-1111-1111-111111111111","role":"authenticated"}', true);
select lives_ok(
  $$ select public.sync_book_series('dddddddd-0000-0000-0000-000000000003', 'Brand New Series', 1, 12) $$,
  'reassign into a series that has no row at all succeeds');
reset role;
select ok(
  (select removed_at is not null from public.series_entries where id = 'eeeeeeee-0000-0000-0000-000000000003'),
  'the old slot is tombstoned even though the new series has no row yet');
select is(
  (select count(*)::int from public.series where name = 'Brand New Series'),
  1, 'a trusted reader claim materializes its structured series row in the same transaction');
select ok(
  (select series = 'Brand New Series' and position = 1 and series_count = 12
     from public.books where id = 'dddddddd-0000-0000-0000-000000000003'),
  'both position and series_count are claimed directly — nothing exists yet for either to disagree with');
select ok(
  (select series_user_chosen from public.books where id = 'dddddddd-0000-0000-0000-000000000003'),
  'REASSIGN into a brand-new series also marks series_user_chosen');
select is(
  (select series_claim ->> 'origin' from public.books where id = 'dddddddd-0000-0000-0000-000000000003'),
  'reader', 'a brand-new series claim is attributed to the reader');

-- ── Guard 4: UNCHANGED name — delegates through set_series_order, no retirement ──
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1111-1111-1111-111111111111","role":"authenticated"}', true);
select lives_ok(
  $$ select public.sync_book_series('dddddddd-0000-0000-0000-000000000004', 'New Saga (Has Entry)', 1.5, 10) $$,
  'same-name save (number/length only) succeeds');
reset role;
select ok(
  (select removed_at is null from public.series_entries where id = 'eeeeeeee-0000-0000-0000-000000000004'),
  'the entry is NOT tombstoned — the name never changed, nothing to retire');
select ok(
  (select position = 1.5 and user_edited from public.series_entries where id = 'eeeeeeee-0000-0000-0000-000000000004'),
  'the live entry is repositioned through set_series_order, which marks it user_edited');
select ok(
  (select position = 1.5 from public.books where id = 'dddddddd-0000-0000-0000-000000000004'),
  'books.position mirrors the entry — set_series_order''s own write, not a second writer here');
select ok(
  (select length = 10 from public.series where id = 'cccccccc-3333-3333-3333-333333333333'),
  'series.length is set through the same delegated call');
select ok(
  (select series_user_chosen from public.books where id = 'dddddddd-0000-0000-0000-000000000004'),
  'the unchanged-name save still marks series_user_chosen — the final books UPDATE runs regardless');
select is(
  (select series_claim ->> 'source' from public.books where id = 'dddddddd-0000-0000-0000-000000000004'),
  'book_edit', 'an unchanged-name save confirms the reader source too');

-- ── Guard 5: a non-owner is refused, and NEITHER table is touched ──
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-2222-2222-2222-222222222222","role":"authenticated"}', true);
select throws_ok(
  $$ select public.sync_book_series('dddddddd-0000-0000-0000-000000000001', 'Anything', 1, 1) $$,
  null, 'not owner of book', 'a non-owner is refused outright');
reset role;
select ok(
  (select series = 'New Saga (No Entry Yet)' from public.books where id = 'dddddddd-0000-0000-0000-000000000001'),
  'the refused book is untouched — still the state Guard 1 left it in');

-- ── Guard 6: atomicity, FORCED. The books write fails; the tombstone must not survive either. ──
create function public.force_books_update_failure() returns trigger language plpgsql as $$
begin
  raise exception 'forced books update failure';
end;
$$;
create trigger zz_force_books_update_failure
  before update on public.books
  for each statement execute function public.force_books_update_failure();

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1111-1111-1111-111111111111","role":"authenticated"}', true);
select throws_ok(
  $$ select public.sync_book_series('dddddddd-0000-0000-0000-000000000004', 'Old Saga', 9, 9) $$,
  null, 'forced books update failure',
  'a failure on the books write aborts the whole call');
reset role;
-- The defect, stated as assertions: the half-committed state cannot outlive its own transaction.
select ok(
  (select removed_at is null and user_edited
     from public.series_entries where id = 'eeeeeeee-0000-0000-0000-000000000004'),
  'the tombstone (had it started) rolled back — the entry Guard 4 moved is still live and still user_edited from that move');
select ok(
  (select series = 'New Saga (Has Entry)' from public.books where id = 'dddddddd-0000-0000-0000-000000000004'),
  'the book still names its series — nothing half-applied');

-- ── fix/rpc-execute-grants shape: anon has no EXECUTE at all — refused at the GRANT layer, before
--    the ownership raise ever runs. Asserted on SQLSTATE 42501 specifically, never P0001 — a P0001
--    here would mean PUBLIC regained execute and the call reached 'not owner of book' instead,
--    which is exactly the silent regression a future `drop function` (rather than
--    `create or replace`) would produce. Guard 1 above is the paired half: it already proves the
--    authenticated owner still succeeds under these same grants. ──
set local role anon;
select set_config('request.jwt.claims', '', true);
select throws_ok(
  $$ select public.sync_book_series('00000000-0000-0000-0000-000000000000', 'x', 1, 1) $$,
  '42501', null, 'anon has no EXECUTE on sync_book_series — refused before the body ever runs');
reset role;

select * from finish();
rollback;
