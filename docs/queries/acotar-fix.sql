-- ACOTAR position correction — the one-incident fix for /series/A Court of Thorns and Roses.
--
-- STAGED — DO NOT RUN until the owner has read the pre-flight output below and confirmed it
-- matches the state this script's guards assert. No Code session runs this. The owner runs it by
-- hand, against production, after review.
--
-- ── Why a hand-run script under docs/queries/, not a migration ──────────────────────────────────
-- Same discipline as iron-flame-merge.sql and empyrean-position-fix: a one-time repair scoped to
-- row ids that mean nothing on any other database. `pnpm db:migrate` pushes every file in
-- supabase/migrations/ on every deploy, so a repair there would re-fire forever. The DURABLE half
-- of this incident already shipped as migrations — set_series_order (20260814010000) is the
-- chokepoint that stops position/`books.position` drifting apart again. This file is only the
-- repair that mechanism was built to carry.
--
-- ══ THE RULING THIS IMPLEMENTS ═══════════════════════════════════════════════════════════════════
-- docs/tasks/task-series-integrity-mechanism.md § Phase 4, stated whole so it cannot be restated
-- in pieces (the failure that already happened once — a session turn hybridised this order into
-- 3.5-for-Frost / 4-for-Silver-Flames, which is internally coherent and is exactly why it read as
-- plausible):
--
--   | #   | book                           | note                    |
--   | --- | ------------------------------ | ----------------------- |
--   | 1   | A Court of Thorns and Roses    | already correct         |
--   | 2   | A Court of Mist and Fury       | already correct         |
--   | 3   | A Court of Wings and Ruin      | ghost dd33f8da, MOVED   |
--   | 3.5 | A Court of Frost and Starlight | ca881b76, interquel     |
--   | _4_ | —                              | **deliberately vacant** |
--   | 5   | A Court of Silver Flames       | 60ca2fac                |
--
-- POSITION 4 IS DELIBERATELY VACANT and that is the load-bearing detail: a reader who knows only
-- "novellas get .5" reconstructs 1, 2, 3, 3.5, 4 every time, because that is the more natural
-- scheme. It is the owner's convention (novellas take `.5`; the main sequence keeps the integer it
-- would have had), NOT sourced from Wikidata (3 / 3.1 / 4) and NOT from Wikipedia. Attributed to
-- neither, per the standing sourcing discipline. `series.length` = 5 for the same reason: five
-- books in the main sequence, the highest ordinal is 5.
--
-- Plus one removal: 4b005709, a Mist-and-Fury GHOST at position 2.5, redundant — the real
-- Mist-and-Fury book row is already linked live at position 2. Guard #5 below re-proves that on
-- the live database rather than trusting this sentence.
--
-- ══ THE THREE FINDINGS THAT MAKE THIS SAFE — each confirmed, none assumed ════════════════════════
-- Established by docs/queries/acotar-full-state.sql and docs/queries/acotar-followup.sql, run
-- against production 2026-08-09:
--
-- 1. CASE (C) — no `books` row for "A Court of Wings and Ruin" exists under this owner, confirmed
--    on two independent axes (by title, and by the books' own `series` string, which catches a row
--    filed under an unexpected title). The ghost dd33f8da is therefore the library's ONLY record of
--    that book. The owner owns the physical copy; it was never catalogued. **This is why the ghost
--    is MOVED to position 3 and not tombstoned** — tombstoning it would destroy the only record
--    rather than clean up a duplicate.
--
-- 2. THE SECOND SERIES ROW IS A REAL, DISTINCT THING — NOT this series under a variant name.
--    2bec23ba ("ACOTAR", created 2026-08-04) carries exactly one live entry, "ACOTAR 6", a
--    legitimate ghost for the unreleased sixth book. It is NOT Wings and Ruin hiding under a
--    variant series name, which was the one reading that would have made this a series-identity
--    split (case (a)) with a completely different correct fix. **The series-record merge
--    (aa4e251e vs 2bec23ba) is real and confirmed, and is explicitly OUT OF SCOPE here** — it needs
--    task-series-consolidation.md's three-outcome decision table, not this file. Nothing below
--    touches 2bec23ba or its entry; the post-run audit asserts it was left alone.
--
-- 3. NO TOMBSTONE-REVIVAL RISK. The target series carries one tombstone — 09357eb3, "A Court of
--    Thorns and Roses eBook Bundle", position 11, removed 2026-08-03 — and `useSeriesDetail`
--    revives a tombstone whose title matches a book still naming the series. Block 3 of the
--    follow-up returned ZERO rows: no bundle/boxed/box-set/collection book exists under this owner,
--    so nothing can match it and the next series-page open cannot resurrect a slot at position 11
--    outside the corrected order. Nothing here touches that tombstone.
--
-- ══ user_edited: A NAMED, OWNER-REVIEWED OVERRIDE — NOT ROUTINE CLEANUP ══════════════════════════
-- dd33f8da carries `user_edited = true` (placed 2026-07-15). AGENTS.md's hard rule is that a
-- reader-set position is never silently overwritten, and Block 8 of the integrity audit had ruled
-- this specific row NOT to be auto-corrected. That ruling stands and is not reversed by a
-- mechanism. What happened instead: the owner reviewed this row on 2026-08-09 with new information
-- (they own the physical book, so the 2026-07-15 placement is superseded) and overrode their own
-- earlier choice. That is what the protection is designed to REQUIRE rather than prevent — it
-- guards against silent algorithmic override, never against the reader changing their mind. Guard
-- #3 asserts the flag is still `true`, so that if it has since been cleared, this script stops and
-- the override is re-decided rather than applied to a row that no longer means what it meant.
--
-- WHY `p_origin = 'reader'` AND NOT `'source'`. Two reasons, both load-bearing:
--   · 'source' reads each row's STORED user_edited and DROPS the true ones from the batch. dd33f8da
--     would be silently skipped and the call would still return success — a partial write wearing a
--     green result, the exact failure shape this whole arc exists to close. (It is reported in
--     `skipped_user_edited`, which is why Step 1 asserts that count is 0 rather than reading past
--     it.)
--   · 'reader' also RAISES user_edited to true on ca881b76 and 60ca2fac. That is intended, not a
--     side effect: this order deliberately disagrees with Wikidata (which would renumber Silver
--     Flames to 4 and put nothing at 5), so the rows must be marked reader-arranged or the next
--     source refresh undoes the correction. Nothing in set_series_order can lower the flag.
--
-- ══ DEPLOYMENT PREREQUISITE — verify, do not assume ══════════════════════════════════════════════
-- This script calls two RPCs that must already exist on the target database:
--   · public.set_series_order(uuid, jsonb, text, jsonb)  — 20260814010000
--   · public.remove_series_entry(uuid)                   — 20260731010000
-- and depends on `public.series.length` — 20260813010000. All three were confirmed present against
-- `supabase migration list --linked` on 2026-08-09 (the remote column, not the claim). Re-check
-- before running; a deploy verified once is not a deploy verified now:
--
--   supabase migration list --linked
--
-- 20260816010000 (`series_entries_position_uidx`) is deliberately HELD and absent from both
-- databases. Its absence changes nothing here — set_series_order's park-then-write pass exists to
-- survive that index and is simply redundant without it.
--
-- ══ HOW TO RUN ══════════════════════════════════════════════════════════════════════════════════
-- As a privileged role (the migration/superuser role), in one psql session, in this order:
--   1. Run the PRE-FLIGHT section alone. Read it. It writes nothing.
--   2. Only if it matches the expectations printed beside each block, run THE FIX.
--   3. Run the POST-RUN AUDIT and check the final `all_match` column is true.
--
-- Deliberately NOT run as `authenticated`: the two functions are `security definer`, so `auth.uid()`
-- — set below from `series.owner_id`, never hardcoded — is the boundary they enforce, not the
-- connected role. Running privileged also means every guard below sees the true row counts instead
-- of an RLS-filtered view of them, which is the difference between "the row is absent" and "the row
-- is invisible to me" (AGENTS.md: a check that cannot tell those apart passes in the safe-looking
-- direction).
--
-- ══ WHY THE ENTRY IDS ARE RESOLVED BY PREFIX ════════════════════════════════════════════════════
-- The audit output records these four entries by their first eight hex digits; the full uuids were
-- never pasted into the work record. Rather than invent the remaining 96 bits, each prefix is
-- resolved against the live table and must match EXACTLY ONE live entry OF THIS SERIES whose title
-- matches the book it is supposed to be. Zero matches or two matches abort. A 32-bit prefix
-- colliding inside one six-row series is implausible; the guard makes proceeding on one impossible.
-- If a TITLE guard trips, compare against the pre-flight output and confirm the row's identity —
-- do not loosen the pattern to make the script run.

\set ON_ERROR_STOP on

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- PRE-FLIGHT (no writes — every statement here is a SELECT). Run this section first, alone.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

-- P1. The full live order as it stands, plus the tombstone. This is the before-picture the
--     post-run audit is compared against.
-- Expected: 6 live entries; Thorns at 1; the real Mist-and-Fury book linked at 2; a Mist ghost
--     (book_id null) at 2.5; the Wings ghost dd33f8da (book_id null, user_edited true); Frost
--     ca881b76 and Silver Flames 60ca2fac somewhere above; and one tombstone, 09357eb3, the eBook
--     Bundle at position 11.
select 'P1. entries before' as section,
       e.id                    as entry_id,
       e.position,
       e.title                 as entry_title,
       e.book_id,
       b.title                 as book_title,
       b.position              as book_position,
       b.series_count          as book_series_count,
       e.user_edited,
       e.source,
       e.removed_at,
       (e.removed_at is null)  as is_live
from public.series_entries e
left join public.books b on b.id = e.book_id
where e.series_id = 'aa4e251e-be7a-45bf-a66b-78bbf9406e71'::uuid
order by (e.removed_at is null) desc, e.position, e.created_at;

-- P2. What each prefix in this script resolves to, and whether it resolves uniquely. If any
--     `n_live_matches` is not exactly 1, STOP — the fix cannot name that row.
with target as (select 'aa4e251e-be7a-45bf-a66b-78bbf9406e71'::uuid as id),
     wanted(pfx, role_in_fix, expect_title_like) as (
       values ('dd33f8da', 'move to 3   (Wings and Ruin ghost)',   '%wings%ruin%'),
              ('ca881b76', 'move to 3.5 (Frost and Starlight)',    '%frost%starlight%'),
              ('60ca2fac', 'move to 5   (Silver Flames)',          '%silver%flames%'),
              ('4b005709', 'REMOVE      (Mist and Fury ghost)',    '%mist%fury%')
     )
select 'P2. prefix resolution' as section,
       w.pfx,
       w.role_in_fix,
       (select count(*) from public.series_entries e, target t
         where e.series_id = t.id and e.removed_at is null
           and e.id::text like w.pfx || '%')                          as n_live_matches,
       (select e.id from public.series_entries e, target t
         where e.series_id = t.id and e.removed_at is null
           and e.id::text like w.pfx || '%')                          as resolved_entry_id,
       (select e.title from public.series_entries e, target t
         where e.series_id = t.id and e.removed_at is null
           and e.id::text like w.pfx || '%')                          as resolved_title,
       w.expect_title_like                                            as title_must_match,
       (select e.book_id from public.series_entries e, target t
         where e.series_id = t.id and e.removed_at is null
           and e.id::text like w.pfx || '%')                          as book_id,
       (select e.user_edited from public.series_entries e, target t
         where e.series_id = t.id and e.removed_at is null
           and e.id::text like w.pfx || '%')                          as user_edited
from wanted w
order by w.pfx;

-- P3. The rows this fix names NEITHER in the reorder NOR in the removal — every live entry it
--     leaves entirely alone. Their positions must be exactly 1, 2: the correction places rows at
--     3, 3.5 and 5 and leaves 4 vacant, so an untouched row already sitting on any of those four
--     values would either collide or occupy the deliberately-empty slot.
-- Expected: exactly two rows — Thorns at 1, and Mist and Fury at 2 linked to a real book. (The
--     Mist ghost at 2.5 is excluded here because step 2 removes it; it is not "left alone".)
select 'P3. rows outside the batch' as section,
       e.id       as entry_id,
       e.position,
       e.title,
       e.book_id,
       e.user_edited
from public.series_entries e
where e.series_id = 'aa4e251e-be7a-45bf-a66b-78bbf9406e71'::uuid
  and e.removed_at is null
  and e.id::text not like 'dd33f8da%'
  and e.id::text not like 'ca881b76%'
  and e.id::text not like '60ca2fac%'
  and e.id::text not like '4b005709%'
order by e.position;

-- P4. The other series row, recorded so the post-run audit can prove it was untouched.
-- Expected: one row, 2bec23ba / "ACOTAR", 1 live entry ("ACOTAR 6"), 0 tombstones. OUT OF SCOPE.
select 'P4. out-of-scope series row' as section,
       s.id,
       s.name,
       s.length,
       s.created_at,
       (select count(*) from public.series_entries e
         where e.series_id = s.id and e.removed_at is null)     as live_entries,
       (select count(*) from public.series_entries e
         where e.series_id = s.id and e.removed_at is not null) as tombstones
from public.series s
where s.id = '2bec23ba-a016-4e97-aa60-e7dfff528fa7'::uuid;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- THE FIX (writes). Run only after the pre-flight matches the expectations above.
-- Everything below is one transaction: both RPC calls land together or neither does.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── GUARDS. Refuse on any surprise, before a single write. ──────────────────────────────────────
-- Every check counts rows as the privileged role, so a zero count means the row is genuinely
-- absent rather than hidden from the querying role. Each raise names the value it actually saw, so
-- a trip is diagnosable against the pre-flight output rather than just fatal.
do $$
declare
  v_series   constant uuid := 'aa4e251e-be7a-45bf-a66b-78bbf9406e71';
  v_other    constant uuid := '2bec23ba-a016-4e97-aa60-e7dfff528fa7';
  v_owner    uuid;
  n          int;
  v_positions text;
begin
  -- #0. The series exists and has an owner to derive auth.uid() from.
  select owner_id into v_owner from public.series where id = v_series;
  if v_owner is null then
    raise exception 'guard #0: series % not found (or owner_id null) — wrong database?', v_series;
  end if;

  -- #1. Six live entries, one tombstone. The shape both prior reads established. A different count
  --     means the series changed after those reads and the correction was computed against a state
  --     that no longer exists.
  select count(*) into n from public.series_entries
   where series_id = v_series and removed_at is null;
  if n <> 6 then
    raise exception 'guard #1: expected 6 live entries, found % — re-run the pre-flight; the order changed since it was read', n;
  end if;
  select count(*) into n from public.series_entries
   where series_id = v_series and removed_at is not null;
  if n <> 1 then
    raise exception 'guard #1b: expected exactly 1 tombstone (09357eb3, the eBook Bundle), found %', n;
  end if;

  -- #2. Each of the four prefixes resolves to exactly one live entry of THIS series, with the title
  --     of the book it is supposed to be. Title AND prefix, because either alone is a proxy.
  select count(*) into n from public.series_entries
   where series_id = v_series and removed_at is null
     and id::text like 'dd33f8da%' and title ilike '%wings%ruin%';
  if n <> 1 then raise exception 'guard #2a: dd33f8da did not resolve to exactly one live Wings-and-Ruin entry (got %)', n; end if;

  select count(*) into n from public.series_entries
   where series_id = v_series and removed_at is null
     and id::text like 'ca881b76%' and title ilike '%frost%starlight%';
  if n <> 1 then raise exception 'guard #2b: ca881b76 did not resolve to exactly one live Frost-and-Starlight entry (got %)', n; end if;

  select count(*) into n from public.series_entries
   where series_id = v_series and removed_at is null
     and id::text like '60ca2fac%' and title ilike '%silver%flames%';
  if n <> 1 then raise exception 'guard #2c: 60ca2fac did not resolve to exactly one live Silver-Flames entry (got %)', n; end if;

  select count(*) into n from public.series_entries
   where series_id = v_series and removed_at is null
     and id::text like '4b005709%' and title ilike '%mist%fury%';
  if n <> 1 then raise exception 'guard #2d: 4b005709 did not resolve to exactly one live Mist-and-Fury entry (got %)', n; end if;

  -- #3. The Wings ghost is still a ghost, and still carries the flag the owner reviewed. If
  --     book_id is now set, case (c) no longer holds — a books row appeared and the right fix is a
  --     link, not a move. If user_edited is now false, the row the override was granted for is not
  --     the row in front of us.
  select count(*) into n from public.series_entries
   where series_id = v_series and removed_at is null
     and id::text like 'dd33f8da%' and book_id is null and user_edited is true;
  if n <> 1 then
    raise exception 'guard #3: dd33f8da is no longer (book_id null AND user_edited true) — the 2026-08-09 owner override was granted for that exact row; re-decide before moving it';
  end if;

  -- #4. THE REMOVAL TARGET IS A GHOST. remove_series_entry clears `books.series` on whatever the
  --     entry links to. If 4b005709 has somehow acquired the real Mist-and-Fury book_id, running it
  --     would strip that book out of the series entirely. This is the single most destructive thing
  --     this file could do, so it is checked directly rather than inferred from "it was a ghost
  --     when we looked".
  --     Measured during the local rehearsal: that exact scenario is in fact structurally impossible
  --     — `series_entries_book_uidx` is UNIQUE on (series_id, book_id) where book_id is not null, so
  --     4b005709 cannot point at the Mist book that position 2 already links. The guard is kept
  --     anyway, because the index only rules out the SAME book: a ghost pointing at any OTHER book
  --     of this owner is legal, and removing it would clear that book's series field instead. The
  --     mutation test used the colouring book to prove the guard stops it.
  select count(*) into n from public.series_entries
   where series_id = v_series and removed_at is null
     and id::text like '4b005709%' and book_id is null;
  if n <> 1 then
    raise exception 'guard #4: 4b005709 is not a ghost (book_id is not null) — removing it would clear a real book''s series field; STOP';
  end if;

  -- #5. ...and it is redundant because the REAL Mist-and-Fury is already linked live at 2. That is
  --     the entire justification for removing it; assert it rather than restate it.
  select count(*) into n
    from public.series_entries e
    join public.books b on b.id = e.book_id
   where e.series_id = v_series and e.removed_at is null
     and e.position = 2 and b.title ilike '%mist%fury%';
  if n <> 1 then
    raise exception 'guard #5: no real Mist-and-Fury book linked live at position 2 (got %) — the ghost is not redundant; STOP', n;
  end if;

  -- #6. Nothing this script leaves alone occupies 3, 3.5, 5 (they are targets) or 4 (it must end
  --     vacant). set_series_order raises on the first three itself; this says which row, and covers
  --     4, which it has no reason to care about but this ruling does. The excluded set is all FOUR
  --     named entries — the removal target included, since it does not survive to collide.
  select string_agg(position::text, ', ' order by position) into v_positions
    from public.series_entries
   where series_id = v_series and removed_at is null
     and id::text not like 'dd33f8da%'
     and id::text not like 'ca881b76%'
     and id::text not like '60ca2fac%'
     and id::text not like '4b005709%';
  if v_positions is distinct from '1, 2' then
    raise exception 'guard #6: the live rows this fix leaves alone sit at [%], expected [1, 2] — the correction assumes Thorns at 1 and Mist at 2 and would collide or fill the vacant 4 otherwise', v_positions;
  end if;

  -- #7. The out-of-scope series row is where the follow-up left it. Recorded now so the post-run
  --     audit's "untouched" claim compares against a measured before, not an assumption.
  select count(*) into n from public.series_entries
   where series_id = v_other and removed_at is null;
  if n <> 1 then
    raise exception 'guard #7: series 2bec23ba has % live entries, expected 1 — its state changed; the merge is out of scope but its shape is a premise here', n;
  end if;

  raise notice 'guards OK: owner=%, 6 live + 1 tombstone, four prefixes resolved, dd33f8da still a flagged ghost, 4b005709 still a ghost, real Mist linked at 2, untouched rows at 1 and 2 only', v_owner;
end $$;

-- ── auth.uid(), derived from the series row. Never hardcoded. ───────────────────────────────────
-- Both RPCs are `security definer` and gate on `auth.uid()`, which they read from this setting.
-- `true` scopes it to this transaction. If the subquery matched nothing, set_config never runs and
-- the setting stays unset — a silent no-op that would surface later as an opaque "not owner of
-- series", so the next block asserts it actually got set.
select set_config(
         'request.jwt.claims',
         json_build_object('sub', s.owner_id::text, 'role', 'authenticated')::text,
         true) as jwt_claims_set
from public.series s
where s.id = 'aa4e251e-be7a-45bf-a66b-78bbf9406e71'::uuid;

do $$
begin
  if nullif(current_setting('request.jwt.claims', true), '') is null then
    raise exception 'jwt claims are unset — the owner_id subquery matched no row, so set_config never executed';
  end if;
  if (select auth.uid()) is distinct from
     (select owner_id from public.series where id = 'aa4e251e-be7a-45bf-a66b-78bbf9406e71'::uuid) then
    raise exception 'auth.uid() (%) does not resolve to the series owner — the RPCs would refuse or, worse, act as someone else', (select auth.uid());
  end if;
end $$;

-- ── STEP 1. The order, in one call. ─────────────────────────────────────────────────────────────
-- The slot array is built server-side from the resolved prefixes, so no uuid is transcribed by
-- hand. The returned jsonb is asserted, not just printed: `moved` must be 3 and
-- `skipped_user_edited` must be 0, or the call succeeded while doing less than it was asked to —
-- which is precisely the shape a `p_origin = 'source'` call would have produced here.
do $$
declare
  v_series constant uuid := 'aa4e251e-be7a-45bf-a66b-78bbf9406e71';
  v_slots  jsonb;
  v_res    jsonb;
begin
  select jsonb_agg(jsonb_build_object('entry_id', x.id, 'position', x.pos) order by x.pos)
    into v_slots
  from (
    select e.id, w.pos
    from public.series_entries e
    join (values ('dd33f8da', 3::numeric),
                 ('ca881b76', 3.5),
                 ('60ca2fac', 5)) w(pfx, pos)
      on e.id::text like w.pfx || '%'
    where e.series_id = v_series and e.removed_at is null
  ) x;

  if v_slots is null or jsonb_array_length(v_slots) <> 3 then
    raise exception 'step 1: built % slots, expected 3', coalesce(jsonb_array_length(v_slots), 0);
  end if;

  select public.set_series_order(v_series, v_slots, 'reader', '{"length": 5}'::jsonb) into v_res;
  raise notice 'set_series_order -> %', v_res;

  if (v_res ->> 'moved')::int <> 3 then
    raise exception 'step 1: moved=%, expected 3 — %', v_res ->> 'moved', v_res;
  end if;
  if (v_res ->> 'skipped_user_edited')::int <> 0 then
    raise exception 'step 1: skipped_user_edited=% — a reader-arranged row was dropped from the batch, so this write is partial: %',
      v_res ->> 'skipped_user_edited', v_res;
  end if;
  if (v_res ->> 'length_set')::boolean is not true then
    raise exception 'step 1: length_set was not true — series.length did not get 5: %', v_res;
  end if;
  -- `books_synced` is deliberately NOT asserted to a fixed number: it counts only books whose
  -- position actually changed, so it is legitimately 0, 1 or 2 depending on how far books.position
  -- had already drifted. The post-run audit checks the resulting values instead of the delta.
end $$;

-- ── STEP 2. The redundant Mist-and-Fury ghost. ──────────────────────────────────────────────────
-- `into strict` is the resolution guard: zero rows raises NO_DATA_FOUND, two raises TOO_MANY_ROWS.
-- Neither can silently pass a wrong id to a function that tombstones what it is given.
do $$
declare
  v_series constant uuid := 'aa4e251e-be7a-45bf-a66b-78bbf9406e71';
  v_ghost  uuid;
  n        int;
begin
  select e.id into strict v_ghost
  from public.series_entries e
  where e.series_id = v_series and e.removed_at is null
    and e.id::text like '4b005709%' and e.title ilike '%mist%fury%';

  perform public.remove_series_entry(v_ghost);

  -- Assert the tombstone exists rather than trusting a void return. `removed_at is not null` is
  -- written as `ok(...)`-shaped predicate inside the count, so a row that vanished entirely fails
  -- here instead of comparing NULL to NULL and passing.
  select count(*) into n from public.series_entries
   where id = v_ghost and removed_at is not null and book_id is null;
  if n <> 1 then
    raise exception 'step 2: % is not tombstoned after remove_series_entry (got % matching rows)', v_ghost, n;
  end if;
  raise notice 'removed redundant Mist-and-Fury ghost %', v_ghost;
end $$;

-- ── FINAL IN-TRANSACTION CHECK, before anything is durable. ─────────────────────────────────────
-- If this raises, the whole correction rolls back and production is untouched.
do $$
declare
  v_series constant uuid := 'aa4e251e-be7a-45bf-a66b-78bbf9406e71';
  v_positions text;
  v_len smallint;
begin
  select string_agg(position::text, ', ' order by position) into v_positions
    from public.series_entries
   where series_id = v_series and removed_at is null;
  if v_positions is distinct from '1, 2, 3, 3.5, 5' then
    raise exception 'final check: live order is [%], expected [1, 2, 3, 3.5, 5] (4 deliberately vacant) — rolling back', v_positions;
  end if;

  select length into v_len from public.series where id = v_series;
  if v_len is distinct from 5::smallint then
    raise exception 'final check: series.length is %, expected 5 — rolling back', v_len;
  end if;

  raise notice 'final check OK: positions [%], length 5. Committing.', v_positions;
end $$;

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- POST-RUN AUDIT (no writes). Run after commit.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

-- A1. The order as it now stands, with both synced copies beside it.
-- Expected: 1 Thorns / 2 Mist and Fury / 3 Wings and Ruin (ghost, book_id null) / 3.5 Frost and
--     Starlight / 5 Silver Flames. Nothing at 4. Two tombstones now: 09357eb3 (eBook Bundle,
--     untouched, position 11) and 4b005709 (the ghost this run removed).
select 'A1. entries after' as section,
       e.id                    as entry_id,
       e.position,
       e.title                 as entry_title,
       e.book_id,
       b.title                 as book_title,
       b.position              as book_position,
       b.series_count          as book_series_count,
       b.series                as book_series_string,
       e.user_edited,
       e.removed_at,
       (e.removed_at is null)  as is_live
from public.series_entries e
left join public.books b on b.id = e.book_id
where e.series_id = 'aa4e251e-be7a-45bf-a66b-78bbf9406e71'::uuid
order by (e.removed_at is null) desc, e.position, e.created_at;

-- A2. Every franchise book's series_count, including the ones set_series_order could NOT reach.
--     Its length sync matches books by the series NAME, so a book filed under a variant string
--     ("ACOTAR", "A Court of Thorns and Roses Series", …) keeps whatever series_count it had. That
--     is the name-fragmentation problem, out of scope here and not a failure of this run — but it
--     should be visible rather than discovered later.
with target as (
  select id, owner_id, name from public.series
  where id = 'aa4e251e-be7a-45bf-a66b-78bbf9406e71'::uuid
)
select 'A2. franchise books' as section,
       b.id            as book_id,
       b.title,
       b.series        as book_series_string,
       (b.series = t.name)  as name_matches_series_row,
       b.position      as book_position,
       b.series_count,
       (select count(*) from public.series_entries e
         where e.book_id = b.id and e.removed_at is null) as live_entry_links
from public.books b
join target t on b.owner_id = t.owner_id
where b.series ilike '%court%'
   or b.series ilike '%thorns%'
   or b.series ilike 'acotar%'
order by b.position nulls last, b.title;

-- A3. HEADLINE — one row. `all_match` is the thing to read; everything beside it is the evidence.
with target as (select 'aa4e251e-be7a-45bf-a66b-78bbf9406e71'::uuid as id),
     other  as (select '2bec23ba-a016-4e97-aa60-e7dfff528fa7'::uuid as id),
     m as (
       select
         (select string_agg(e.position::text, ', ' order by e.position)
            from public.series_entries e, target t
           where e.series_id = t.id and e.removed_at is null)            as live_positions,
         (select s.length from public.series s, target t where s.id = t.id) as series_length,
         (select count(*) from public.series_entries e, target t
           where e.series_id = t.id and e.removed_at is not null)        as tombstones,
         (select count(*) from public.series_entries e, target t
           where e.series_id = t.id and e.removed_at is null and e.position = 4) as rows_at_4,
         (select count(*) from public.series_entries e, target t
           where e.series_id = t.id and e.removed_at is null
             and e.id::text like 'dd33f8da%' and e.position = 3 and e.book_id is null
             and e.user_edited is true)                                  as wings_ghost_at_3,
         (select count(*) from public.series_entries e
           where e.id::text like '4b005709%' and e.removed_at is not null) as mist_ghost_removed,
         (select count(*) from public.series_entries e, other o
           where e.series_id = o.id and e.removed_at is null)            as other_series_live_entries,
         (select count(*) from public.series_entries e, other o
           where e.series_id = o.id and e.removed_at is not null)        as other_series_tombstones,
         (select count(*)
            from public.series_entries e
            join public.books b on b.id = e.book_id, target t
           where e.series_id = t.id and e.removed_at is null
             and b.position is distinct from e.position)                 as book_position_mismatches,
         (select count(*)
            from public.books b, target t, public.series s
           where s.id = t.id and b.owner_id = s.owner_id and b.series = s.name
             and b.series_count is distinct from 5::smallint)            as books_with_wrong_series_count
     )
select 'A3. headline' as section,
       m.*,
       (m.live_positions = '1, 2, 3, 3.5, 5'
        and m.series_length = 5
        and m.tombstones = 2
        and m.rows_at_4 = 0
        and m.wings_ghost_at_3 = 1
        and m.mist_ghost_removed = 1
        and m.other_series_live_entries = 1
        and m.other_series_tombstones = 0
        and m.book_position_mismatches = 0
        and m.books_with_wrong_series_count = 0) as all_match
from m;

-- If `all_match` is false, read the columns beside it — each one names its own failure:
--   live_positions <> '1, 2, 3, 3.5, 5' ..... the order did not land; compare against A1.
--   series_length <> 5 ...................... p_opts length did not apply.
--   rows_at_4 > 0 ........................... something occupies the deliberately-vacant slot.
--   wings_ghost_at_3 <> 1 ................... dd33f8da did not move, lost its flag, or acquired a
--                                             book_id (case (c) no longer holds — re-read the
--                                             full-state query before doing anything else).
--   mist_ghost_removed <> 1 ................. step 2 did not tombstone 4b005709.
--   other_series_* changed .................. this run touched 2bec23ba, which it must not; the
--                                             series merge is task-series-consolidation.md's.
--   book_position_mismatches > 0 ............ a linked book's position did not follow its entry —
--                                             the exact drift set_series_order exists to prevent.
--   books_with_wrong_series_count > 0 ....... a book naming this series exactly still disagrees
--                                             with length 5 (variant-named books are excluded by
--                                             design; see A2).
