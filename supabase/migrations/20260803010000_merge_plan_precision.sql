-- Plan precision, schema stage 2 — teach merge_books the plan trio, and close the one field on this
-- table that a merge could DESTROY rather than union.
--
-- ── The defect ───────────────────────────────────────────────────────────────────────────────────
-- Every other scalar here fills blanks: `coalesce((p_fields ->> 'pub_y')::smallint, pub_y)` cannot
-- clear a stored value, because a null on the incoming side loses to what is already there. The plan
-- was the exception:
--
--     plan_date = case when p_fields ? 'plan_date' then (p_fields ->> 'plan_date')::date else plan_date end
--
-- `p_fields` is `toBookRow(merged)` on a FULL Book, so the `plan_date` key is always present and the
-- `case` always takes its first branch — an unconditional set, with no `coalesce` beneath it. A null
-- arriving from the client therefore WRITES null over a stored plan.
--
-- Being precise about the trigger, because the first report of this was not: `merge.ts`'s union
-- starts from `{ ...source }`, so a merge computed against fresh, correct data always carries the
-- primary's own plan forward and the unconditional set writes back what was already there. The way
-- it bites is a client whose cached `Book` does not carry a plan the stored row actually has — a
-- stale or partially-hydrated cache — where `merged.plan` is null and the RPC then clears the real
-- one. `pub_*` is immune to that exact input; the plan was not. Narrow trigger, total effect.
--
-- ── The rule: one object, not three columns ──────────────────────────────────────────────────────
-- `merge.ts:121` unions `pub` as a WHOLE OBJECT keyed on `y` — it takes some other book's PubDate
-- entire or leaves the primary's alone, and never assembles one from parts. The SQL side of `pub_*`
-- does NOT mirror that: three independent `coalesce`s could in principle take a year from one book
-- and a month from another. Nothing exercises that today only because core always hands the RPC a
-- coherent triple. Rather than inherit a latent hazard for the sake of symmetry, the plan unions the
-- way the engine actually reasons — `take_plan` is decided ONCE, and all four columns follow it.
--
-- The condition is "the primary has no plan in EITHER representation": `plan_y is null and
-- plan_date is null`. Checking `plan_y` alone would be wrong during the dual-representation window
-- this branch opens, where a row written by the not-yet-updated app carries a plan in `plan_date`
-- with the trio still empty — that is a real plan, and a merge must not overwrite it.
--
-- `plan_date` keeps being written, in step with the trio. The app dual-writes it for rollback
-- safety, and the column is dropped in a later branch; until then the two must not diverge.
--
-- Recreated verbatim from merge_shelf_model otherwise — the `take_plan` declaration, the select that
-- computes it, four assignments in place of one, and this header are the whole diff.

create or replace function public.merge_books(p_primary uuid, p_loser uuid, p_fields jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := (select auth.uid());
  -- Decided ONCE, before the update, so all four plan columns move as one object (see header).
  take_plan boolean;
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

  -- 3. Union the loser's contributors onto the primary (append after primary's; dedupe by
  --    author+role), then renumber positions in order.
  insert into public.book_authors (book_id, author_id, owner_id, position, role)
  select p_primary, ba.author_id, uid, ba.position + 1000, ba.role
  from public.book_authors ba
  where ba.book_id = p_loser
  on conflict (book_id, author_id, role) do nothing;

  with ranked as (
    select author_id, role, (row_number() over (order by position) - 1) as rn
    from public.book_authors where book_id = p_primary
  )
  update public.book_authors ba set position = r.rn
  from ranked r
  where ba.book_id = p_primary and ba.author_id = r.author_id and ba.role = r.role;

  -- 3b. Re-parent the loser's TROPES onto the primary. On conflict the primary's own emphasis wins
  --     (a pinned trope stays pinned), so a merge never demotes a pin. Without this the loser's
  --     tropes would be lost to the cascade delete below.
  insert into public.book_tropes (book_id, trope_id, owner_id, emphasis)
  select p_primary, bt.trope_id, uid, bt.emphasis
  from public.book_tropes bt
  where bt.book_id = p_loser
  on conflict (book_id, trope_id) do nothing;

  -- 3c. Re-parent the loser's reader-assigned MOODS onto the primary (union). Same cascade-loss fix.
  insert into public.book_moods (book_id, mood_id, owner_id)
  select p_primary, bm.mood_id, uid
  from public.book_moods bm
  where bm.book_id = p_loser
  on conflict (book_id, mood_id) do nothing;

  -- 3d. Does the incoming plan get to land? Only if the primary has no plan of its own in EITHER
  --     representation, and the incoming side actually carries one. Read BEFORE the update, so the
  --     answer describes the stored row rather than a value the same statement is rewriting.
  select b.plan_y is null and b.plan_date is null and (p_fields ->> 'plan_y') is not null
    into take_plan
  from public.books b
  where b.id = p_primary;

  -- 4. Apply the merged scalar/array fields to the primary. Possession is now FIVE independent
  --    signals, each with its own union rule computed by the core engine (mergeBooks):
  --      ownership       — 'owned' if ANY side owns a copy (a real copy never loses to a non-copy)
  --      borrowed        — OR: a borrowed copy on either side survives the merge
  --      wishlist        — OR: a want on either side survives too, even beside a real copy. A merge
  --                        deduplicates rows; it is not evidence the want was satisfied, and a
  --                        stale want is the reader's to clear.
  --      owned_* formats — union, unchanged (hardcover beats paperback beats bare true).
  update public.books set
    title           = coalesce(p_fields ->> 'title', title),
    author_first    = coalesce(p_fields ->> 'author_first', author_first),
    author_last     = coalesce(p_fields ->> 'author_last', author_last),
    series          = coalesce(p_fields ->> 'series', series),
    position        = coalesce((p_fields ->> 'position')::numeric, position),
    series_count    = coalesce((p_fields ->> 'series_count')::smallint, series_count),
    status          = coalesce(p_fields ->> 'status', status),
    genre           = coalesce(p_fields ->> 'genre', genre),
    subgenre        = coalesce(p_fields ->> 'subgenre', subgenre),
    subgenres       = case when p_fields ? 'subgenres' then array(select jsonb_array_elements_text(p_fields -> 'subgenres')) else subgenres end,
    genres          = case when p_fields ? 'genres' then array(select jsonb_array_elements_text(p_fields -> 'genres')) else genres end,
    tags            = case when p_fields ? 'tags' then array(select jsonb_array_elements_text(p_fields -> 'tags')) else tags end,
    intensity       = coalesce((p_fields ->> 'intensity')::smallint, intensity),
    cover_url       = coalesce(p_fields ->> 'cover_url', cover_url),
    isbn            = coalesce(p_fields ->> 'isbn', isbn),
    fave            = coalesce((p_fields ->> 'fave')::boolean, fave),
    ownership       = coalesce(p_fields ->> 'ownership', ownership),
    owned_physical  = case when p_fields ? 'owned_physical' then nullif(p_fields ->> 'owned_physical', '') else owned_physical end,
    owned_ebook     = coalesce((p_fields ->> 'owned_ebook')::boolean, owned_ebook),
    owned_audiobook = coalesce((p_fields ->> 'owned_audiobook')::boolean, owned_audiobook),
    borrowed        = coalesce((p_fields ->> 'borrowed')::boolean, borrowed),
    wishlist        = coalesce((p_fields ->> 'wishlist')::boolean, wishlist),
    format          = coalesce(p_fields ->> 'format', format),
    rating          = coalesce((p_fields ->> 'rating')::numeric, rating),
    read_status     = coalesce(p_fields ->> 'read_status', read_status),
    source          = coalesce(p_fields ->> 'source', source),
    pub_y           = coalesce((p_fields ->> 'pub_y')::smallint, pub_y),
    pub_m           = coalesce((p_fields ->> 'pub_m')::smallint, pub_m),
    pub_d           = coalesce((p_fields ->> 'pub_d')::smallint, pub_d),
    -- The plan, taken whole or not at all. `take_plan` is false whenever the primary already has a
    -- plan, so a null from a stale client can no longer clear one — the failure this replaces.
    plan_y          = case when take_plan then (p_fields ->> 'plan_y')::smallint else plan_y end,
    plan_m          = case when take_plan then (p_fields ->> 'plan_m')::smallint else plan_m end,
    plan_d          = case when take_plan then (p_fields ->> 'plan_d')::smallint else plan_d end,
    plan_date       = case when take_plan then (p_fields ->> 'plan_date')::date else plan_date end,
    progress        = coalesce((p_fields ->> 'progress')::smallint, progress)
  where id = p_primary;

  -- 5. Refresh the denormalized byline cache from the reconciled author/co-author names.
  update public.books set authors_display = (
    select string_agg(a.name, ', ' order by ba.position)
    from public.book_authors ba join public.authors a on a.id = ba.author_id
    where ba.book_id = p_primary and ba.role in ('author', 'co_author')
  ) where id = p_primary;

  -- 6. Delete the loser (cascade clears its reads + list_items + book_authors + book_tropes +
  --    book_moods — all already re-parented above).
  delete from public.books where id = p_loser;
end;
$$;
grant execute on function public.merge_books(uuid, uuid, jsonb) to authenticated;
