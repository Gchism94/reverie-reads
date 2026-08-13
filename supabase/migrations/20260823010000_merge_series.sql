-- merge_series — the series-record merge (docs/tasks/task-series-consolidation.md, PR 2).
-- merge_books-shaped, per task-series-integrity-mechanism.md's own instruction to build this "the
-- way merge_books does" — security definer, one transaction, explicit ownership checks.
--
-- ── What this closes ─────────────────────────────────────────────────────────────────────────────
-- Two public.series rows can name the same real series (ACOTAR <-> A Court of Thorns and Roses is
-- the pilot case; Block D found roughly 9-10 name variants per real series library-wide). There has
-- never been a delete path for a series row, and series_entries.series_id references
-- public.series(id) on delete cascade means a naive delete would silently destroy every entry the
-- loser carries — live, ghost, AND tombstone. This function is the only place a public.series row is
-- ever deleted, and only after every entry it owns has been re-parented onto the survivor. Deletion
-- is a side effect of a successful merge, not a general affordance — there is no standalone
-- delete_series RPC, by design (task doc: "must not become a general series-deletion affordance by
-- accident").
--
-- ── Cargo, and the collision rule ────────────────────────────────────────────────────────────────
-- Three kinds of cargo must survive, per the task doc, stated whole:
--   · TOMBSTONES — the highest-risk cargo. Losing one resurrects something the reader deliberately
--     suppressed, with no way for them to know it happened. Re-parented by series_id alone; no
--     position handling needed — they hold no live slot and are invisible to the position index.
--   · GHOST entries — forward-looking slots for books that don't exist yet. Re-parented the same as
--     any live entry, through the same position plan below.
--   · LIVE entries, INCLUDING their positions (decimals included). Collision rule, decided here
--     rather than discovered at runtime: the SURVIVING record's occupied positions win; an incoming
--     entry whose position is already taken gets appended at the next free integer position above
--     the combined max, processed in the loser's own position order so entries arriving together
--     keep their relative order even when their absolute values change. An incoming entry whose
--     position is NOT already taken keeps it — the common case (the ACOTAR pilot: "ACOTAR 6" at
--     position 6 does not collide with the survivor's occupied 1/2/3/3.5/5, so it lands at 6 exactly
--     where it already reads as "the next one").
--
-- ── REDUNDANT live entries — same book already lives in the primary series ─────────────────────
-- Rare but possible: the same physical book was catalogued independently under both series names, so
-- both a loser entry and a primary entry link the identical book_id. Re-parenting the loser's copy
-- unchanged would collide with series_entries_book_uidx (series_id, book_id) where book_id is not
-- null. Precedent: merge_books' step 3c-series (20260812010000) hits the identical shape one level
-- down for book-row merges and resolves it the same way — tombstone the redundant copy FIRST, using
-- remove_series_entry's exact shape (removed_at + book_id cleared + user_edited true), before
-- anything else touches it.
--
-- ── Why this does not go through set_series_order for the position write ───────────────────────────
-- set_series_order's per-row parking exists to survive a REORDER within one series, where the
-- non-deferrable partial unique index rejects a batched swap (see its own header). A cross-series
-- merge is not a swap: each moved entry's final (series_id, position) is computed FIRST, against a
-- combined space already proven free of every existing row and of every other moved row, so the
-- single UPDATE below cannot pass through a colliding intermediate state the way a same-series
-- reorder can. Routing through set_series_order directly would also retroactively raise user_edited
-- on the survivor's UNTOUCHED entries just for being included in the same batch, which this merge
-- does not intend — only entries actually re-parented from the loser gain that flag. What IS reused
-- from it: the same name-keyed books.series_count sync shape (its step 8) and the same
-- books.position sync shape (its step 7) — copied here, not called, because this function's write
-- set (which books, which name) differs from set_series_order's (which entries) in a way the shared
-- RPC's parameters cannot express cleanly. A future change to either sync shape should update both
-- call sites — the same discipline sync_book_series already documents for its own delegation.
--
-- ── Ownership vs membership, respected ───────────────────────────────────────────────────────────
-- This function moves SERIES MEMBERSHIP (series_entries, books.series) only. It never reads or
-- writes owned_physical/owned_ebook/owned_audiobook — those are a books-table format fact, unaffected
-- by which series row a book's entry belongs to, the same rule that kept the ACOTAR eBook-bundle fix
-- out of series_entries entirely.
--
-- ── user_edited on re-parented entries ───────────────────────────────────────────────────────────
-- Every live entry re-parented from the loser is marked user_edited = true, whether or not its
-- position actually changed. This is not a silent override of CLAUDE.md's hard rule — invoking this
-- function at all IS the deliberate owner action (accepting a Tier 3 proposal, or a manual merge
-- call), the same shape as acotar-fix.sql's explicit p_origin = 'reader' on rows it moved for a
-- reviewed, authorized reason. The survivor's own untouched entries are never written by this
-- function and keep whatever flag they already carried.
--
-- ── Name keys are supplied by the caller ─────────────────────────────────────────────────────────
-- Same reasoning as record_series_ruling (previous migration): this function only orders and stores
-- the two keys it is given, never derives one from a name.
create or replace function public.merge_series(
  p_primary    uuid,
  p_loser      uuid,
  p_name_key_a text,
  p_name_key_b text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid              uuid := (select auth.uid());
  v_primary_name   text;
  v_loser_name     text;
  v_primary_length smallint;
  v_max            numeric;
  n_redundant      int := 0;
  n_tombstones     int := 0;
  n_live           int := 0;
  n_books_renamed  int := 0;
  n_books_synced   int := 0;
  n_remaining      int;
  rec              record;
  v_new_pos        numeric;
begin
  if p_primary = p_loser then
    raise exception 'merge_series: cannot merge a series into itself';
  end if;
  if coalesce(p_name_key_a, '') = '' or coalesce(p_name_key_b, '') = '' then
    raise exception 'merge_series: name keys must be computed by the caller (seriesNameKey)';
  end if;

  select name, length into v_primary_name, v_primary_length
    from public.series where id = p_primary and owner_id = uid;
  if not found then
    raise exception 'not owner of primary series';
  end if;
  select name into v_loser_name from public.series where id = p_loser and owner_id = uid;
  if not found then
    raise exception 'not owner of loser series';
  end if;

  -- ── 1. REDUNDANT live entries — same book already lives in the primary series. Tombstone first
  --      (series_id stays p_loser for now; step 2 sweeps every tombstone, old and new, in one move).
  update public.series_entries e
     set removed_at  = now(),
         book_id     = null,
         user_edited = true
   where e.series_id = p_loser
     and e.removed_at is null
     and e.book_id is not null
     and exists (
       select 1 from public.series_entries p2
        where p2.series_id  = p_primary
          and p2.book_id    = e.book_id
          and p2.removed_at is null
     );
  get diagnostics n_redundant = row_count;

  -- ── 2. TOMBSTONES — re-parent series_id only, for every tombstone the loser now holds: the ones
  --      that already existed, and the ones step 1 just created. No position handling: removed_at is
  --      not null rows hold no slot and are invisible to series_entries_position_uidx.
  update public.series_entries
     set series_id = p_primary
   where series_id = p_loser
     and removed_at is not null;
  get diagnostics n_tombstones = row_count;

  -- ── 3. LIVE entries — compute the collision-resolved position plan FIRST, write nothing yet.
  --      Temp table so the loop below and the write after it share one plan; on commit drop so it
  --      cannot outlive this transaction.
  create temp table merge_series_position_plan (
    entry_id uuid primary key,
    new_position numeric not null
  ) on commit drop;

  select coalesce(max(position), 0) into v_max
    from public.series_entries where series_id = p_primary and removed_at is null;

  -- Collision check is against TWO sets, not one: the primary's existing live positions, AND every
  -- position already handed out earlier in THIS loop. The second half is load-bearing, not
  -- defensive ceremony — a later entry's ORIGINAL position can be free against the primary today and
  -- still land exactly on a value an earlier entry in this same batch was just BUMPED to (bumped
  -- values climb monotonically above the running max, and a later entry's untouched original value
  -- can sit anywhere above that max too). Checked and caught in review before this ever ran against
  -- data: primary occupies {1,2,3}; loser entries at original positions 2, 4, 10, processed in that
  -- order — entry-at-2 collides with primary's 2 and bumps to 4; entry-at-4, checked against ONLY
  -- the primary's original {1,2,3}, would read as free and keep 4 — landing on the exact value the
  -- previous entry was just bumped to. Querying merge_series_position_plan (already populated up to
  -- this point in the loop) alongside the primary catches it: entry-at-4 now correctly bumps to 5.
  for rec in
    select id, position
      from public.series_entries
     where series_id = p_loser and removed_at is null
     order by position, created_at
  loop
    if exists (
      select 1 from public.series_entries
       where series_id = p_primary and removed_at is null and position = rec.position
    ) or exists (
      select 1 from merge_series_position_plan where new_position = rec.position
    ) then
      v_max := v_max + 1;
      v_new_pos := v_max;
    else
      v_new_pos := rec.position;
      if rec.position > v_max then v_max := rec.position; end if;
    end if;
    insert into merge_series_position_plan (entry_id, new_position) values (rec.id, v_new_pos);
  end loop;

  -- ── 4. WRITE — series_id and position together, one statement. Each row's target is unique
  --      against every existing primary row and every other moved row (guaranteed by the plan
  --      above), so this cannot pass through a colliding intermediate state the way a same-series
  --      swap can — see header for why set_series_order's parking strategy is not needed here.
  update public.series_entries e
     set series_id   = p_primary,
         position    = p.new_position,
         user_edited = true
    from merge_series_position_plan p
   where e.id = p.entry_id;
  get diagnostics n_live = row_count;

  -- ── 5. Sync books.position for every re-parented live entry — same shape as set_series_order's
  --      step 7 (see header for why this is copied, not called).
  update public.books b
     set position = p.new_position
    from merge_series_position_plan p
    join public.series_entries e on e.id = p.entry_id
   where b.id = e.book_id
     and b.owner_id = uid
     and b.position is distinct from p.new_position;

  -- ── 6. books.series STRING — every book naming the loser, not only ones with a live entry.
  --      books.series is independent free text (the name-fragmentation problem itself); a book can
  --      carry the loser's name with no series_entries row at all.
  update public.books
     set series = v_primary_name
   where owner_id = uid and series = v_loser_name;
  get diagnostics n_books_renamed = row_count;

  -- ── 7. books.series_count — same name-keyed shape as set_series_order's step 8, run AFTER step 6
  --      so books this merge just renamed are included. No-op if the survivor has no length set.
  if v_primary_length is not null then
    update public.books
       set series_count = v_primary_length
     where owner_id = uid and series = v_primary_name and series_count is distinct from v_primary_length;
    get diagnostics n_books_synced = row_count;
  end if;

  -- ── 8. Guard before delete — every entry the loser owned must be gone. If this fails, something
  --      above missed a row and the delete's cascade would destroy it; refuse rather than guess.
  select count(*) into n_remaining from public.series_entries where series_id = p_loser;
  if n_remaining <> 0 then
    raise exception 'merge_series: % series_entries still reference the loser after re-parenting — refusing to delete', n_remaining;
  end if;

  delete from public.series where id = p_loser;

  -- ── 9. Record the ruling. ON CONFLICT so a prior distinct/related_but_separate ruling for this
  --      exact pair is replaced, not duplicated — CLAUDE.md's precedent: the protection guards
  --      against silent algorithmic override, never against the reader changing their mind.
  insert into public.series_merge_decisions
    (owner_id, name_key_a, name_key_b, ruling, surviving_series_id, alias_name)
  values
    (uid, least(p_name_key_a, p_name_key_b), greatest(p_name_key_a, p_name_key_b),
     'same', p_primary, v_loser_name)
  on conflict (owner_id, name_key_a, name_key_b)
  do update set ruling = 'same', surviving_series_id = p_primary, alias_name = v_loser_name, decided_at = now();

  return jsonb_build_object(
    'surviving_series_id',       p_primary,
    'alias_name',                v_loser_name,
    'redundant_tombstoned',      n_redundant,
    'tombstones_reparented',     n_tombstones,
    'live_entries_reparented',   n_live,
    'books_series_renamed',      n_books_renamed,
    'books_series_count_synced', n_books_synced
  );
end;
$$;

revoke execute on function public.merge_series(uuid, uuid, text, text) from public;
revoke execute on function public.merge_series(uuid, uuid, text, text) from anon;
grant  execute on function public.merge_series(uuid, uuid, text, text) to authenticated;
