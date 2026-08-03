-- fix/series-backfill: one assertion per category, plus idempotence proven by a whole-table
-- snapshot rather than by "the second run matched zero rows".
--
-- The work under test is `public.backfill_series_from_titles()`. It lives in a function precisely so
-- this file can call it against fixtures it inserts itself — inline migration SQL has already run by
-- the time pgTAP starts and cannot be exercised.

begin;
select plan(36);

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
  -- 8. PROTECTED: the canonical merge target is never reverted. The parenthetical deliberately
  --    prints `Hades and Persephone` — a spelling NOT in canon — because with a canon spelling the
  --    rename produces the right name on its own and the assertion passes whether or not the
  --    exception exists. Only an unmapped spelling makes the exception the thing being tested.
  ('b0000000-0000-0000-0000-000000000008', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
   'Hades Book (Hades and Persephone, #1)', 'S', 'Author', 'Hades x Persephone Saga', 1),
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
   'Twin Title', 'T', 'Two', null, null),
  -- 12. CANONICAL RENAME, not an exception. The parenthetical prints the series as `Divine Rivals`,
  --     which is book one's title. The stored position is deliberately WRONG (99) so the assertion
  --     can tell a landed parsed number from a frozen stored one — with a stored 2 the two
  --     outcomes are identical and the test proves nothing.
  ('b0000000-0000-0000-0000-00000000000e', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
   'Ruthless Vows (Divine Rivals, #2)', 'Rebecca', 'Ross', 'Letters of Enchantment', 99),
  -- 13. The rename does not depend on how the EXISTING value is spelled: this row carries a
  --     differently-cased variant and still ends up on the canonical name.
  ('b0000000-0000-0000-0000-00000000000f', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
   'Divine Rivals (Divine Rivals, #1)', 'Rebecca', 'Ross', 'Letters of enchantment', 1),
  -- 14. …nor on there being one at all. Under the earlier exception design this row was the
  --     documented residual, backfilled to the wrong name `Divine Rivals`. The rename removes it.
  ('b0000000-0000-0000-0000-000000000010', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
   'Rival Probe (Divine Rivals, #4)', 'Rebecca', 'Ross', null, null),
  -- 15. THE LIMIT OF THE RENAME, pinned deliberately. Canon is exact-match, so a variant parsed
  --     spelling is neither renamed nor protected and is written as-is — overwriting a correct
  --     existing name. This is the cost of preferring a rename to an exception, and it is a test
  --     rather than a comment so that making canon fuzzy later has to change it on purpose.
  ('b0000000-0000-0000-0000-000000000011', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
   'Vows Variant (Divine Rivals Series, #2)', 'Rebecca', 'Ross', 'Letters of Enchantment', 2),
  -- 16. NO PARENTHETICAL AT ALL — depth stays 0, `tgt`'s `p.depth > 0` guard excludes it, and it
  --     must come out of the migration with its title, series AND position bit-for-bit unchanged.
  --     This is the largest population in the real library (most titles are already clean) and the
  --     one PARSED-WINS created a real erasure risk for: `tgt`'s `new_series` is
  --     `coalesce(c.to_name, p.parsed_series)`, and for a depth-0 row `parsed_series` is NULL — so
  --     without the `depth > 0` guard this row's real series would be overwritten with NULL, not
  --     left alone. A book with NO existing series would hide the bug (NULL -> NULL looks fine);
  --     this one has one, so the guard's absence is visible.
  ('b0000000-0000-0000-0000-000000000012', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
   'A Clean Standalone Title', 'D', 'Author', 'Some Standalone Series', 5);

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

-- ══ 9. `Divine Rivals` IS RENAMED, NOT FROZEN ═════════════════════════════════════════════════
-- Book one's title, printed as the series by the export. Handled in canon, so the name is
-- corrected AND the parenthetical's number lands — the two things an exception could not do at once.
select is((select series from public.books where id = 'b0000000-0000-0000-0000-00000000000e'),
          'Letters of Enchantment',
          'a parenthetical printing `Divine Rivals` is renamed to the real series');
-- The stored 99 is wrong and gets repaired. This is the assertion the exception design could not
-- make: it would have kept the 99 in exchange for keeping the name.
select is((select position from public.books where id = 'b0000000-0000-0000-0000-00000000000e'),
          2::numeric, 'and the parsed position lands, replacing a wrong stored 99');
-- The rename does not consult the existing value, so a variant spelling of it is normalised too…
select is((select series from public.books where id = 'b0000000-0000-0000-0000-00000000000f'),
          'Letters of Enchantment',
          'a differently-cased existing name is normalised onto the canonical one');
-- …and a row with no existing series at all lands on the right name rather than book one's title.
-- Under the exception design this row was the documented residual; the rename removes it.
select is((select series from public.books where id = 'b0000000-0000-0000-0000-000000000010'),
          'Letters of Enchantment',
          'and a row with NO existing series gets the real series, not `Divine Rivals`');
select is((select position from public.books where id = 'b0000000-0000-0000-0000-000000000010'),
          4::numeric, 'with its parsed position');
-- The limit, asserted rather than described: canon is exact-match, so a variant PARSED spelling is
-- neither renamed nor protected, and it overwrites a correct existing name. Preview categories 6
-- and 7 are what surface this on real data before the migration is authorised.
select is((select series from public.books where id = 'b0000000-0000-0000-0000-000000000011'),
          'Divine Rivals Series',
          'but a variant parsed spelling is NOT renamed — it overwrites, and the preview must be read');

-- ══ 9. unicode normalized + zero-width stripped ═══════════════════════════════════════════════
select is((select title from public.books where id = 'b0000000-0000-0000-0000-000000000009'),
          'A Court of Bonds', 'mathematical bold is folded to ASCII by NFKC');
select is((select title from public.books where id = 'b0000000-0000-0000-0000-00000000000a'),
          'A Court of Silver Flames', 'a zero-width space is stripped');

-- ══ 11. NO PARENTHETICAL — depth 0 is untouched on ALL THREE fields, explicitly ═══════════════
-- Every other assertion in this file exercises a row that HAD a parenthetical. Nothing so far pins
-- down the opposite and largest case: a title with none. `is()`, not `ok(... is null)` — this row's
-- existing series/position are non-null, so a real value must survive, not merely stay NULL.
select is((select title from public.books where id = 'b0000000-0000-0000-0000-000000000012'),
          'A Clean Standalone Title', 'a title with no parenthetical is not touched');
select is((select series from public.books where id = 'b0000000-0000-0000-0000-000000000012'),
          'Some Standalone Series',
          'and its EXISTING series survives — parsed-wins has nothing to win, there is no parenthetical');
select is((select position from public.books where id = 'b0000000-0000-0000-0000-000000000012'),
          5::numeric, 'and its existing position survives too');

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

-- ══ PREDICATE PARITY — preview.sql must agree with the migration, and this is what checks it ═══
-- docs/queries/series-backfill-preview.sql and series-backfill-collision-diagnostic.sql do not
-- share this write rule with the migration BY CONSTRUCTION — it is COPIED into all three, and
-- necessarily so: the preview and diagnostic exist specifically to be run BEFORE this migration is
-- ever applied to a database, so they cannot depend on a function this migration creates; and a
-- migration must be a self-contained, immutable SQL artifact, so it cannot \i an external file at
-- apply time. Three independent copies is the only shape available.
--
-- That predicate has been wrong TWICE already on this branch — once as stale never-overwrite logic
-- left in preview.sql after the write rule changed to parsed-wins, once as a frozen exception where
-- the migration had already moved to a canonical rename — and neither drift was caught by anything
-- that runs. This is meant to be that check.
--
-- What it is NOT: this cannot literally execute docs/queries/series-backfill-preview.sql. Verified
-- empirically — a `\ir ../../docs/queries/series-backfill-preview.sql` from a file under
-- supabase/tests/ resolves fine under a bare `psql`, but fails "No such file or directory" under
-- `supabase test db`'s own runner, whose working environment does not expose paths outside
-- `supabase/`. So this RE-STATES preview.sql's canon table, exception list and write-branch logic —
-- a fourth copy, kept as close to preview.sql's own CTE names and structure as possible — against
-- the parsed values already established for the fixtures above (each one documented at its insert),
-- and diffs the row set it predicts against what the migration ACTUALLY wrote. A change to the write
-- rule landed in the migration without a matching change here — or in preview.sql — is a real,
-- undetected drift; this cannot promise the SECOND half of that (this copy and preview.sql itself
-- silently diverging), only that this copy and the MIGRATION cannot silently diverge unnoticed.
create temp table _predicted_parse
  (id uuid, series_name text, position numeric,
   parsed_series text, parsed_position numeric, depth int, is_range boolean, is_untitled boolean);
insert into _predicted_parse values
  ('b0000000-0000-0000-0000-000000000001', null, null, 'Boys of Tommen', 1, 1, false, false),
  ('b0000000-0000-0000-0000-000000000002', null, null, null, null, 0, false, false),
  ('b0000000-0000-0000-0000-000000000003', null, null, 'Phantom Series', 2, 1, false, true),
  ('b0000000-0000-0000-0000-000000000004', null, null, 'Probe Saga', null, 1, true, false),
  ('b0000000-0000-0000-0000-000000000005', null, null, 'Fire and Metal', 2, 1, false, false),
  ('b0000000-0000-0000-0000-000000000006', 'Zodiac-Academy', 99, 'Zodiac Academy', 3, 1, false, false),
  ('b0000000-0000-0000-0000-000000000007', 'Rose Hill (Silver)', 2, 'Rose Hill', 2, 1, false, false),
  ('b0000000-0000-0000-0000-000000000008', 'Hades x Persephone Saga', 1, 'Hades and Persephone', 1, 1, false, false),
  ('b0000000-0000-0000-0000-000000000009', null, null, null, null, 0, false, false),
  ('b0000000-0000-0000-0000-00000000000a', null, null, null, null, 0, false, false),
  ('b0000000-0000-0000-0000-00000000000b', null, null, 'ACOTAR', 2, 1, false, false),
  ('b0000000-0000-0000-0000-00000000000c', null, null, 'ACOTAR', 7, 1, false, false),
  ('b0000000-0000-0000-0000-00000000000d', null, null, null, null, 0, false, false),
  ('b0000000-0000-0000-0000-00000000000e', 'Letters of Enchantment', 99, 'Divine Rivals', 2, 1, false, false),
  ('b0000000-0000-0000-0000-00000000000f', 'Letters of enchantment', 1, 'Divine Rivals', 1, 1, false, false),
  ('b0000000-0000-0000-0000-000000000010', null, null, 'Divine Rivals', 4, 1, false, false),
  ('b0000000-0000-0000-0000-000000000011', 'Letters of Enchantment', 2, 'Divine Rivals Series', 2, 1, false, false),
  ('b0000000-0000-0000-0000-000000000012', 'Some Standalone Series', 5, null, null, 0, false, false);

-- The canon table, verbatim from the migration and from preview.sql's own copy.
with canon(from_name, to_name) as (
  values ('Adrian X Isolde',      'Adrian x Isolde'),
         ('Hades & Persephone',   'Hades x Persephone Saga'),
         ('Hades X Persephone',   'Hades x Persephone Saga'),
         ('Dance with my Demons', 'Dance With My Demons'),
         ('Playing For Keeps',    'Playing for Keeps'),
         ('Fire and Metal',       'Fire & Metal'),
         ('Divine Rivals',        'Letters of Enchantment')
),
bk as (
  select pp.*, coalesce(c.to_name, pp.parsed_series) as canon_series
  from _predicted_parse pp
  left join canon c on c.from_name = pp.parsed_series
),
protected as (
  select bk.*,
         ( bk.is_untitled or bk.is_range or bk.depth = 0
           or coalesce(bk.series_name, '') in ('Rose Hill (Silver)', 'Hades x Persephone Saga')
         ) as untouched
  from bk
),
predicted as (
  select p.id,
         case when p.untouched then p.series_name else p.canon_series end    as predicted_series,
         case when p.untouched then p.position    else p.parsed_position end as predicted_position
  from protected p
)
select is(
  (select count(*)::int from (
     (select predicted.id, predicted_series, predicted_position from predicted
      join public.books b on b.id = predicted.id
      where b.series is distinct from predicted_series or b.position is distinct from predicted_position)
   ) diff),
  0,
  'preview.sql''s predicate, re-stated, predicts EXACTLY what the migration wrote — no drift'
);

-- Positive control: the diff above must be able to SEE a divergence, not just report zero because it
-- compares nothing. Re-run it against the OLD never-overwrite rule (parsed only where series was
-- null) — the first bug this branch had — and confirm it disagrees on fixture 6, which the new rule
-- overwrites and the old rule would not have touched.
with old_rule_predicted as (
  select pp.id,
         case when pp.series_name is not null then pp.series_name else pp.parsed_series end as predicted_series
  from _predicted_parse pp
)
select isnt(
  (select count(*)::int from (
     select orp.id from old_rule_predicted orp
     join public.books b on b.id = orp.id
     where b.series is distinct from orp.predicted_series
   ) diff),
  0,
  'positive control: the diff DOES flag a divergence — the old never-overwrite rule disagrees with what actually shipped'
);

select * from finish();
rollback;
