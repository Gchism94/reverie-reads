-- Re-parent series_entries on merge — closes a gap in `merge_books`.
--
-- ── The defect this PR fixes in the GENERAL path ───────────────────────────────────────────────
-- The dedupe-merge removes the losing books row at step 6 (`delete from public.books where id =
-- p_loser`). `series_entries.book_id` references `public.books (id) on delete set null` — so the
-- cascade silently flips every entry that pointed at the loser into a ghost with `book_id = null`.
-- Reads, list memberships, contributors, tropes, moods are all re-parented in steps 1–3c; the
-- linked series entry is NOT, even though its call-site is the merger. The defect is most visible
-- on a single-pair duplicate of a book the reader finished: the linked entry today points at the
-- Unread copy of two import paths, while the reader's "I read this" lives on the OTHER copy. The
-- default merge path then removes the read copy's link to the series the reader pinned it to
-- (`entryState()` on packages/core/src/seriesShelf.ts:50-57 is driven by the LINKED book row's
-- state). With this fix, the same dedupe keeps the linked entry live on whichever row survives.
--
-- Rule: 1 book → 1 series entry per series. For each `series_entries` row whose `book_id` is the
-- loser:
--   · another live entry for the primary already lives in the same series → loser entry is
--     redundant. Tombstone it using remove_series_entry's exact shape (removed_at + clear
--     book_id + user_edited = true) so the row keeps its history but no longer drives UI.
--   · otherwise → re-parent: book_id = p_loser → p_primary.
-- Tombstones run BEFORE re-parents. Re-parenting without them would clash with the primary's
-- existing entry in the partial unique index `series_entries_book_uidx (series_id, book_id)
-- where book_id is not null`.
--
-- ── What this migration changes ─────────────────────────────────────────────────────────────────
-- The body below is 20260805010000_drop_plan_date.sql's, character-for-character, with one new
-- step (3c-series) inserted between 3c and 3d; one new raise notice; one new comment block; and
-- the step-6 comment updated to acknowledge the new step. Nothing else moves.

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
  n_series_reparented int;
  n_series_tombstoned int;
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

  -- 3c-series. Re-parent the loser's linked series entries onto the primary. Without this, step 6
  --     would silently flip every such entry's book_id to NULL via the on-delete-set-null FK and
  --     leave the slot as a ghost that points at no book. Rule: 1 book → 1 series entry per series.
  --     Tombstone redundant entries FIRST (so the re-parent UPDATE does not clash with the
  --     primary's existing entry in the partial unique index), then re-parent the rest.
  update public.series_entries
     set removed_at  = now(),
         book_id     = null,
         user_edited = true
   where book_id = p_loser
     and removed_at is null
     and exists (
       select 1 from public.series_entries e2
        where e2.book_id   = p_primary
          and e2.series_id = series_entries.series_id
          and e2.removed_at is null
     );
  get diagnostics n_series_tombstoned = row_count;

  update public.series_entries
     set book_id = p_primary
   where book_id = p_loser
     and removed_at is null;
  get diagnostics n_series_reparented = row_count;

  if n_series_reparented > 0 or n_series_tombstoned > 0 then
    raise notice 'merge_books: re-parented % series_entries from loser to primary, tombstoned % redundant copies',
                 n_series_reparented, n_series_tombstoned;
  end if;

  -- 3d. Does the incoming plan get to land? Only if the primary has no plan of its own and the
  --     incoming side actually carries one. Read BEFORE the update, so the answer describes the
  --     stored row rather than a value the same statement is rewriting. Keyed on `plan_y` ALONE
  --     now — the legacy-column half of this condition is gone; see the header.
  select b.plan_y is null and (p_fields ->> 'plan_y') is not null
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
    -- The plan, taken whole or not at all — THREE columns now, not four. `take_plan` is false
    -- whenever the primary already has a plan, so a null from a stale client cannot clear one.
    plan_y          = case when take_plan then (p_fields ->> 'plan_y')::smallint else plan_y end,
    plan_m          = case when take_plan then (p_fields ->> 'plan_m')::smallint else plan_m end,
    plan_d          = case when take_plan then (p_fields ->> 'plan_d')::smallint else plan_d end,
    progress        = coalesce((p_fields ->> 'progress')::smallint, progress)
  where id = p_primary;

  -- 5. Refresh the denormalized byline cache from the reconciled author/co-author names.
  update public.books set authors_display = (
    select string_agg(a.name, ', ' order by ba.position)
    from public.book_authors ba join public.authors a on a.id = ba.author_id
    where ba.book_id = p_primary and ba.role in ('author', 'co_author')
  ) where id = p_primary;

  -- 6. Delete the loser (cascade clears its reads + list_items + book_authors + book_tropes +
  --    book_moods — all already re-parented above; series_entries already re-parented or
  --    tombstoned in 3c-series, so the on-delete-set-null FK has nothing to flip).
  delete from public.books where id = p_loser;
end;
$$;
grant execute on function public.merge_books(uuid, uuid, jsonb) to authenticated;

-- `create or replace` preserves the ACL — 20260801010000's `revoke execute from public` survives
-- per proacl, never assumed (codified in AGENTS.md after this repo's merge_books has been replaced
-- six times now without losing the revoke).
