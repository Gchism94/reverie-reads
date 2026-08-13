-- set_series_order: a source-origin move whose target position is held by a slot OUTSIDE the batch
-- is SKIPPED (and counted), no longer a batch-wide abort. Owner ruling on the BACKLOG
-- "mergeSourceEntries moves without occupancy check" item: skip that one move, apply the rest of
-- the refresh, and do not renumber the occupant out of the way.
--
-- ▌▌ 20260814010000 (this function) and 20260816010000 (series_entries_position_uidx) are both
-- ▌ confirmed deployed to production, so this ships as a NEW migration with a same-signature
-- ▌ `create or replace` — the existing revoke/grant survives (verified against this database on
-- ▌ the last three same-shaped replaces; verified again for this one post-apply).
--
-- ── Why the abort was wrong for a source refresh ─────────────────────────────────────────────────
-- The pre-flight collision check exists so a conflict names itself instead of surfacing as a bare
-- 23505. For a READER batch that is the right shape: a reader-origin collision means a stale cache
-- or a bug, and silently dropping a slot the reader believes exists is the removal-bug shape this
-- function's header already refuses. That raise is UNCHANGED below. But a SOURCE refresh is not a
-- reader holding an intent — it is opportunistic correction, and `fix/series-seed-provenance`
-- widened its movable population from ~0 to most of the library, so one catalog position landing on
-- a reader-arranged slot's number now aborts the entire refresh including every unrelated,
-- perfectly-good move in it. The function already has the pattern for "this call may not write
-- that": v_eligible drops user_edited rows and returns skipped_user_edited. This applies the same
-- shape a second time — filter, count, proceed — returning skipped_collision alongside it.
--
-- ── THE FILTER MUST ITERATE — a single pass is provably insufficient ─────────────────────────────
-- A slot in the batch is exempt from the collision check precisely because its entry is about to
-- VACATE its current position (the park pass moves it away). Filter that slot out and its entry now
-- stays put — so its current position becomes newly occupied for every slot still in the batch.
-- Concretely: A@1, B@2, reader-arranged C@5; source batch [A→5, B→1]. Pass 1: A→5 collides with C;
-- B→1 is clean (1 is held by A, which is in the batch). Drop A — A stays at 1 — and B→1 now
-- collides with A. A single-pass filter keeps B→1, parks B, and the final write dies on the unique
-- index: the exact abort this migration removes, arriving one statement later and less legibly.
-- So: loop to a fixed point. The iteration is well-behaved — filtering only ever ADDS entries to
-- the collision universe (the kept set shrinks, the outside set grows), so a skipped slot can never
-- become eligible again, the result is the unique maximal collision-free subset (batch order never
-- picks winners), and each pass either removes a slot or terminates, bounding the loop by the batch
-- size. In the example both slots skip: skipped_collision = 2, every position untouched.
create or replace function public.set_series_order(
  p_series uuid,
  p_slots  jsonb default '[]'::jsonb,
  p_origin text  default 'reader',
  p_opts   jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := (select auth.uid());
  v_name text;
  v_eligible jsonb;
  v_kept jsonb;
  v_len smallint;
  v_off numeric;
  n_slots int := jsonb_array_length(coalesce(p_slots, '[]'::jsonb));
  n_eligible int := 0;
  n_collision int := 0;
  n_moved int := 0;
  n_books int := 0;
  n_length_books int := 0;
  v_length_set boolean := false;
begin
  if p_origin not in ('reader', 'source') then
    raise exception 'set_series_order: p_origin must be reader or source, got %', p_origin
      using errcode = 'invalid_parameter_value';
  end if;

  -- 0. The series. `uid` null matches nothing, so an unauthenticated caller stops here.
  select name into v_name from public.series where id = p_series and owner_id = uid;
  if not found then
    raise exception 'not owner of series';
  end if;

  if n_slots > 0 then
    -- ── A SLOT WITHOUT A POSITION IS A CONFUSED CALLER, NOT A VALUE TO DERIVE ──────────────────
    -- `series_entries.position` is NOT NULL, and that is a statement about what a slot IS: a live
    -- entry occupies a place in the reading order. "In the series but nowhere in the order" is not
    -- a state the reading order can represent, or that the series page could render — it is an
    -- ordered list, and the book has to appear somewhere in it.
    --
    -- Translating a reader's CLEARED number into an ordinal is the client's job and it has a rule
    -- for it (the end of the order, the same answer seedSeriesPositions and the source-insert path
    -- give a book whose place is unknown). It is not something this function should guess on the
    -- caller's behalf. Without this check the null reaches the final UPDATE and surfaces as a bare
    -- 23502 naming the column, which reads as a schema accident rather than a refused request.
    if exists (
      select 1 from jsonb_array_elements(p_slots) s where (s ->> 'position') is null
    ) then
      raise exception 'set_series_order: a slot has no position — a live slot always occupies a place in the order';
    end if;

    -- 1. Every slot must name a LIVE entry of THIS series owned by this reader.
    if exists (
      select 1
      from jsonb_array_elements(p_slots) s
      where not exists (
        select 1 from public.series_entries e
        where e.id = (s ->> 'entry_id')::uuid
          and e.series_id = p_series
          and e.owner_id = uid
          and e.removed_at is null
      )
    ) then
      raise exception 'set_series_order: a slot does not name a live entry of this series';
    end if;

    -- 2. Every LINKED book must be this reader's before books.position is touched. See header.
    if exists (
      select 1
      from jsonb_array_elements(p_slots) s
      join public.series_entries e on e.id = (s ->> 'entry_id')::uuid
      where e.book_id is not null
        and not exists (select 1 from public.books b where b.id = e.book_id and b.owner_id = uid)
    ) then
      raise exception 'not owner of linked book';
    end if;

    -- 3. The ELIGIBLE batch — the slots this call may actually write. For a source refresh that is
    --    the batch minus every row the reader has arranged, decided from the STORED flag. Resolved
    --    once, here, so every statement below works off the same set and the two counts cannot
    --    drift from each other.
    select coalesce(jsonb_agg(jsonb_build_object(
             'entry_id',  q.entry_id,
             'position',  q.position,
             'has_label', q.has_label,
             'label',     q.label
           ) order by q.ord), '[]'::jsonb)
      into v_eligible
    from (
      select (s ->> 'entry_id')::uuid   as entry_id,
             (s ->> 'position')::numeric as position,
             (s ? 'label')               as has_label,
             (s ->> 'label')             as label,
             ord                         as ord
      from jsonb_array_elements(p_slots) with ordinality t(s, ord)
    ) q
    join public.series_entries e on e.id = q.entry_id
    where p_origin = 'reader' or not e.user_edited;

    n_eligible := jsonb_array_length(v_eligible);
    if n_eligible < n_slots then
      raise notice 'set_series_order: left % reader-arranged slot(s) alone (origin=%)',
                   n_slots - n_eligible, p_origin;
    end if;
  else
    v_eligible := '[]'::jsonb;
  end if;

  if n_eligible > 0 then
    -- 4. Pre-flight, so a conflict names itself. Both of these would otherwise surface as a bare
    --    23505 naming only the index, which tells a reader nothing about which slot lost.
    if exists (
      select 1 from jsonb_array_elements(v_eligible) s
      group by (s ->> 'position')::numeric having count(*) > 1
    ) then
      raise exception 'set_series_order: two slots claim the same position';
    end if;

    -- The same entry named twice in one batch. Neither check above catches it (two DIFFERENT
    -- positions for one entry collide with nothing), and without this the last occurrence would
    -- quietly win both the park pass and the final write — a call that reports success having
    -- silently discarded half of what it was asked to do. A caller that sends this is confused
    -- about its own batch, and that is worth saying out loud rather than resolving by array order.
    if exists (
      select 1 from jsonb_array_elements(v_eligible) s
      group by (s ->> 'entry_id')::uuid having count(*) > 1
    ) then
      raise exception 'set_series_order: the same entry appears twice in one batch';
    end if;

    -- 4b. Occupancy. Origin-split (see header): a reader-origin collision is a stale cache or a
    --     bug and RAISES, unchanged; a source-origin collision drops the colliding slot and keeps
    --     the rest of the refresh. The loop is the fixed point the header derives — the exemption
    --     list inside the where clause is the CURRENT kept set, re-read each pass, so a dropped
    --     slot's entry rejoins the collision universe at its (kept) current position.
    if p_origin = 'reader' then
      if exists (
        select 1
        from jsonb_array_elements(v_eligible) s
        join public.series_entries e2
          on e2.series_id = p_series
         and e2.removed_at is null
         and e2.position = (s ->> 'position')::numeric
        where e2.id <> all (
          select (x ->> 'entry_id')::uuid from jsonb_array_elements(v_eligible) x
        )
      ) then
        raise exception 'set_series_order: a target position is already held by a slot outside this batch';
      end if;
    else
      loop
        select coalesce(jsonb_agg(t.s order by t.ord), '[]'::jsonb)
          into v_kept
        from jsonb_array_elements(v_eligible) with ordinality t(s, ord)
        where not exists (
          select 1 from public.series_entries e2
          where e2.series_id = p_series
            and e2.removed_at is null
            and e2.position = (t.s ->> 'position')::numeric
            and e2.id <> all (
              select (x ->> 'entry_id')::uuid from jsonb_array_elements(v_eligible) x
            )
        );
        exit when jsonb_array_length(v_kept) = jsonb_array_length(v_eligible);
        v_eligible := v_kept;
      end loop;
      n_collision := n_eligible - jsonb_array_length(v_eligible);
      if n_collision > 0 then
        raise notice 'set_series_order: skipped % move(s) whose target position is held outside the batch (origin=%)',
                     n_collision, p_origin;
      end if;
    end if;
  end if;

  -- The batch may have shrunk (or emptied) above, so the write gate reads the filtered set's own
  -- length rather than n_eligible, which stays fixed as skipped_user_edited's basis.
  if jsonb_array_length(v_eligible) > 0 then
    -- 5. PARK. See 20260814010000's probe table — this pass is why a one-statement reorder does
    --    not fail here.
    select greatest(
             coalesce((select max(e.position) from public.series_entries e
                        where e.series_id = p_series and e.removed_at is null), 0),
             coalesce((select max((s ->> 'position')::numeric)
                         from jsonb_array_elements(v_eligible) s), 0)
           ) + 1
      into v_off;

    update public.series_entries e
       set position = v_off + s.ord
      from (
        select (x ->> 'entry_id')::uuid as entry_id, ord
        from jsonb_array_elements(v_eligible) with ordinality t(x, ord)
      ) s
     where e.id = s.entry_id;

    -- 6. The real write. user_edited rises to true for a reader gesture and is otherwise carried
    --    through untouched — there is deliberately no branch that sets it false.
    update public.series_entries e
       set position    = s.position,
           label       = case when s.has_label then s.label else e.label end,
           user_edited = case when p_origin = 'reader' then true else e.user_edited end
      from (
        select (x ->> 'entry_id')::uuid    as entry_id,
               (x ->> 'position')::numeric as position,
               (x ->> 'has_label')::boolean as has_label,
               (x ->> 'label')             as label
        from jsonb_array_elements(v_eligible) x
      ) s
     where e.id = s.entry_id;
    get diagnostics n_moved = row_count;

    -- 7. ...and the synced copy, in the same transaction. book_id comes from the ENTRY ROW, never
    --    from the caller: the client used to send it from whatever its cache held, and a stale
    --    cache moved the wrong book. The entry is the only authority on what the slot links to.
    update public.books b
       set position = s.position
      from (
        select (x ->> 'entry_id')::uuid    as entry_id,
               (x ->> 'position')::numeric as position
        from jsonb_array_elements(v_eligible) x
      ) s
      join public.series_entries e on e.id = s.entry_id
     where b.id = e.book_id
       and b.owner_id = uid
       and b.position is distinct from s.position;
    get diagnostics n_books = row_count;
  end if;

  -- 8. Series length, and its synced copies. `p_opts ? 'length'` distinguishes "set it" from
  --    "leave it alone" the way merge_books' `p_fields ? 'x'` does — a jsonb null means CLEAR,
  --    an absent key means untouched. Member books are found by NAME, which is how books join
  --    series app-wide; Block D's name fragmentation is a separate problem this neither fixes
  --    nor worsens. (invalidate_enriched_stamp does not fire on series_count — its keys are
  --    title/author/isbn — so this cannot silently blank an enrichment stamp.)
  if p_opts ? 'length' then
    v_len := nullif(p_opts ->> 'length', '')::smallint;
    update public.series set length = v_len where id = p_series;
    update public.books set series_count = v_len
     where owner_id = uid and series = v_name and series_count is distinct from v_len;
    get diagnostics n_length_books = row_count;
    v_length_set := true;
  end if;

  return jsonb_build_object(
    'moved', n_moved,
    'skipped_user_edited', n_slots - n_eligible,
    'skipped_collision', n_collision,
    'books_synced', n_books,
    'length_set', v_length_set,
    'length_books_synced', n_length_books
  );
end;
$$;

comment on function public.set_series_order(uuid, jsonb, text, jsonb) is
  'The only write path for series position and series length. Repositions live series_entries '
  'and mirrors books.position/books.series_count in one transaction. Parks rows above the max '
  'before writing finals, because a non-deferrable partial unique index rejects a one-statement '
  'reorder. A source-origin batch can never move a user_edited row, and skips (rather than '
  'aborts on) a move whose target position is held outside the batch — both skips counted and '
  'returned. A reader-origin collision still raises. No path here sets user_edited false.';

revoke execute on function public.set_series_order(uuid, jsonb, text, jsonb) from public;
revoke execute on function public.set_series_order(uuid, jsonb, text, jsonb) from anon;
grant  execute on function public.set_series_order(uuid, jsonb, text, jsonb) to authenticated;
