-- A reader may permanently remove an incorrect PERSONAL series category. Books, reads, notes,
-- possession, other memberships, and the shared corpus are retained. This is not a standalone claim.
-- The existing archive transaction supplies ownership, ordered locks, projection demotion, and
-- the private overlay's connected-universe guard BEFORE the irreversible category/slot deletion.
create function public.delete_personal_series(p_series uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  category_name text;
  affected_books uuid[];
  book_id uuid;
  archive_result jsonb;
  claim jsonb := jsonb_build_object('origin', 'reader', 'source', 'series_category_delete', 'at', now());
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select s.name into category_name from public.series s where s.id = p_series and s.owner_id = caller;
  if not found then
    -- A lost response can be retried. A foreign category remains an authorization error.
    if exists (select 1 from public.series where id = p_series) then
      raise exception 'not owner of series' using errcode = '42501';
    end if;
    return jsonb_build_object('series_id', p_series, 'already_deleted', true);
  end if;

  -- Include legacy compatibility-only books in the same book-before-series lock order as archive.
  perform 1 from public.books b
  where b.owner_id = caller and (
    lower(btrim(b.series)) = lower(btrim(category_name)) or exists (
      select 1 from public.series_entries e where e.series_id = p_series and e.book_id = b.id
    )
  ) order by b.id for update;

  select coalesce(array_agg(b.id order by b.id), '{}'::uuid[]) into affected_books
  from public.books b where b.owner_id = caller and (
    lower(btrim(b.series)) = lower(btrim(category_name)) or exists (
      select 1 from public.series_entries e where e.series_id = p_series and e.book_id = b.id
        and e.is_primary and e.removed_at is null
    )
  );

  archive_result := public.archive_personal_series(p_series);
  foreach book_id in array affected_books loop
    -- Another primary is preserved; a clear records reader intent so enrichment cannot recreate it.
    perform public.refresh_book_series_projection(book_id, claim, true);
  end loop;

  -- Permanently remove this category and its cascading series_entries (including ghosts/history).
  -- The parent goes first: the archived-entry guard sees no parent during its FK cascade.
  -- No book or reading-history foreign key points to the category, so those rows are not deleted.
  delete from public.series where id = p_series and owner_id = caller;
  return jsonb_build_object('series_id', p_series, 'already_deleted', false,
    'entries_deleted', archive_result -> 'entries_preserved');
end;
$$;
revoke all on function public.delete_personal_series(uuid) from public, anon, authenticated, service_role;
grant execute on function public.delete_personal_series(uuid) to authenticated;
