begin;
select plan(47);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('a2000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   'membership-owner@example.com', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('a2000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
   'membership-other@example.com', '{}'::jsonb, '{}'::jsonb, now(), now());

select has_column('public', 'series_entries', 'is_primary',
  'series entries declare one explicit primary projection');
select has_column('public', 'series_entries', 'membership_claim',
  'membership provenance is stored on the membership');
select has_column('public', 'series_entries', 'position_claim',
  'order provenance is stored separately from membership provenance');

insert into public.series (id, owner_id, name)
values
  ('a2100000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'Historical Saga'),
  ('a2100000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000001', 'Secondary Saga'),
  ('a2100000-0000-0000-0000-000000000003', 'a2000000-0000-0000-0000-000000000001', 'Third Saga');

-- Historical/default rows remain explicitly unclassified.
insert into public.books (id, owner_id, title, series, position)
values ('a2200000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001',
        'Historical Book', 'Historical Saga', 4);
insert into public.books (id, owner_id, title)
values ('a2200000-0000-0000-0000-000000000004', 'a2000000-0000-0000-0000-000000000002',
        'Other Reader Book');
insert into public.series_entries
  (id, series_id, owner_id, position, title, author, book_id)
values
  ('a2300000-0000-0000-0000-000000000001', 'a2100000-0000-0000-0000-000000000001',
   'a2000000-0000-0000-0000-000000000001', 4, 'Historical Book', '',
   'a2200000-0000-0000-0000-000000000001');

select is(
  (select membership_claim ->> 'origin' from public.series_entries
   where id = 'a2300000-0000-0000-0000-000000000001'),
  'unknown', 'historical entry membership is not inferred');
select is(
  (select position_claim ->> 'origin' from public.series_entries
   where id = 'a2300000-0000-0000-0000-000000000001'),
  'unknown', 'historical order is not inferred from its number');
select is(
  (select is_primary from public.series_entries
   where id = 'a2300000-0000-0000-0000-000000000001'),
  false, 'historical entry is not silently promoted to primary');

-- A trusted forward book write materializes structured authority in the same transaction.
insert into public.books
  (id, owner_id, title, series, position, series_count, series_claim)
values
  ('a2200000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000001',
   'Trusted Book', 'Trusted Saga', 1, 5,
   '{"origin":"reader","source":"add"}'::jsonb);

select is(
  (select count(*)::int from public.series_entries e
   join public.series s on s.id = e.series_id
   where e.book_id = 'a2200000-0000-0000-0000-000000000002'
     and e.is_primary and e.removed_at is null and s.name = 'Trusted Saga'),
  1, 'trusted insert atomically creates one primary structured membership');
select is(
  (select membership_claim ->> 'source' from public.series_entries
   where book_id = 'a2200000-0000-0000-0000-000000000002' and is_primary),
  'add', 'membership keeps the trusted writer provenance');
select is(
  (select position_claim ->> 'source' from public.series_entries
   where book_id = 'a2200000-0000-0000-0000-000000000002' and is_primary),
  'add', 'the separately stored order claim keeps its source');
select ok(
  (select series = 'Trusted Saga' and position = 1 and series_count = 5
   from public.books where id = 'a2200000-0000-0000-0000-000000000002'),
  'the primary entry projects the compatibility tuple');

-- Low-confidence enrichment remains a review claim, not authority.
insert into public.books (id, owner_id, title, series, position, series_claim)
values
  ('a2200000-0000-0000-0000-000000000003', 'a2000000-0000-0000-0000-000000000001',
   'Tentative Book', 'Tentative Saga', 2,
   '{"origin":"enrichment","source":"catalog","confidence":"low"}'::jsonb);
select is(
  (select count(*)::int from public.series_entries
   where book_id = 'a2200000-0000-0000-0000-000000000003'),
  0, 'low-confidence enrichment does not silently admit membership');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$select public.set_book_series_membership(
    'a2200000-0000-0000-0000-000000000002',
    'a2100000-0000-0000-0000-000000000002', 'Secondary Saga', 2, null, false,
    '{"origin":"reader","source":"secondary_add"}'::jsonb,
    '{"origin":"reader","source":"series_order"}'::jsonb
  )$$,
  'the owner may add a justified secondary membership');
reset role;

select is(
  (select count(*)::int from public.series_entries
   where book_id = 'a2200000-0000-0000-0000-000000000002' and removed_at is null),
  2, 'one book can belong to two intact series');
select is(
  (select series from public.books where id = 'a2200000-0000-0000-0000-000000000002'),
  'Trusted Saga', 'adding a secondary membership does not overwrite the primary projection');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.set_primary_series_membership(
    (select id from public.series_entries
     where series_id = 'a2100000-0000-0000-0000-000000000002'
       and book_id = 'a2200000-0000-0000-0000-000000000002')
  )$$,
  'the owner can select which membership is primary');
reset role;

select is(
  (select count(*)::int from public.series_entries
   where book_id = 'a2200000-0000-0000-0000-000000000002'
     and is_primary and removed_at is null),
  1, 'primary selection cannot leave two primaries');
select ok(
  (select series = 'Secondary Saga' and position = 2
   from public.books where id = 'a2200000-0000-0000-0000-000000000002'),
  'primary selection projects the selected membership');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$update public.series_entries set position = position
    where book_id = 'a2200000-0000-0000-0000-000000000002' and is_primary$$,
  'an authenticated direct restore-style write can run the internal projection trigger');
reset role;

-- Moving a secondary entry cannot move books.position away from its primary entry.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.set_series_order_claimed(
    (select series_id from public.series_entries
     where book_id = 'a2200000-0000-0000-0000-000000000002' and not is_primary),
    jsonb_build_array(jsonb_build_object(
      'entry_id', (select id from public.series_entries
                   where book_id = 'a2200000-0000-0000-0000-000000000002' and not is_primary),
      'position', 3
    )), 'reader', '{}'::jsonb
  )$$,
  'secondary order remains independently editable');
reset role;
select is(
  (select position from public.books where id = 'a2200000-0000-0000-0000-000000000002'),
  2::numeric, 'secondary reorder cannot overwrite the primary compatibility position');
select is(
  (select position_claim ->> 'source' from public.series_entries
   where book_id = 'a2200000-0000-0000-0000-000000000002' and not is_primary),
  'series_order', 'reorder records order provenance without changing membership provenance');

-- A direct compatibility drift is corrected after the statement.
update public.books set position = 99
where id = 'a2200000-0000-0000-0000-000000000002';
select is(
  (select position from public.books where id = 'a2200000-0000-0000-0000-000000000002'),
  2::numeric, 'structured primary authority repairs a direct scalar position drift');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.rename_personal_series(
    'a2100000-0000-0000-0000-000000000002', 'Secondary Saga Renamed')$$,
  'series rename succeeds atomically');
reset role;
select is(
  (select series from public.books where id = 'a2200000-0000-0000-0000-000000000002'),
  'Secondary Saga Renamed', 'rename projects to primary member books in the same transaction');
select is(
  (select series from public.books where id = 'a2200000-0000-0000-0000-000000000001'),
  'Historical Saga', 'rename does not rewrite unrelated unknown compatibility strings');

-- Removing a secondary leaves the primary intact; removing the primary clears without guessing a
-- replacement from remaining secondaries.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.remove_series_membership(
    (select id from public.series_entries
     where book_id = 'a2200000-0000-0000-0000-000000000002' and not is_primary)
  )$$,
  'secondary membership removal succeeds');
reset role;
select is(
  (select series from public.books where id = 'a2200000-0000-0000-0000-000000000002'),
  'Secondary Saga Renamed', 'secondary removal leaves the primary projection intact');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.remove_series_membership(
    (select id from public.series_entries
     where book_id = 'a2200000-0000-0000-0000-000000000002' and is_primary)
  )$$,
  'primary membership removal succeeds');
reset role;
select ok(
  (select series is null and position is null and series_count is null
   from public.books where id = 'a2200000-0000-0000-0000-000000000002'),
  'primary removal clears compatibility instead of silently promoting another membership');
select is(
  (select series_claim ->> 'source' from public.books
   where id = 'a2200000-0000-0000-0000-000000000002'),
  'series_remove', 'primary removal preserves the positive reader refusal');

-- Explicit review is the only operation that admits the historical scalar claim.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.admit_series_compatibility_claims(
    'a2100000-0000-0000-0000-000000000001', 'Historical Saga')$$,
  'reader review admits historical compatibility claims');
reset role;
select is(
  (select membership_claim ->> 'source' from public.series_entries
   where id = 'a2300000-0000-0000-0000-000000000001'),
  'series_review', 'review replaces unknown membership with an explicit reader decision');
select is(
  (select count(*)::int from public.series_entries
   where book_id = 'a2200000-0000-0000-0000-000000000001'
     and is_primary and removed_at is null),
  1, 'review establishes exactly one primary membership for the historical book');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.set_book_series_membership(
    'a2200000-0000-0000-0000-000000000001', null, '', null, null, true,
    '{"origin":"reader","source":"book_edit"}'::jsonb,
    '{"origin":"unknown"}'::jsonb
  )$$,
  'book edit can explicitly clear its primary structured membership');
reset role;
select is(
  (select count(*)::int from public.series_entries
   where book_id = 'a2200000-0000-0000-0000-000000000001' and is_primary and removed_at is null),
  0, 'clear leaves no live primary rather than promoting an unchosen membership');
select ok(
  (select series is null and series_claim ->> 'source' = 'book_edit'
   from public.books where id = 'a2200000-0000-0000-0000-000000000001'),
  'clear projects an explicit reader refusal to the compatibility row');

select throws_ok(
  $$insert into public.series_entries
    (series_id, owner_id, position, title, book_id)
    values ('a2100000-0000-0000-0000-000000000003',
            'a2000000-0000-0000-0000-000000000001', 1, 'Other reader book',
            'a2200000-0000-0000-0000-000000000004')$$,
  '23514', null, 'forward writes cannot link another reader''s book');

-- Existing duplicate-book and duplicate-series merges preserve multiple memberships and end with
-- exactly one selected primary, rather than colliding with the new uniqueness invariant.
insert into public.books (id, owner_id, title, series, position, series_claim)
values
  ('a2200000-0000-0000-0000-000000000010', 'a2000000-0000-0000-0000-000000000001',
   'Merge Primary', 'Merge Book Primary Series', 1,
   '{"origin":"reader","source":"merge_fixture"}'::jsonb),
  ('a2200000-0000-0000-0000-000000000011', 'a2000000-0000-0000-0000-000000000001',
   'Merge Loser', 'Merge Book Loser Series', 2,
   '{"origin":"reader","source":"merge_fixture"}'::jsonb);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.merge_books_authoritative(
    'a2200000-0000-0000-0000-000000000010',
    'a2200000-0000-0000-0000-000000000011',
    '{"series":"Merge Book Loser Series"}'::jsonb
  )$$,
  'book merge can re-parent two different primary memberships');
reset role;
select is(
  (select count(*)::int from public.series_entries
   where book_id = 'a2200000-0000-0000-0000-000000000010' and removed_at is null),
  2, 'book merge preserves both distinct series memberships');
select is(
  (select count(*)::int from public.series_entries
   where book_id = 'a2200000-0000-0000-0000-000000000010'
     and is_primary and removed_at is null),
  1, 'book merge finishes with exactly one primary membership');
select is(
  (select series from public.books where id = 'a2200000-0000-0000-0000-000000000010'),
  'Merge Book Loser Series', 'book merge projects the selected series winner');

insert into public.series (id, owner_id, name)
values
  ('a2100000-0000-0000-0000-000000000010', 'a2000000-0000-0000-0000-000000000001', 'Merge Series Survivor'),
  ('a2100000-0000-0000-0000-000000000011', 'a2000000-0000-0000-0000-000000000001', 'Merge Series Loser');
insert into public.books (id, owner_id, title, series, position, series_claim)
values
  ('a2200000-0000-0000-0000-000000000012', 'a2000000-0000-0000-0000-000000000001',
   'Series Merge Book', 'Merge Series Loser', 1,
   '{"origin":"reader","source":"merge_fixture"}'::jsonb);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.set_book_series_membership(
  'a2200000-0000-0000-0000-000000000012',
  'a2100000-0000-0000-0000-000000000010', 'Merge Series Survivor', 2, null, false,
  '{"origin":"reader","source":"merge_fixture"}'::jsonb,
  '{"origin":"reader","source":"merge_fixture"}'::jsonb
);
select lives_ok(
  $$select public.merge_series_authoritative(
    'a2100000-0000-0000-0000-000000000010',
    'a2100000-0000-0000-0000-000000000011',
    'merge series loser', 'merge series survivor'
  )$$,
  'series merge can fold a primary loser into an existing secondary survivor');
reset role;
select is(
  (select count(*)::int from public.series_entries
   where series_id = 'a2100000-0000-0000-0000-000000000010'
     and book_id = 'a2200000-0000-0000-0000-000000000012' and removed_at is null),
  1, 'series merge keeps one live surviving membership for the book');
select is(
  (select count(*)::int from public.series_entries
   where book_id = 'a2200000-0000-0000-0000-000000000012'
     and is_primary and removed_at is null),
  1, 'series merge repairs the surviving entry as the one primary');
select is(
  (select series from public.books where id = 'a2200000-0000-0000-0000-000000000012'),
  'Merge Series Survivor', 'series merge projects the surviving series name');

set local role anon;
select set_config('request.jwt.claims', '', true);
select throws_ok(
  $$select public.set_book_series_membership(
    '00000000-0000-0000-0000-000000000000', null, 'x', 1, null, true,
    '{"origin":"reader"}'::jsonb, '{"origin":"reader"}'::jsonb)$$,
  '42501', null, 'anon has no execute on the structured membership mutation');
select throws_ok(
  $$select public.rename_personal_series(
    '00000000-0000-0000-0000-000000000000', 'x')$$,
  '42501', null, 'anon has no execute on atomic series rename');
reset role;

select * from finish();
rollback;
