-- Atomic series-entry removal (fix/atomic-series-removal, S3 of the reading-orders arc — the
-- oldest entry under docs/BACKLOG.md's "Real bugs, outstanding").
--
-- THE DEFECT. useRemoveEntry (apps/web/src/data/series.ts) did two sequential, independently
-- committed writes: tombstone the entry (removed_at stamped, book_id released, user_edited set),
-- then null books.series. A failure between them left the slot tombstoned while the book still
-- named the series — and that state is not merely stale. useSeriesDetail's reconciliation REVIVES
-- any tombstone whose title matches a book still naming the series, so the next read of the series
-- page silently UNDID the removal. This function makes the pair inseparable, which makes the state
-- reconciliation triggers on unconstructible by this path.
--
-- WHY book_id IS DERIVED HERE, NOT PASSED IN. The client used to send bookId from the cached entry
-- the component happened to be holding. A cache disagreeing with the row would clear the WRONG
-- book's series and leave the linked one still naming it — the fix reproducing the defect through
-- its own call. The entry row is the authority on what the slot links to, so book_id is read here,
-- inside the transaction, and the caller gets no vote. book_id null means a ghost slot: nothing to
-- un-name, and no books row is touched.
--
-- WHY THE OWNERSHIP CHECKS ARE WRITTEN OUT. security definer bypasses RLS, so the policies on
-- series_entries and books are NOT standing behind this function — the two raises below are the
-- entire boundary between one reader and another's rows. merge_books checks every row it touches
-- and this matches it: the entry, and separately the book it links to. That second check is not
-- ceremony. series_entries' insert policy constrains the entry's owner_id and its parent series but
-- places no constraint on book_id's owner, so an entry may legally link a book belonging to someone
-- else; without the check, the definer would clear that other reader's series field.
--
-- ATOMICITY IS THE PLPGSQL DEFAULT, NOT SOMETHING ADDED HERE: a function body with no exception
-- block is one transaction. Nothing below catches anything, deliberately — merge_books never says
-- the word "transaction" either. supabase/tests/series_removal_test.sql proves it rather than
-- asserting it: a before-update trigger forces the second write to fail and the test observes the
-- first write roll back.

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

  -- The tombstone. A soft delete, because a canonical source refresh would otherwise re-insert the
  -- ghost the reader just dismissed. book_id → null frees series_entries_book_uidx for a later
  -- re-add; user_edited keeps the source merge from repositioning a tombstone; now() replaces the
  -- client's own clock, which removes skew as an input to a stored timestamp.
  update public.series_entries
  set removed_at = now(), book_id = null, user_edited = true
  where id = p_entry;

  -- ...and, in the same transaction, the book stops naming the series so reconciliation cannot
  -- re-add it. Ghost slots skip this: there is no book to un-name.
  if v_book is not null then
    update public.books set series = null where id = v_book;
  end if;
end;
$$;

comment on function public.remove_series_entry(uuid) is
  'Retire one series slot atomically: tombstone the entry and clear the linked book''s series in a single transaction. book_id is read from the entry row, never supplied by the caller.';

grant execute on function public.remove_series_entry(uuid) to authenticated;
