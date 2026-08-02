-- sweep_traces: owner-scoped measurement rows for the enrichment sweep.
--
-- A timing table is low-stakes data, which is exactly why its RLS is worth pinning: a table added
-- for a one-off investigation is the kind that gets a policy wrong and nobody notices, because
-- nothing in the app breaks when one reader can read another's rows.
--
-- ASSERTION SHAPE: every "did not happen" check below is `ok(... is null)` / a count, never
-- `is(x, null)`. Under RLS a hidden row makes the subquery return ZERO rows, so `is(x, null)`
-- passes identically whether the row is invisible or genuinely absent — the exact hole
-- fix/atomic-series-removal hit. Counts and `ok()` fail on a hidden row instead of passing.

begin;
select plan(13);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'authenticated', 'authenticated', 'trace-a@example.com', '{}', '{}', now(), now()),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'authenticated', 'authenticated', 'trace-b@example.com', '{}', '{}', now(), now());

insert into public.books (id, owner_id, title, author_first, author_last)
values ('c0000000-0000-0000-0000-000000000001', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'C book', 'Cee', 'Author');

-- ── shape ────────────────────────────────────────────────────────────────────────────────────
select has_table('public', 'sweep_traces', 'sweep_traces exists');
select col_is_pk('public', 'sweep_traces', 'id', 'id is the primary key');
select ok(
  (select rowsecurity from pg_tables where schemaname = 'public' and tablename = 'sweep_traces'),
  'RLS is enabled'
);

-- A trace outlives the book it measured: book_id is ON DELETE SET NULL, not CASCADE. A slow book
-- that was later merged away is still evidence about where the time went.
select ok(
  (select confdeltype from pg_constraint
     where conrelid = 'public.sweep_traces'::regclass and confrelid = 'public.books'::regclass) = 'n',
  'book_id is ON DELETE SET NULL, so deleting a book does not destroy its measurement'
);
-- The owner going away DOES take the traces: they are personal data with no value without them.
select ok(
  (select confdeltype from pg_constraint
     where conrelid = 'public.sweep_traces'::regclass and confrelid = 'auth.users'::regclass) = 'c',
  'owner_id cascades on user delete'
);

-- ── RLS: owner isolation ─────────────────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';

select lives_ok(
  $$insert into public.sweep_traces (owner_id, run_id, book_id, book_title, spans, total_ms)
    values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'run-1', 'c0000000-0000-0000-0000-000000000001',
            'C book', '[{"s":"client.enrich","ms":1902.4}]'::jsonb, 2200.5)$$,
  'the owner can record a trace'
);

select throws_ok(
  $$insert into public.sweep_traces (owner_id, run_id, book_title, spans, total_ms)
    values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'run-x', 'not mine', '[]'::jsonb, 1)$$,
  '42501',
  null,
  'a trace cannot be recorded against another user'
);

select is(
  (select count(*)::int from public.sweep_traces),
  1,
  'the owner sees their own row'
);

-- The other user must see zero — a count, so an invisible row cannot pass as a null.
set local request.jwt.claims = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
select is(
  (select count(*)::int from public.sweep_traces),
  0,
  'another user sees none of them'
);

-- A measurement is immutable. This is enforced at the GRANT layer, not by a missing policy: the
-- migration grants select/insert/delete and deliberately withholds update, so the refusal is
-- SQLSTATE 42501 rather than a policy silently matching zero rows. Asserting the code specifically
-- matters — a policy-level miss would let the statement succeed against rows the user does own.
select throws_ok(
  $$update public.sweep_traces set total_ms = 999 where run_id = 'run-1'$$,
  '42501',
  null,
  'update is refused at the grant layer, not merely filtered by a policy'
);

-- And the value really is untouched. Read as a role nothing filters, so a row hidden by RLS cannot
-- masquerade as an unchanged one.
reset role;
select is(
  (select total_ms from public.sweep_traces where run_id = 'run-1'),
  2200.5::numeric,
  'the recorded measurement survives the attempt unchanged'
);

-- spans keeps ORDER and repeats — the whole point, since ol-search appears twice per book with
-- very different waits and a totals map would collapse them.
insert into public.sweep_traces (owner_id, run_id, book_title, spans, total_ms)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'run-2', 'ordered',
        '[{"s":"pace.ol-search.wait","ms":0},{"s":"pace.ol-search.wait","ms":662.7}]'::jsonb, 700);

select is(
  (select jsonb_array_length(spans) from public.sweep_traces where run_id = 'run-2'),
  2,
  'two spans with the same name are both kept, not merged'
);
select ok(
  (select (spans->0->>'ms')::numeric = 0 and (spans->1->>'ms')::numeric = 662.7
     from public.sweep_traces where run_id = 'run-2'),
  'and they keep their call order, so the second ol-search wait is distinguishable from the first'
);

select * from finish();
rollback;
