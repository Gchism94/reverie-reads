-- sync_book_series — the last atomicity gap in the series write story (docs/tasks/
-- task-series-integrity-mechanism.md Phase 3's own re-audit; investigated and approved before this
-- migration was written).
--
-- ▌▌ NEW MIGRATION, NEW FUNCTION. 20260814010000 (set_series_order) is already deployed to
-- ▌ production — confirmed against two independent records this session: the 2026-08-09 deploy
-- ▌ check ("20260813010000, 20260814010000 and 20260815010000 are all deployed"), and
-- ▌ docs/queries/acotar-fix.sql actually EXECUTING against production on 2026-08-10, which calls
-- ▌ set_series_order twice and succeeded — direct proof of the function's live behavior, not just a
-- ▌ list entry. That migration is therefore immutable history; nothing below edits it. This is a
-- ▌ standalone function that CALLS set_series_order internally, same transaction, same owner.
--
-- ── THE DEFECT ───────────────────────────────────────────────────────────────────────────────────
-- The book page's save (apps/web/src/book/dialogs.tsx) ran `updateBook.mutateAsync` (writes
-- books.title/isbn/series/etc.) then `syncBookSeries.mutateAsync` (retires the old slot via a raw
-- series_entries update, then set_series_order for the new slot) as two separate, unguarded async
-- calls. A failure between them left books.series ALREADY changed to the new name with the OLD
-- series slot still LIVE — and unlike remove_series_entry's defect, revive-on-refresh does not
-- apply here (the tombstone step never ran, so there is no tombstone to revive): nothing removes a
-- live entry whose book stopped naming the series, permanently. This is the #65 symptom
-- 20260725010000 was written to eliminate, reachable again by failure rather than by design.
--
-- WHY THE OLD RPC (remove_series_entry) CANNOT BE REUSED AS-IS. It nulls books.series — which, by
-- the time retirement would run in the old client sequence, updateBook had already overwritten
-- with the NEW name. Retirement has to key off the OLD name, read from the row itself before
-- anything changes it. This function reads that OLD name FIRST, inside its own transaction, before
-- touching anything — never from a client-passed value, which closes a second, independent bug:
-- the old useSyncBookSeries read `book.series` from the CLIENT'S CACHED Book (series.ts:603), so a
-- stale cache could retire the wrong slot. Same lesson remove_series_entry already drew about
-- book_id, applied here to the series name.
--
-- ── WHY delegate TO set_series_order RATHER THAN DUPLICATE IT ───────────────────────────────────
-- Position and length are ONE fact each, with ONE write path (20260814010000's own header: "three
-- writers for two facts" is exactly the shape this migration refuses to reintroduce a third of).
-- When a live entry already links this book in the target series, this function hands position
-- and length to set_series_order via a plain internal call — same transaction (a function body is
-- not a savepoint boundary; nothing here catches anything, so a failure inside the nested call
-- aborts this function's transaction too), same owner (`postgres` locally-verified — both functions
-- are owned by the migration-applying role, so the nested call needs no extra grant: EXECUTE from
-- authenticated is what the ORIGINAL caller needed, not what postgres calling postgres needs).
-- set_series_order's own park-then-write pass, its `user_edited`-respecting origin contract, and
-- its collision raise (a target position already held) all apply unchanged and unduplicated.
--
-- ── SCOPE BOUNDARY: NO SERIES ROW OR ENTRY CREATION HERE ─────────────────────────────────────────
-- If no `series` row exists for the new name, or one exists but no LIVE entry yet links this book,
-- this function writes the claim directly to the book row (books.position, books.series_count) —
-- exactly today's existing claim-path behaviour (series.ts's own comment on the two paths,
-- unchanged in spirit). It does NOT create the series row or the entry: `getOrCreateSeries` stays
-- client-side, because it carries the Tier-1 near-match prevention (`seriesNameKey`, TypeScript,
-- fix/series-consolidation) — duplicating that normalization here would drift from it the moment
-- either copy changed. Reconciliation seeds the entry from the claim later, same as always.
--
-- ── THE THREE PATHS BOOK-PAGE SAVE CAN TAKE, ALL ONE CALL ────────────────────────────────────────
--   REASSIGN (old name -> new, non-empty): tombstone the old live slot, write the new name, then
--     place (delegate or claim, per the series-row/live-entry test above).
--   CLEAR (new is null/empty): tombstone the old live slot, write series = NULL, and clear the
--     synced copies that no longer describe anything — books.position, books.series_count. status
--     is DELIBERATELY untouched: whether a removal should also clear status is a recorded, separate
--     product decision (docs/backlog/BACKLOG.md, the "Series of N pill survives removal" item),
--     not this function's to resolve by side effect.
--   UNCHANGED name (only the number/length edited): the retirement step is skipped (old = new, so
--     nothing left), but placement still runs — same call, degenerate case, no special path.
--
-- ── THE TOMBSTONE SHAPE MUST NEVER DRIFT FROM remove_series_entry's ──────────────────────────────
-- removed_at = now(), book_id = null, user_edited = true — byte-identical to remove_series_entry's
-- SQL and the removalPatch() TS copy it replaces (series.ts, now deleted: this was its last caller).
-- Two independent implementations of "what a removal means" is exactly the drift removalPatch's own
-- comment warned about; this migration is what finally lets that warning close for good.
--
-- ── OWNERSHIP: THE BOUNDARY IS WRITTEN OUT, NOT INHERITED ────────────────────────────────────────
-- security definer bypasses RLS. The book lookup below folds ownership into its WHERE clause,
-- remove_series_entry's own idiom: not-found means "not yours" without a second raise. Every series
-- and series_entries lookup this function performs is additionally scoped `owner_id = uid` — belt
-- and suspenders matching set_series_order's own re-checks at each step, not transitive trust in an
-- id resolved two lines earlier.
create or replace function public.sync_book_series(
  p_book uuid,
  p_new_series text,
  p_position numeric,
  p_length int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := (select auth.uid());
  v_old_name text;
  -- '' collapses to null, same "clearing to null/empty" the caller and the header both describe.
  v_new_name text := nullif(trim(coalesce(p_new_series, '')), '');
  v_old_sid uuid;
  v_new_sid uuid;
  v_entry uuid;
  v_final_position numeric;
begin
  -- 0. The book, and its CURRENT series — read here, before anything below can change it. `uid`
  --    null (unauthenticated) matches nothing, so that caller stops here too.
  select series into v_old_name from public.books where id = p_book and owner_id = uid;
  if not found then
    raise exception 'not owner of book';
  end if;

  -- 1-2. Retire the OLD live slot — only when the name is actually changing (covers both reassign
  --      and clear; the unchanged-name path has nothing to retire).
  if v_old_name is not null and v_old_name <> '' and v_old_name is distinct from v_new_name then
    select id into v_old_sid from public.series where owner_id = uid and name = v_old_name;
    if v_old_sid is not null then
      update public.series_entries
         set removed_at = now(), book_id = null, user_edited = true
       where series_id = v_old_sid and book_id = p_book and removed_at is null;
    end if;
  end if;

  if v_new_name is null then
    -- CLEAR is "was naming a series, now isn't" — not merely "the new value is empty". A book
    -- that never had a series (v_old_name already null/empty) and never gains one here is not
    -- LEAVING anything; position/length on it are ordinary claims a reader can set with no series
    -- membership at all (write-integrity.spec.ts's month-refusal test guards exactly this: typing
    -- a bare "Series length" on a book with no series name must not be silently discarded — it
    -- was, once, and that regression is the test's own canary). Only a REAL clear wipes the synced
    -- copies; status stays untouched either way — see the header.
    if v_old_name is not null and v_old_name <> '' then
      update public.books set series = null, position = null, series_count = null where id = p_book;
    else
      update public.books set series = null, position = p_position, series_count = p_length where id = p_book;
    end if;
    return;
  end if;

  -- 3-4. REASSIGN or UNCHANGED-name: write the new name, and place the number/length either
  --      through the one write path (a series row AND a live entry already exist) or as a direct
  --      claim (either is missing). The two conditions are independent on purpose — position is
  --      unclaimed whenever there is no live entry, length is unclaimed whenever there is no series
  --      row at all — matching the app's existing `!entryId` / `!sid` split exactly rather than
  --      collapsing them into one.
  select id into v_new_sid from public.series where owner_id = uid and name = v_new_name;
  if v_new_sid is not null then
    select id into v_entry from public.series_entries
     where series_id = v_new_sid and book_id = p_book and owner_id = uid and removed_at is null;
  end if;

  if v_new_sid is not null and v_entry is not null then
    v_final_position := p_position;
    if v_final_position is null then
      -- Cleared: don't leave the old number standing. Send it to the end — the same rule
      -- useSyncBookSeries applied client-side, moved here because the whole call is now one RPC.
      select floor(coalesce(max(position), 0)) + 1 into v_final_position
        from public.series_entries where series_id = v_new_sid and removed_at is null;
    end if;
    perform public.set_series_order(
      v_new_sid,
      jsonb_build_array(jsonb_build_object('entry_id', v_entry, 'position', v_final_position)),
      'reader',
      jsonb_build_object('length', p_length)
    );
  end if;

  update public.books
     set series = v_new_name,
         position = case when v_entry is null then p_position else position end,
         series_count = case when v_new_sid is null then p_length else series_count end
   where id = p_book;
end;
$$;

comment on function public.sync_book_series(uuid, text, numeric, int) is
  'Atomic book-page series save: retire the old live slot (read from the row, never the caller), '
  'write books.series, and place the number/length — delegated to set_series_order when a series '
  'row and live entry already exist, else claimed directly on the book row. Creates neither a '
  'series row nor an entry.';

-- Postgres grants EXECUTE to PUBLIC on every new function; the revoke is the boundary-shaped half,
-- the grant is additive (AGENTS.md). `from anon` by name too, matching every sibling function here.
revoke execute on function public.sync_book_series(uuid, text, numeric, int) from public;
revoke execute on function public.sync_book_series(uuid, text, numeric, int) from anon;
grant  execute on function public.sync_book_series(uuid, text, numeric, int) to authenticated;
