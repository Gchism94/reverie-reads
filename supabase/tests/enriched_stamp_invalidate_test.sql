-- fix/stale-enrichment-stamp: the trigger that makes a matching-key change invalidate the
-- enrichment stamp. One assertion per key, one per non-key, and the writer-knows exception in both
-- directions — each clause of the trigger has an assertion only it can fail.

begin;
select plan(12);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'st@example.com', '{}', '{}', now(), now());

insert into public.books (id, owner_id, title, author_first, author_last, isbn, enriched_at) values
  ('8a000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Dirty Title (Series, #2)', 'A', 'Author', '', '2026-08-01T00:00:00Z'),
  ('8a000000-0000-0000-0000-000000000002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Author Probe', 'Wrong', 'Name', '', '2026-08-01T00:00:00Z'),
  ('8a000000-0000-0000-0000-000000000003', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Isbn Probe', 'A', 'Author', '', '2026-08-01T00:00:00Z'),
  ('8a000000-0000-0000-0000-000000000004', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Unrelated Probe', 'A', 'Author', '', '2026-08-01T00:00:00Z'),
  ('8a000000-0000-0000-0000-000000000005', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Sweep Fill Probe', 'A', 'Author', '', '2026-08-01T00:00:00Z'),
  ('8a000000-0000-0000-0000-000000000006', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Same Value Probe', 'A', 'Author', '9780000000001', '2026-08-01T00:00:00Z'),
  ('8a000000-0000-0000-0000-000000000007', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Never Checked', 'A', 'Author', '', null);

-- ══ 1. THE INCIDENT SHAPE: a title rewrite clears the stamp ═══════════════════════════════════
-- This is exactly what the series backfill's `update books set title = clean_title` does — a title
-- write with no enriched_at in the statement. Before this trigger, the stamp survived and the book
-- stayed invisible to the sweep while the Settings button counted it.
update public.books set title = 'Dirty Title' where id = '8a000000-0000-0000-0000-000000000001';
select ok(
  (select enriched_at from public.books where id = '8a000000-0000-0000-0000-000000000001') is null,
  'a title rewrite clears enriched_at — the cached verdict was about a title that no longer exists'
);

-- ══ 2. AUTHOR is a matching key too (the enrich query is title+author) ════════════════════════
update public.books set author_first = 'Right', author_last = 'Name'
 where id = '8a000000-0000-0000-0000-000000000002';
select ok(
  (select enriched_at from public.books where id = '8a000000-0000-0000-0000-000000000002') is null,
  'an author correction clears the stamp — same key, same staleness'
);

-- ══ 3. ISBN is the strongest key ══════════════════════════════════════════════════════════════
update public.books set isbn = '9781234567897' where id = '8a000000-0000-0000-0000-000000000003';
select ok(
  (select enriched_at from public.books where id = '8a000000-0000-0000-0000-000000000003') is null,
  'an added ISBN clears the stamp — the query it caches changed entirely'
);

-- ══ 4. A NON-KEY write never touches the stamp ════════════════════════════════════════════════
update public.books set rating = 5, pages = 400 where id = '8a000000-0000-0000-0000-000000000004';
select is(
  (select enriched_at from public.books where id = '8a000000-0000-0000-0000-000000000004'),
  '2026-08-01T00:00:00Z'::timestamptz,
  'rating/pages edits keep the stamp — they are not part of the enrichment query'
);

-- ══ 5. WRITER-KNOWS: the sweep's own fill write keeps ITS stamp ═══════════════════════════════
-- The sweep fills isbn (a key!) and sets a fresh enriched_at in the SAME statement
-- (enrichLibrary.ts:305). Without the exception, the trigger would null the very stamp the sweep
-- is writing and every checked book would immediately look unchecked again.
update public.books set isbn = '9780000000018', enriched_at = '2026-08-03T12:00:00Z'
 where id = '8a000000-0000-0000-0000-000000000005';
select is(
  (select enriched_at from public.books where id = '8a000000-0000-0000-0000-000000000005'),
  '2026-08-03T12:00:00Z'::timestamptz,
  'a key change WITH a fresh stamp in the same write keeps the writer''s stamp (the sweep''s shape)'
);

-- …and the writer-knows door only opens when the stamp actually CHANGES: a key change in a
-- statement that redundantly writes the OLD stamp value still clears.
update public.books set title = 'Sweep Fill Probe II', enriched_at = '2026-08-03T12:00:00Z'
 where id = '8a000000-0000-0000-0000-000000000005';
select ok(
  (select enriched_at from public.books where id = '8a000000-0000-0000-0000-000000000005') is null,
  'writing back the SAME stamp alongside a key change does not count as restamping'
);

-- ══ 6. THE EDIT-DIALOG SHAPE: unchanged keys sent verbatim clear nothing ══════════════════════
-- dialogs.tsx always includes title + isbn in its patch, changed or not. OLD/NEW distinctness is
-- what makes that safe with zero client changes.
update public.books
   set title = 'Same Value Probe', isbn = '9780000000001', rating = 4
 where id = '8a000000-0000-0000-0000-000000000006';
select is(
  (select enriched_at from public.books where id = '8a000000-0000-0000-0000-000000000006'),
  '2026-08-01T00:00:00Z'::timestamptz,
  'a patch that re-sends unchanged title/isbn keeps the stamp — value-aware, not field-aware'
);

-- ══ 7. A never-checked book stays never-checked (no phantom writes) ═══════════════════════════
update public.books set title = 'Never Checked Renamed' where id = '8a000000-0000-0000-0000-000000000007';
select ok(
  (select enriched_at from public.books where id = '8a000000-0000-0000-0000-000000000007') is null,
  'null stays null — the trigger never invents a stamp'
);

-- ══ 8. And a stamp can still be SET on a never-checked book (first sweep) ═════════════════════
update public.books set enriched_at = '2026-08-03T13:00:00Z'
 where id = '8a000000-0000-0000-0000-000000000007';
select is(
  (select enriched_at from public.books where id = '8a000000-0000-0000-0000-000000000007'),
  '2026-08-03T13:00:00Z'::timestamptz,
  'a plain stamp write lands untouched'
);

-- ══ 9. THE FULL INCIDENT, END TO END, through the real backfill function ══════════════════════
-- The actual rewriter that caused this: backfill_series_from_titles() cleaning a dirty title. Its
-- UPDATE carries no enriched_at, so the trigger must clear the stamp — proving the two migrations
-- compose. (The backfill is re-runnable by design, which is what lets this test call it.)
insert into public.books (id, owner_id, title, author_first, author_last, series, position, enriched_at) values
  ('8a000000-0000-0000-0000-000000000008', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Composed Probe (Compose Saga, #3)', 'C', 'Author', null, null, '2026-08-01T00:00:00Z');
select lives_ok($$select public.backfill_series_from_titles()$$, 'the backfill runs over the fixture');
select is(
  (select title from public.books where id = '8a000000-0000-0000-0000-000000000008'),
  'Composed Probe', 'the backfill cleaned the title'
);
select ok(
  (select enriched_at from public.books where id = '8a000000-0000-0000-0000-000000000008') is null,
  'and the trigger cleared the stamp the old sweep left — the incident cannot recur through this path'
);

select * from finish();
rollback;
