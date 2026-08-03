-- fix/reset-seeded-user-edited: one assertion per category, plus idempotence proven by a whole-table
-- snapshot rather than by "the second run matched zero rows".
--
-- The work under test is `public.reset_seeded_user_edited()`. It lives in a function precisely so
-- this file can call it against fixtures it inserts itself — inline migration SQL has already run by
-- the time pgTAP starts and cannot be exercised.

begin;
select plan(26);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'authenticated', 'authenticated', 'rs@example.com', '{}', '{}', now(), now());

insert into public.series (id, owner_id, name) values
  ('7a000000-0000-0000-0000-000000000001', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'Reset Probe');

insert into public.books (id, owner_id, title, author_first, author_last) values
  ('7b000000-0000-0000-0000-000000000001', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'Linked One', 'A', 'Author'),
  ('7b000000-0000-0000-0000-000000000002', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'Linked Two', 'A', 'Author'),
  ('7b000000-0000-0000-0000-000000000003', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'Linked Three', 'A', 'Author'),
  ('7b000000-0000-0000-0000-000000000004', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'Linked Four', 'A', 'Author'),
  -- Held back for the tally re-run below. `series_entries_book_uidx` is unique on
  -- (series_id, book_id) where book_id is not null, so the fresh resettable row needs a book nothing
  -- else has claimed — reusing a linked one violates the index rather than testing anything.
  ('7b000000-0000-0000-0000-000000000005', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'Linked Five', 'A', 'Author'),
  ('7b000000-0000-0000-0000-000000000006', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'Linked Six', 'A', 'Author');

-- ── Fixtures. Every category the migration claims to handle, one row each. ─────────────────────
insert into public.series_entries
  (id, owner_id, series_id, position, label, title, author, book_id, source, user_edited, removed_at) values
  -- 1. THE TARGET: live, user_edited, linked, unlabelled. Indistinguishable from a seeded row,
  --    which is the whole premise of this migration.
  ('7c000000-0000-0000-0000-000000000001', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
   '7a000000-0000-0000-0000-000000000001', 1, null, 'Linked One', 'A Author',
   '7b000000-0000-0000-0000-000000000001', 'manual', true, null),
  -- 2. GHOST — book_id null. Seeding always links, so an unlinked user_edited row is a reader's
  --    ghost add or a removal. Unlabelled deliberately: the `label is null` guard must NOT be what
  --    saves it, or this assertion would pass for the wrong reason and the ghost mutant would live.
  ('7c000000-0000-0000-0000-000000000002', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
   '7a000000-0000-0000-0000-000000000001', 2, null, 'A Ghost', 'A Author',
   null, 'manual', true, null),
  -- 3. LABELLED — only useUpdateEntry writes a label. LINKED deliberately, for the mirror-image
  --    reason: if this row were also a ghost, `book_id is not null` would save it and dropping the
  --    label guard would leave the suite green.
  ('7c000000-0000-0000-0000-000000000003', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
   '7a000000-0000-0000-0000-000000000001', 3, 'novella', 'Linked Two', 'A Author',
   '7b000000-0000-0000-0000-000000000002', 'manual', true, null),
  -- 4. TOMBSTONE, REALISTIC SHAPE. `removalPatch` and `remove_series_entry` both null book_id, so
  --    this is what a real tombstone looks like — and it is protected TWICE over (removed_at AND
  --    book_id), which is exactly why it cannot test the removed_at guard on its own. Kept because
  --    it is the shape production actually holds.
  ('7c000000-0000-0000-0000-000000000004', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
   '7a000000-0000-0000-0000-000000000001', 4, null, 'Dismissed', 'A Author',
   null, 'manual', true, now()),
  -- 5. TOMBSTONE, GUARD-ISOLATING. Linked and unlabelled, so `removed_at is null` is the ONLY thing
  --    standing between it and a reset. This shape does not occur in production — every path that
  --    tombstones also clears book_id — and it is here for that reason: without it, the removed_at
  --    clause could be deleted entirely and every assertion in this file would still pass.
  ('7c000000-0000-0000-0000-000000000005', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
   '7a000000-0000-0000-0000-000000000001', 5, null, 'Linked Three', 'A Author',
   '7b000000-0000-0000-0000-000000000003', 'manual', true, now()),
  -- 6. ALREADY FALSE — a post-#131 seeded row, or one this migration already handled. Nothing
  --    should flip it the other way.
  ('7c000000-0000-0000-0000-000000000006', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
   '7a000000-0000-0000-0000-000000000001', 6, null, 'Linked Four', 'A Author',
   '7b000000-0000-0000-0000-000000000004', 'manual', false, null),
  -- 7. LABELLED GHOST — both guards apply at once. Neither mutant can be caught here, which is the
  --    point of fixtures 2 and 3; this one confirms the overlap is handled rather than double-counted
  --    in the returned tallies.
  ('7c000000-0000-0000-0000-000000000007', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
   '7a000000-0000-0000-0000-000000000001', 7, 'prequel', 'Labelled Ghost', 'A Author',
   null, 'manual', true, null),
  -- 8. HARDCOVER + user_edited, LINKED AND UNLABELLED — the third mutation target, and the row the
  --    brief's predicate would have wrongly reset. Every machine write to a hardcover row sets the
  --    flag false, and `source` is write-once, so this combination can only be a reader acting on a
  --    catalog row (dragging a canonical ghost, or revivedTombstone un-removing one). Linked and
  --    unlabelled deliberately: `source = 'manual'` is the ONLY guard that can save it.
  ('7c000000-0000-0000-0000-000000000009', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
   '7a000000-0000-0000-0000-000000000001', 9, null, 'Dragged Canonical', 'A Author',
   '7b000000-0000-0000-0000-000000000006', 'hardcover', true, null);

-- Snapshot BEFORE the first run, so idempotence can be a real diff later.
create temp table _snap_none as
  select id, user_edited, label, book_id, removed_at from public.series_entries order by id;

-- The first run, with its report captured. The RAISE NOTICE the owner reads at deploy is built
-- entirely from these six numbers, so they are asserted against known fixtures rather than trusted —
-- a tally that silently reported 0 would look exactly like a clean deploy.
create temp table _r1 as select public.reset_seeded_user_edited() as j;

select ok((select count(*) = 1 from _r1), 'the reset runs and returns a report');
select is((select (j->>'reset')::int from _r1), 1,
  'reset tally: exactly the one live linked unlabelled manual row');
select is((select (j->>'owners')::int from _r1), 1, 'owners tally: one owner in this fixture set');
select is((select (j->>'kept_ghost')::int from _r1), 2,
  'kept_ghost tally: the plain ghost and the labelled ghost');
select is((select (j->>'kept_labelled')::int from _r1), 1,
  'kept_labelled tally: the linked labelled row (the labelled GHOST counts as a ghost, not here)');
select is((select (j->>'kept_hardcover')::int from _r1), 1,
  'kept_hardcover tally: the dragged canonical row');
select is((select (j->>'kept_tombstone')::int from _r1), 2, 'kept_tombstone tally: both tombstones');

-- ══ 1. THE TARGET RESETS ══════════════════════════════════════════════════════════════════════
select is(
  (select user_edited from public.series_entries where id = '7c000000-0000-0000-0000-000000000001'),
  false,
  'a live linked unlabelled row — the seeded shape — has user_edited cleared'
);

-- ══ 2. GHOST PRESERVED — the first mutation target ════════════════════════════════════════════
-- Dropping `book_id is not null` from the migration resets this row and fails HERE and nowhere else.
select is(
  (select user_edited from public.series_entries where id = '7c000000-0000-0000-0000-000000000002'),
  true,
  'a manual ghost keeps user_edited — seeding always links, so an unlinked row is a reader gesture'
);

-- ══ 3. LABEL PRESERVED — the second mutation target ═══════════════════════════════════════════
-- Dropping `label is null` resets this row and fails HERE and nowhere else.
select is(
  (select user_edited from public.series_entries where id = '7c000000-0000-0000-0000-000000000003'),
  true,
  'a labelled row keeps user_edited — only useUpdateEntry writes a label'
);

-- ══ 4. TOMBSTONES UNTOUCHED ═══════════════════════════════════════════════════════════════════
select is(
  (select user_edited from public.series_entries where id = '7c000000-0000-0000-0000-000000000004'),
  true,
  'a realistic tombstone keeps user_edited'
);
select is(
  (select user_edited from public.series_entries where id = '7c000000-0000-0000-0000-000000000005'),
  true,
  'and a LINKED UNLABELLED tombstone keeps it too — removed_at is the only guard that can save this one'
);
-- Tombstoned, not altered otherwise. A count, not an `is()` on a column: a vanished row would make
-- a column comparison pass by vacuous NULL equality.
select is(
  (select count(*)::int from public.series_entries where removed_at is not null),
  2,
  'both tombstones still exist — this migration deletes nothing'
);

-- ══ 4b. HARDCOVER PRESERVED — the third mutation target ═══════════════════════════════════════
-- Dropping `source = 'manual'` resets this row and fails HERE and nowhere else. This is the case the
-- brief's four-clause predicate did not cover, and the reason the audit's 23 + 2 did not reach 26.
select is(
  (select user_edited from public.series_entries where id = '7c000000-0000-0000-0000-000000000009'),
  true,
  'a hardcover-sourced user_edited row keeps its flag — only a reader can have set it'
);

-- ══ 5. NOTHING IS FLIPPED THE OTHER WAY ═══════════════════════════════════════════════════════
select is(
  (select user_edited from public.series_entries where id = '7c000000-0000-0000-0000-000000000006'),
  false,
  'a row already user_edited=false stays false — the update only ever clears'
);
select is(
  (select user_edited from public.series_entries where id = '7c000000-0000-0000-0000-000000000007'),
  true,
  'a labelled ghost keeps user_edited — both guards cover it'
);

-- ══ 6. ONLY user_edited MOVES ═════════════════════════════════════════════════════════════════
-- The migration touches one column. Proven by diffing every OTHER column across every row, so a
-- stray write to label / book_id / removed_at fails here rather than going unnoticed.
select is(
  (select count(*)::int from (
     (select id, label, book_id, removed_at from public.series_entries
      except select id, label, book_id, removed_at from _snap_none)
     union all
     (select id, label, book_id, removed_at from _snap_none
      except select id, label, book_id, removed_at from public.series_entries)
   ) diff),
  0,
  'label, book_id and removed_at are untouched on every row'
);

-- ══ 7. THE RETURNED TALLIES ═══════════════════════════════════════════════════════════════════
-- The RAISE NOTICE the owner reads at deploy is built from these, so they are asserted rather than
-- trusted. `reset` is counted BEFORE the write; a count taken after would report 0 on a full run.
select is((public.reset_seeded_user_edited() -> 'reset')::int, 0,
  'a second call reports 0 to reset — the predicate is self-clearing');

-- Re-run against a fresh target to prove the tallies are real rather than always-zero.
insert into public.series_entries
  (id, owner_id, series_id, position, label, title, author, book_id, source, user_edited, removed_at)
values
  ('7c000000-0000-0000-0000-000000000008', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
   '7a000000-0000-0000-0000-000000000001', 8, null, 'Linked Five', 'A Author',
   '7b000000-0000-0000-0000-000000000005', 'manual', true, null);

select is((select (public.reset_seeded_user_edited() -> 'reset')::int), 1,
  'with one fresh resettable row present, the tally reports exactly 1');

select is(
  (select user_edited from public.series_entries where id = '7c000000-0000-0000-0000-000000000008'),
  false,
  'and that row is the one that got cleared'
);

-- ══ 8. IDEMPOTENCE — a whole-table snapshot diff, not "matched zero rows" ══════════════════════
-- "The second run updated 0 rows" would also be true of a run that silently did nothing at all.
create temp table _snap_after as
  select id, user_edited, label, book_id, removed_at from public.series_entries order by id;

select lives_ok($$select public.reset_seeded_user_edited()$$, 'a further run also completes');

select is(
  (select count(*)::int from (
     (select id, user_edited, label, book_id, removed_at from public.series_entries
      except select id, user_edited, label, book_id, removed_at from _snap_after)
     union all
     (select id, user_edited, label, book_id, removed_at from _snap_after
      except select id, user_edited, label, book_id, removed_at from public.series_entries)
   ) diff),
  0,
  'the repeat run changes NOTHING — full-table symmetric diff is empty'
);

-- And prove the snapshot mechanism can actually detect a change, or the assertion above is vacuous.
select isnt(
  (select count(*)::int from (
     (select id, user_edited, label, book_id, removed_at from public.series_entries
      except select id, user_edited, label, book_id, removed_at from _snap_none)
     union all
     (select id, user_edited, label, book_id, removed_at from _snap_none
      except select id, user_edited, label, book_id, removed_at from public.series_entries)
   ) diff),
  0,
  'positive control: the same diff DOES see the earlier runs'' changes'
);

-- ══ 9. THE GRANT BOUNDARY ═════════════════════════════════════════════════════════════════════
-- AGENTS.md: the revoke is the boundary, the grant is defence in depth. SQLSTATE 42501 specifically
-- — a body-level error would mean PUBLIC regained execute and the call got through to run.
select throws_ok(
  $$set local role authenticated; select public.reset_seeded_user_edited()$$,
  '42501',
  null,
  'authenticated cannot execute the reset — permission denied at the grant layer, not in the body'
);
reset role;
select throws_ok(
  $$set local role anon; select public.reset_seeded_user_edited()$$,
  '42501',
  null,
  'nor can anon'
);
reset role;

select ok(
  has_function_privilege('service_role', 'public.reset_seeded_user_edited()', 'EXECUTE'),
  'service_role keeps EXECUTE — the owner can still run it deliberately'
);

select * from finish();
rollback;
