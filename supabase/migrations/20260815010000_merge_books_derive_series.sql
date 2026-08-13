-- merge_books: DERIVE the synced series copies instead of merging them.
-- Phase 2 of feat/series-integrity-mechanism (docs/tasks/task-series-integrity-mechanism.md).
--
-- ── The defect this closes ──────────────────────────────────────────────────────────────────────
-- 20260814010000 made set_series_order the one write path for series position and series length.
-- merge_books' step 4 still wrote `books.position` and `books.series_count` from `p_fields`,
-- computed client-side by packages/core/src/merge.ts. Two writers, one fact — and the merge writer
-- ran AFTER step 3c-series had already decided which series entry survives, so it could overwrite
-- a position with a value the surviving entry disagreed with, in the same transaction that had
-- just established the entry as canonical.
--
-- The owner's ruling (Phase 2 report, 2026-08-09) chose this over the cheaper option of leaving
-- step 4 alone: "the difference between 'synced copy' being a true claim and an aspirational one."
-- Shipping the mechanism with a known exception on day one is how an exception becomes permanent.
--
-- ── What changes, and what deliberately does not ────────────────────────────────────────────────
-- Two lines leave step 4's coalesce list (`position`, `series_count`). One new step 4b, between
-- the field update and the byline refresh, derives both from the structures that now own them:
-- position from the surviving live entry, series_count from that entry's series row. Everything
-- else in the body is 20260812010000's, character-for-character.
--
-- p_fields' values are kept as a FALLBACK for books with no live series entry — 366 of the 437
-- series-carrying books in this library. That is not a hedge: a books.position with no entry
-- behind it is an unreconciled claim rather than a copy of anything, the same line drawn at every
-- client insert path. The instant an entry exists, the entry wins outright.
--
-- packages/core/src/merge.ts is NOT changed. It still computes position/series_count into
-- p_fields, which is exactly what the fallback consumes; deleting them there would break the
-- unreconciled case and the merge preview that shows the reader what a merge will do.

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

  -- 4b. THE SYNCED COPIES ARE DERIVED, NOT MERGED (feat/series-integrity-mechanism Phase 2,
  --     owner ruling: option (a)). `position` and `series_count` used to sit in step 4's coalesce
  --     list, taken from p_fields like any other merged field. That made the merge path a SECOND
  --     independent writer of two columns set_series_order now owns — the two-homes-for-one-fact
  --     shape the whole mechanism exists to close, and it would have shipped as a known exception
  --     on day one. Step 3c-series has already settled WHICH entry survives, so that entry is the
  --     authority on where this book sits and its series row is the authority on how long the
  --     series is.
  --
  --     The p_fields values survive as a FALLBACK, and that is not a hedge — it is the same
  --     unreconciled-claim line the client paths draw. Only 71 of 437 series-carrying books have a
  --     structured entry at all (docs/audits, Block D); for the rest, books.position is a claim
  --     that is not yet a copy of anything, so there is nothing for it to be inconsistent with and
  --     the merged fill-when-blank stays correct. Once an entry exists, the entry wins outright.
  --
  --     A book may hold live entries in two series; `order by e.position` makes the pick
  --     deterministic rather than whatever order the scan returned, on the same reasoning as
  --     useSeriesDetail's ordered reads.
  update public.books b set
    position = coalesce(
      (select e.position
         from public.series_entries e
        where e.book_id = p_primary and e.removed_at is null
        order by e.position, e.id
        limit 1),
      (p_fields ->> 'position')::numeric,
      b.position),
    series_count = coalesce(
      (select s.length
         from public.series_entries e
         join public.series s on s.id = e.series_id
        where e.book_id = p_primary and e.removed_at is null and s.length is not null
        order by e.position, e.id
        limit 1),
      (p_fields ->> 'series_count')::smallint,
      b.series_count)
  where b.id = p_primary;

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
-- per proacl, never assumed (CLAUDE.md; merge_books has now been replaced seven times without
-- losing the revoke).
