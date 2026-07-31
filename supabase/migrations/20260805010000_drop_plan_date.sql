-- Plan precision, final stage — `books.plan_date` goes.
--
-- The end of a four-branch sequence, run in the app-first-then-schema order the reading_orders
-- demolition established: the trio columns arrived (20260802010000), merge_books learned them
-- (20260803010000), the deploy-window stragglers were converted (20260804010000), the app stopped
-- reading and writing the column (#120, live and serving), and only now does the column itself go.
--
-- ── THIS IS IRREVERSIBLE ────────────────────────────────────────────────────────────────────────
-- `drop column` discards the data with the column; there is no restore path short of a database
-- backup. What makes that acceptable is evidence rather than confidence: 20260804010000's post-check
-- raises unless EVERY row with a plan_date also carries a plan_y, and its production run reported
-- zero unconverted rows. The two rows that carried both representations were verified to agree
-- exactly with their trio. Nothing in this column is information the trio does not already hold.
--
-- ── Order inside the transaction: FUNCTION FIRST, THEN THE DROP ─────────────────────────────────
-- Postgres will not enforce this, which is exactly why it is stated. A plpgsql body is an opaque
-- string, not a tracked dependency, so `alter table ... drop column plan_date` SUCCEEDS SILENTLY
-- while merge_books still references it — verified against this database. The cost is deferred to
-- the next caller, and it is total: every de-duplicate merge then fails at the `take_plan` select
-- with `column b.plan_date does not exist`, under a hint helpfully suggesting `b.plan_d`.
--
-- So the function is replaced first, and both statements share one transaction: after step 1 nothing
-- in the database names the column, and step 2 removes something no live definition depends on. The
-- reverse order would leave a broken function live between the two statements — invisible to other
-- sessions inside a transaction, but a window that should not exist at all. There is no moment,
-- committed or otherwise, where a live definition references a dropped column.
--
-- ── What changed in merge_books, and what is verbatim ───────────────────────────────────────────
-- The body below is 20260803010000's, character-for-character, except:
--
--   · `take_plan` loses its `b.plan_date is null` clause and is keyed on `plan_y is null` alone.
--     That clause was never about the plan itself — it protected rows written by the PRE-TRIO app
--     during the transition window, which carried a plan in plan_date with an empty trio and would
--     otherwise have read as "no plan" and been overwritten by an incoming one. That window is
--     closed (the app stopped writing plan_date in #120) and 20260804010000 swept every row it
--     produced. With no such rows left and no writer able to create another, `plan_y is null` is
--     now the complete and only test for "this book has no plan."
--   · The `plan_date` assignment is gone from the UPDATE's SET list. The plan still moves as ONE
--     object under a single `take_plan` decision — three columns now instead of four.
--   · Two comments updated to match. Everything else is untouched.
--
-- `create or replace` preserves the ACL, so 20260801010000's `revoke execute from public` survives —
-- confirmed against `proacl` on this database rather than assumed, and asserted in pgTAP by SQLSTATE
-- 42501 (never a body-level P0001, per CLAUDE.md).

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
  --    book_moods — all already re-parented above).
  delete from public.books where id = p_loser;
end;
$$;
grant execute on function public.merge_books(uuid, uuid, jsonb) to authenticated;

-- ── 2. The column ───────────────────────────────────────────────────────────────────────────────
-- Safe now: no function, view or trigger names it (grepped the whole of supabase/; this repo has no
-- views and no triggers referencing it), and the app stopped touching it in #120.
alter table public.books drop column plan_date;
