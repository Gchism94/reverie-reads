-- series_user_chosen — provenance for books.series, the same problem cover_user_chosen already
-- solved for covers (20260714010000_cover_system.sql), never solved for series.
--
-- ▌▌ NEW MIGRATION. 20260817010000 (sync_book_series) and 20260731010000 (remove_series_entry) are
-- ▌ both already deployed to production — sync_book_series shipped and was deploy-confirmed this
-- ▌ session; remove_series_entry has been live since S3a/S3b. Both get a `create or replace` below,
-- ▌ SAME SIGNATURE, so their existing grants survive (verified locally: `create or replace` with an
-- ▌ unchanged argument list preserves prior revoke/grant state; only a genuine `drop function` +
-- ▌ recreate resets it to the PUBLIC-execute default, per AGENTS.md's standing rule).
--
-- ── THE GAP THIS CLOSES ──────────────────────────────────────────────────────────────────────────
-- Nothing in `books` records whether `series` came from the reader, an import, or an enrichment
-- match. `books.source` is row-level and `updated_at` is bumped by the enrichment sweep on
-- essentially every write, so neither can isolate a reader edit. Without the column, `series-backfill`
-- had to fall back to "parsed wins unconditionally, with two hardcoded exceptions" instead of "reader-
-- set always wins" — the provenance simply did not exist to check. This column exists so the next
-- conflict has something to consult, the way `cover_user_chosen` already lets `enrichmentCoverFill`
-- refuse to re-offer a cover the reader chose or deliberately cleared.
--
-- ── WHY remove_series_entry NEEDS THIS TOO, NOT JUST sync_book_series ────────────────────────────
-- This is the audit's actual finding, not a cosmetic addition. `remove_series_entry` nulls
-- `books.series` when a reader removes a linked slot from the series page. Without the flag, that
-- null reads to the enrichment sweep exactly like a book that never had a series — the next sweep's
-- title+author match re-fills the series the reader just removed, reopening #65's "removal doesn't
-- stick" symptom through a BRAND NEW door: the OLD #65 bug was reconciliation reviving a tombstone;
-- this one is enrichment re-writing a blank the reader emptied on purpose. Setting the flag alongside
-- `series = null` closes it the same way `cover_user_chosen` staying `true` on a cleared cover stops
-- enrichment from re-offering that cover.
alter table public.books add column if not exists series_user_chosen boolean not null default false;

-- ── sync_book_series: flag set TRUE on both branches that touch books.series as a reader gesture ──
-- REASSIGN (the final combined update, new name written) and CLEAR (both branches — a book leaving
-- a real series, and the "never had one, none typed" claim path) all originate from a reader typing
-- into the book-page dialog, so all set the flag. Everything else in the function is unchanged;
-- diff against 20260817010000 is additive only.
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
  v_new_name text := nullif(trim(coalesce(p_new_series, '')), '');
  v_old_sid uuid;
  v_new_sid uuid;
  v_entry uuid;
  v_final_position numeric;
begin
  select series into v_old_name from public.books where id = p_book and owner_id = uid;
  if not found then
    raise exception 'not owner of book';
  end if;

  if v_old_name is not null and v_old_name <> '' and v_old_name is distinct from v_new_name then
    select id into v_old_sid from public.series where owner_id = uid and name = v_old_name;
    if v_old_sid is not null then
      update public.series_entries
         set removed_at = now(), book_id = null, user_edited = true
       where series_id = v_old_sid and book_id = p_book and removed_at is null;
    end if;
  end if;

  if v_new_name is null then
    -- CLEAR, either branch: a reader-driven save landed on this row either way (typing into the
    -- Series field and leaving it blank, or clearing it after it named something) — series_user_chosen
    -- goes true so a later enrichment sweep cannot re-fill what was just, deliberately, left empty.
    if v_old_name is not null and v_old_name <> '' then
      update public.books
         set series = null, position = null, series_count = null, series_user_chosen = true
       where id = p_book;
    else
      update public.books
         set series = null, position = p_position, series_count = p_length, series_user_chosen = true
       where id = p_book;
    end if;
    return;
  end if;

  select id into v_new_sid from public.series where owner_id = uid and name = v_new_name;
  if v_new_sid is not null then
    select id into v_entry from public.series_entries
     where series_id = v_new_sid and book_id = p_book and owner_id = uid and removed_at is null;
  end if;

  if v_new_sid is not null and v_entry is not null then
    v_final_position := p_position;
    if v_final_position is null then
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
         series_count = case when v_new_sid is null then p_length else series_count end,
         series_user_chosen = true
   where id = p_book;
end;
$$;

comment on function public.sync_book_series(uuid, text, numeric, int) is
  'Atomic book-page series save: retire the old live slot (read from the row, never the caller), '
  'write books.series and series_user_chosen, and place the number/length — delegated to '
  'set_series_order when a series row and live entry already exist, else claimed directly on the '
  'book row. Creates neither a series row nor an entry.';

revoke execute on function public.sync_book_series(uuid, text, numeric, int) from public;
revoke execute on function public.sync_book_series(uuid, text, numeric, int) from anon;
grant  execute on function public.sync_book_series(uuid, text, numeric, int) to authenticated;

-- ── remove_series_entry: the same flag, on the same write, for the same reason ──────────────────
-- Only the `update public.books` line and the comment above it change; everything else — the
-- ownership checks, the tombstone shape, the ghost-slot skip — is byte-identical to 20260731010000.
create or replace function public.remove_series_entry(p_entry uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := (select auth.uid());
  v_book uuid;
begin
  select book_id into v_book
  from public.series_entries
  where id = p_entry and owner_id = uid;
  if not found then
    raise exception 'not owner of series entry';
  end if;

  if v_book is not null
     and not exists (select 1 from public.books where id = v_book and owner_id = uid)
  then
    raise exception 'not owner of linked book';
  end if;

  update public.series_entries
  set removed_at = now(), book_id = null, user_edited = true
  where id = p_entry;

  -- ...and, in the same transaction, the book stops naming the series AND that stop is marked a
  -- reader gesture — series_user_chosen = true, so the next enrichment sweep cannot silently re-fill
  -- the series this removal just cleared (the gap this migration exists to close). Ghost slots skip
  -- this: there is no book to un-name or flag.
  if v_book is not null then
    update public.books set series = null, series_user_chosen = true where id = v_book;
  end if;
end;
$$;

comment on function public.remove_series_entry(uuid) is
  'Retire one series slot atomically: tombstone the entry and clear the linked book''s series '
  '(marking it series_user_chosen) in a single transaction. book_id is read from the entry row, '
  'never supplied by the caller.';

revoke execute on function public.remove_series_entry(uuid) from public;
revoke execute on function public.remove_series_entry(uuid) from anon;
grant  execute on function public.remove_series_entry(uuid) to authenticated;
