-- Atomic merge (acceptance Task 3). Bulk "merge all duplicates" did many client writes +
-- deletes; a mid-flight failure could orphan list/club refs or lose reads. This folds the
-- whole operation into ONE transaction: carry the loser's reads (dedup by date) and list
-- memberships onto the primary, apply the (core-computed) merged fields, then delete the
-- loser. Any failure rolls the entire thing back — no orphans, no partial state.

create or replace function public.merge_books(p_primary uuid, p_loser uuid, p_fields jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := (select auth.uid());
begin
  if p_primary = p_loser then
    raise exception 'cannot merge a book into itself';
  end if;
  if not exists (select 1 from public.books where id = p_primary and owner_id = uid) then
    raise exception 'not owner of primary book';
  end if;
  if not exists (select 1 from public.books where id = p_loser and owner_id = uid) then
    raise exception 'not owner of loser book';
  end if;

  -- 1. Carry the loser's reads onto the primary (dedup by date). Undated reads always move.
  insert into public.reads (book_id, owner_id, read_on, format, rating, notes)
  select p_primary, uid, r.read_on, r.format, r.rating, r.notes
  from public.reads r
  where r.book_id = p_loser
    and (
      r.read_on is null
      or not exists (select 1 from public.reads p where p.book_id = p_primary and p.read_on = r.read_on)
    );

  -- 2. Carry the loser's list memberships onto the primary.
  insert into public.list_items (list_id, book_id, owner_id, position)
  select li.list_id, p_primary, uid, li.position
  from public.list_items li
  where li.book_id = p_loser
  on conflict (list_id, book_id) do nothing;

  -- 3. Apply the merged fields to the primary (validates CHECK constraints — a bad value
  --    here aborts the whole transaction, rolling back steps 1 & 2 too).
  update public.books set
    title           = coalesce(p_fields ->> 'title', title),
    author_first    = coalesce(p_fields ->> 'author_first', author_first),
    author_last     = coalesce(p_fields ->> 'author_last', author_last),
    series          = coalesce(p_fields ->> 'series', series),
    position        = coalesce((p_fields ->> 'position')::numeric, position),
    series_count    = coalesce((p_fields ->> 'series_count')::smallint, series_count),
    status          = coalesce(p_fields ->> 'status', status),
    subgenre        = coalesce(p_fields ->> 'subgenre', subgenre),
    genres          = case when p_fields ? 'genres' then array(select jsonb_array_elements_text(p_fields -> 'genres')) else genres end,
    tropes          = case when p_fields ? 'tropes' then array(select jsonb_array_elements_text(p_fields -> 'tropes')) else tropes end,
    spice           = coalesce((p_fields ->> 'spice')::smallint, spice),
    cover_url       = coalesce(p_fields ->> 'cover_url', cover_url),
    isbn            = coalesce(p_fields ->> 'isbn', isbn),
    fave            = coalesce((p_fields ->> 'fave')::boolean, fave),
    owned_physical  = case when p_fields ? 'owned_physical' then nullif(p_fields ->> 'owned_physical', '') else owned_physical end,
    owned_ebook     = coalesce((p_fields ->> 'owned_ebook')::boolean, owned_ebook),
    owned_audiobook = coalesce((p_fields ->> 'owned_audiobook')::boolean, owned_audiobook),
    format          = coalesce(p_fields ->> 'format', format),
    rating          = coalesce((p_fields ->> 'rating')::numeric, rating),
    read_status     = coalesce(p_fields ->> 'read_status', read_status),
    source          = coalesce(p_fields ->> 'source', source),
    pub_y           = coalesce((p_fields ->> 'pub_y')::smallint, pub_y),
    pub_m           = coalesce((p_fields ->> 'pub_m')::smallint, pub_m),
    pub_d           = coalesce((p_fields ->> 'pub_d')::smallint, pub_d),
    plan_date       = case when p_fields ? 'plan_date' then (p_fields ->> 'plan_date')::date else plan_date end,
    progress        = coalesce((p_fields ->> 'progress')::smallint, progress),
    boyfriend       = coalesce(p_fields ->> 'boyfriend', boyfriend)
  where id = p_primary;

  -- 4. Delete the loser (cascade clears its reads + list_items).
  delete from public.books where id = p_loser;
end;
$$;

grant execute on function public.merge_books(uuid, uuid, jsonb) to authenticated;
