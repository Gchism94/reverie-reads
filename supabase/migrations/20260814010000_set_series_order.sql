-- set_series_order — the ONE write path for series position and series length.
-- Phase 2 of feat/series-integrity-mechanism (docs/tasks/task-series-integrity-mechanism.md).
--
-- ── What it closes ──────────────────────────────────────────────────────────────────────────────
-- `syncBookPosition` (apps/web/src/data/series.ts) mirrored a linked entry's position onto its book
-- row as a SECOND, independently-committed statement. docs/audits/series-count-schema.md §5 names
-- it directly: "two unserialized statements with no DB enforcement — exactly the dual-write-
-- without-a-chokepoint shape the enriched_stamp_invalidate comment warns about." A failure between
-- them left `series_entries.position` and `books.position` disagreeing with nothing to notice.
-- Both writes now land in one transaction or neither does, and the book id is derived server-side
-- so a stale client cache cannot move the wrong book (remove_series_entry's own lesson).
--
-- ── WHY THE BODY PARKS BEFORE IT WRITES — measured, not assumed ─────────────────────────────────
-- `series_entries_position_uidx` (20260816010000) is a NON-DEFERRABLE partial unique index, and
-- Postgres checks it per row as a statement walks them. Probed against this database, each in a
-- rolled-back transaction:
--
--   A. single-statement swap of two positions ................ FAILS 23505
--   B. whole-list renumber 3->1, 1->2, 2->3 in one statement .. FAILS 23505   <- useMoveEntry's
--                                                                               `updates` branch
--   C. park above the max, then write finals (two statements) . SUCCEEDS, correct values
--   D. `set constraints series_entries_position_uidx deferred`  FAILS 42704 — a unique INDEX is
--                                                                not a constraint and cannot defer
--   E. `add constraint ... unique (...) where (...)` .......... FAILS 42601 — partial UNIQUE
--                                                                constraints do not exist
--   F. deferrable partial EXCLUDE constraint + deferred swap .. SUCCEEDS, rejects dupes as 23P01
--
-- So a single batched UPDATE is NOT sufficient — B is the exact shape the client sends, and it
-- fails. F is a real alternative and was refused: adopting it means rewriting Phase 1's shipped
-- index and the three pgTAP assertions that hard-code 23505, swapping a cheap index for a heavier
-- constraint, and moving failures to COMMIT time where PostgREST reports them least legibly — all
-- to buy a mechanism the two statements below get locally.
--
-- The parking offset is `greatest(max live position, max REQUESTED position) + 1`. Both halves are
-- load-bearing. Parking only above the live max lets a caller's target value collide with another
-- row's parked value; with this bound every parked value exceeds every untouched live position AND
-- every final value, and ordinality keeps them distinct from each other.
--
-- ── user_edited IS CHECKED SERVER-SIDE, AND CAN ONLY EVER BE RAISED ─────────────────────────────
-- CLAUDE.md's hard rule: never silently overwrite a reader-set position. Phase 0 confirmed the flag
-- means what the rule assumes. Here:
--   · p_origin = 'source' (catalog refresh, machine seeding) — every target row's STORED
--     user_edited is read inside this transaction and true rows are dropped from the batch. The
--     caller's own opinion of the flag is never consulted; `mergeSourceEntries` makes that call
--     client-side today, from possibly-stale cache. Skipped rows are counted and RETURNED so the UI
--     can say what it left alone instead of appearing to no-op.
--   · p_origin = 'reader' (drag, up/down, a typed number) — the row is written and the flag set true.
--   · NOTHING here writes user_edited = false. The `case` below has no branch that lowers it.
--     Clearing the flag remains the province of a one-shot service_role repair migration
--     (20260810010000_reset_seeded_user_edited.sql). This function gains no power to weaken the
--     protection it exists to enforce.
--
-- ── Ownership checks are the boundary, not the grant ────────────────────────────────────────────
-- security definer bypasses RLS, so the raises below ARE the wall between one reader and another's
-- rows (20260806010000: "no function may depend on its grant for safety"). Three of them, matching
-- remove_series_entry: the series, every entry, and separately every LINKED BOOK — that third is
-- not ceremony. series_entries' insert policy constrains the entry's owner_id but places no
-- constraint on book_id's owner, so an entry may legally link a book belonging to someone else;
-- without the check the definer would move that other reader's books.position.
--
-- A stale entry id RAISES rather than being skipped. Silently dropping a slot the caller believes
-- exists is the removal-bug shape: the write looks successful and simply did not happen.

-- ── The position default goes ─────────────────────────────────────────────────────────────────
-- `position numeric not null default 0` meant any insert that omitted the column landed at 0 and
-- collided with the next one, silently, in a column whose whole purpose is ordering. The Phase 1
-- header flagged this as a Phase 2 job. Dropping the DEFAULT removes no data and no column: an
-- omitting insert now fails the NOT NULL loudly instead of quietly picking a colliding value.
-- Verified before dropping: every insert site in the app, e2e fixtures, seeds and pgTAP passes
-- `position` explicitly, so nothing relied on the default.
alter table public.series_entries alter column position drop default;

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
  v_len smallint;
  v_off numeric;
  n_slots int := jsonb_array_length(coalesce(p_slots, '[]'::jsonb));
  n_eligible int := 0;
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

    -- 5. PARK. See the probe table in the header — this pass is why B does not fail here.
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
  'reorder. A source-origin batch can never move a user_edited row, and no path here sets '
  'user_edited false.';

-- Postgres grants EXECUTE to PUBLIC on every new function, so the revoke is the boundary-shaped
-- half and the grant is additive (CLAUDE.md). `from anon` BY NAME as well: 20260806010000 records
-- a platform-issued bulk grant that named anon directly, which `revoke ... from public` would not
-- have touched.
revoke execute on function public.set_series_order(uuid, jsonb, text, jsonb) from public;
revoke execute on function public.set_series_order(uuid, jsonb, text, jsonb) from anon;
grant  execute on function public.set_series_order(uuid, jsonb, text, jsonb) to authenticated;
