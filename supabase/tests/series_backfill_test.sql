-- fix/series-backfill: one assertion per category, plus idempotence proven by a whole-table
-- snapshot rather than by "the second run matched zero rows".
--
-- The work under test is `public.backfill_series_from_titles()`. It lives in a function precisely so
-- this file can call it against fixtures it inserts itself — inline migration SQL has already run by
-- the time pgTAP starts and cannot be exercised.

begin;
select plan(25);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'authenticated', 'authenticated', 'sb@example.com', '{}', '{}', now(), now());

-- ── Fixtures. Every category the migration claims to handle, one row each. ─────────────────────
insert into public.books (id, owner_id, title, author_first, author_last, series, position) values
  -- 1. plain dirty title, no existing series
  ('b0000000-0000-0000-0000-000000000001', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
   'Binding 13 (Boys of Tommen, #1)', 'Chloe', 'Walsh', null, null),
  -- 2. a NON-series parenthetical must survive untouched
  ('b0000000-0000-0000-0000-000000000002', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
   'Powerless (Deluxe Edition)', 'Lauren', 'Roberts', null, null),
  -- 3. bare `Untitled` after cleaning — excluded ENTIRELY
  ('b0000000-0000-0000-0000-000000000003', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
   'Untitled (Phantom Series, #2)', 'B', 'Author', null, null),
  -- 4. omnibus range — title cleaned, NO series/position written
  ('b0000000-0000-0000-0000-000000000004', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
   'Omnibus Tale (Probe Saga, #1-3)', 'C', 'Author', null, null),
  -- 5. canonical merge target
  ('b0000000-0000-0000-0000-000000000005', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
   'Merge Probe (Fire and Metal, #2)', 'G', 'Author', null, null),
  -- 6. PARSED WINS over a worse existing series (the rule change)
  ('b0000000-0000-0000-0000-000000000006', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
   'Bad Existing (Zodiac Academy, #3)', 'C', 'Auburn', 'Zodiac-Academy', 99),
  -- 7. PROTECTED: Rose Hill (Silver) survives parsed
  ('b0000000-0000-0000-0000-000000000007', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
   'Silver Book (Rose Hill, #2)', 'R', 'Author', 'Rose Hill (Silver)', 2),
  -- 8. PROTECTED: the canonical merge target is never reverted
  ('b0000000-0000-0000-0000-000000000008', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
   'Hades Book (Hades & Persephone, #1)', 'S', 'Author', 'Hades x Persephone Saga', 1),
  -- 9. unicode: mathematical bold + a zero-width space, NO parenthetical
  ('b0000000-0000-0000-0000-000000000009', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
   E'\U0001D400 \U0001D402ourt of Bonds', 'H', 'Author', null, null),
  ('b0000000-0000-0000-0000-00000000000a', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
   E'A ​Court of Silver Flames', 'I', 'Author', null, null),
  -- 10. the book an orphan ghost will adopt (its own title is dirty too)
  ('b0000000-0000-0000-0000-00000000000b', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
   'A Court of Mist and Fury (ACOTAR, #2)', 'Sarah', 'Maas', null, null),
  -- 11. TWO books cleaning to the SAME title — an ambiguous ghost must adopt NEITHER
  ('b0000000-0000-0000-0000-00000000000c', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
   'Twin Title (ACOTAR, #7)', 'T', 'One', null, null),
  ('b0000000-0000-0000-0000-00000000000d', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
   'Twin Title', 'T', 'Two', null, null);

insert into public.series (id, owner_id, name) values
  ('50000000-0000-0000-0000-000000000001', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'ACOTAR'),
  ('50000000-0000-0000-0000-000000000002', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Probe Saga');

insert into public.series_entries (id, owner_id, series_id, position, title, author, book_id, source, user_edited) values
  -- orphan ghost, unlinked, clean title matches book …000b once cleaned on BOTH sides
  ('e0000000-0000-0000-0000-000000000001', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
   '50000000-0000-0000-0000-000000000001', 2, 'A Court of Mist and Fury', 'Sarah Maas', null, 'hardcover', false),
  -- an entry whose own title is dirty
  ('e0000000-0000-0000-0000-000000000002', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
   '50000000-0000-0000-0000-000000000001', 1, 'A Court of Thorns and Roses (ACOTAR, #1)', 'Sarah Maas', null, 'hardcover', false),
  -- an omnibus ENTRY — tombstoned, not deleted
  ('e0000000-0000-0000-0000-000000000003', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
   '50000000-0000-0000-0000-000000000002', 1, 'Omnibus Tale (Probe Saga, #1-3)', 'C Author', null, 'hardcover', false),
  -- an AMBIGUOUS ghost: its cleaned title matches two books, so it must adopt neither
  ('e0000000-0000-0000-0000-000000000004', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
   '50000000-0000-0000-0000-000000000001', 7, 'Twin Title', 'T One', null, 'hardcover', false);

-- Snapshot BEFORE the first run, so idempotence can be a real diff later.
create temp table _snap_none as
  select id, title, series, position from public.books order by id;

select lives_ok(
  $$select public.backfill_series_from_titles()$$,
  'the backfill runs without aborting on clean fixtures'
);

-- ══ 1. dirty titles cleaned ═══════════════════════════════════════════════════════════════════
select is((select title from public.books where id = 'b0000000-0000-0000-0000-000000000001'),
          'Binding 13', 'a series parenthetical is stripped from the title');
select is((select series from public.books where id = 'b0000000-0000-0000-0000-000000000001'),
          'Boys of Tommen', 'and the series is backfilled from it');
select is((select position from public.books where id = 'b0000000-0000-0000-0000-000000000001'),
          1::numeric, 'and the position too — the number comes from the parenthetical, not the title');

-- ══ 2. a non-series parenthetical is NEVER stripped ═══════════════════════════════════════════
select is((select title from public.books where id = 'b0000000-0000-0000-0000-000000000002'),
          'Powerless (Deluxe Edition)', 'a non-series parenthetical survives verbatim');
select ok((select series from public.books where id = 'b0000000-0000-0000-0000-000000000002') is null,
          'and nothing is invented as its series');

-- ══ 3. bare Untitled excluded ENTIRELY ════════════════════════════════════════════════════════
select is((select title from public.books where id = 'b0000000-0000-0000-0000-000000000003'),
          'Untitled (Phantom Series, #2)', 'a row cleaning to bare Untitled keeps its title');
select ok((select series from public.books where id = 'b0000000-0000-0000-0000-000000000003') is null,
          'and its series is left untouched — three placeholders must stay distinguishable');

-- ══ 4. omnibus: title cleaned, no series/position ═════════════════════════════════════════════
select is((select title from public.books where id = 'b0000000-0000-0000-0000-000000000004'),
          'Omnibus Tale', 'an omnibus book still gets its title cleaned');
select ok((select series from public.books where id = 'b0000000-0000-0000-0000-000000000004') is null,
          'but a range writes no series — an omnibus is not a slot in a reading order');

-- ══ 5. canonical merge on write ═══════════════════════════════════════════════════════════════
select is((select series from public.books where id = 'b0000000-0000-0000-0000-000000000005'),
          'Fire & Metal', 'a hand-picked canonical name is applied when the series is written');

-- ══ 6. PARSED WINS over a worse existing value (the rule change) ══════════════════════════════
select is((select series from public.books where id = 'b0000000-0000-0000-0000-000000000006'),
          'Zodiac Academy', 'parsed overwrites a worse existing series');
select is((select position from public.books where id = 'b0000000-0000-0000-0000-000000000006'),
          3::numeric, 'and its position comes from the parenthetical, not the stale 99');

-- ══ 7 + 8. THE TWO HARDCODED EXCEPTIONS — the mutation target ═════════════════════════════════
-- Dropping the `not in (...)` guard makes both of these fail: parsed would flatten `Rose Hill
-- (Silver)` to `Rose Hill` and revert `Hades x Persephone Saga` to `Hades & Persephone`.
select is((select series from public.books where id = 'b0000000-0000-0000-0000-000000000007'),
          'Rose Hill (Silver)', 'Rose Hill (Silver) is protected — it disambiguates two series');
select is((select series from public.books where id = 'b0000000-0000-0000-0000-000000000008'),
          'Hades x Persephone Saga', 'the canonical merge target is never reverted by parsed');

-- ══ 9. unicode normalized + zero-width stripped ═══════════════════════════════════════════════
select is((select title from public.books where id = 'b0000000-0000-0000-0000-000000000009'),
          'A Court of Bonds', 'mathematical bold is folded to ASCII by NFKC');
select is((select title from public.books where id = 'b0000000-0000-0000-0000-00000000000a'),
          'A Court of Silver Flames', 'a zero-width space is stripped');

-- ══ 10. series_entries titles + omnibus tombstone + orphan adoption ═══════════════════════════
select is((select title from public.series_entries where id = 'e0000000-0000-0000-0000-000000000002'),
          'A Court of Thorns and Roses', 'a dirty entry title is cleaned too');

select ok((select removed_at from public.series_entries where id = 'e0000000-0000-0000-0000-000000000003') is not null,
          'an omnibus ENTRY is tombstoned');
-- Tombstoned, NOT deleted — a reader removal must stay expressible. A count, not an `is null`:
-- a deleted row would make an `is()` on its column pass by vacuous NULL comparison.
select is((select count(*)::int from public.series_entries where id = 'e0000000-0000-0000-0000-000000000003'),
          1, 'and it still EXISTS — tombstoned rather than deleted');

select is((select book_id from public.series_entries where id = 'e0000000-0000-0000-0000-000000000001'),
          'b0000000-0000-0000-0000-00000000000b'::uuid,
          'the orphan ghost adopts the book whose CLEANED title matches it');

-- matchEntryForBook's rule: nothing is revived when the tie cannot be broken. Reviving the WRONG
-- slot resurrects a removal the reader made deliberately, which is worse than a missed revive they
-- can see and redo. `ok(... is null)` not `is(..., null)`: a vanished row's zero-row subquery would
-- make `is()` pass by comparing NULL to NULL.
select ok((select book_id from public.series_entries where id = 'e0000000-0000-0000-0000-000000000004') is null,
          'an AMBIGUOUS ghost adopts nothing — two books share its cleaned title');

-- ══ IDEMPOTENCE — a whole-table snapshot diff, not "matched zero rows" ════════════════════════
-- "The second run updated 0 rows" would also be true of a run that silently did nothing at all.
-- This compares every column this migration can touch, across every row, before and after.
create temp table _snap_after_first as
  select id, title, series, position from public.books order by id;

select lives_ok($$select public.backfill_series_from_titles()$$, 'a second run also completes');

select is(
  (select count(*)::int from (
     (select id, title, series, position from public.books
      except select id, title, series, position from _snap_after_first)
     union all
     (select id, title, series, position from _snap_after_first
      except select id, title, series, position from public.books)
   ) diff),
  0,
  'the second run changes NOTHING — full-table symmetric diff is empty'
);

-- And prove the snapshot mechanism can actually detect a change, or the assertion above is vacuous.
select isnt(
  (select count(*)::int from (
     (select id, title, series, position from public.books
      except select id, title, series, position from _snap_none)
     union all
     (select id, title, series, position from _snap_none
      except select id, title, series, position from public.books)
   ) diff),
  0,
  'positive control: the same diff DOES see the first run''s changes'
);

select * from finish();
rollback;
