-- Reversible personal-series archive.
--
-- A series row owns live slots, ghost slots, and removal tombstones through an ON DELETE CASCADE
-- foreign key. Deleting it is therefore the wrong user-facing operation: the cascade would erase
-- recovery evidence as well as the visible shelf. Archive keeps the entire graph in place, clears
-- only the compatibility projection from books that used this series as primary, and remembers
-- that primary intent on the exact entry that held it.
--
-- Restore is deliberately conditional. A reader may choose a different primary series for a book
-- while this series is archived. In that case the restored membership remains secondary; restore
-- never overwrites the newer choice.

-- Close the legacy auto-exposure gap on the consolidation ruling table at the same boundary. The
-- browser reads an owner's prior rulings so it does not repeatedly propose rejected pairs; all
-- mutations remain behind record_series_ruling/merge_series. Local Supabase starts from a clean
-- ACL while the production project retained legacy table grants, so reset every API role first.
revoke all on table public.series_merge_decisions
  from public, anon, authenticated, service_role;
grant select on table public.series_merge_decisions to authenticated;
grant all on table public.series_merge_decisions to service_role;

alter table public.series
  add column archived_at timestamptz;

comment on column public.series.archived_at is
  'Soft archive for a personal series. Archived series are excluded from ordinary reader queries '
  'and remain recoverable with all live, ghost, and tombstone entries intact.';

alter table public.series_entries
  add column archive_primary_intent boolean not null default false;

comment on column public.series_entries.archive_primary_intent is
  'True only when this exact live linked entry was primary as its parent series was archived. '
  'Restore promotes it only if the book has no newer active primary membership.';

create index series_owner_archived_idx
  on public.series (owner_id, archived_at)
  where archived_at is not null;

-- Ordinary table reads and writes see only active series. Recovery is intentionally a separate,
-- owner-checked RPC below so an archived row cannot leak back into the main series surface merely
-- because a caller forgot a filter. Service-role maintenance continues to bypass RLS.
drop policy if exists "series: select own" on public.series;
create policy "series: select own" on public.series for select
  using (owner_id = (select auth.uid()) and archived_at is null);

drop policy if exists "series: insert own" on public.series;
create policy "series: insert own" on public.series for insert
  with check (owner_id = (select auth.uid()) and archived_at is null);

drop policy if exists "series: update own" on public.series;
create policy "series: update own" on public.series for update
  using (owner_id = (select auth.uid()) and archived_at is null)
  with check (owner_id = (select auth.uid()) and archived_at is null);

drop policy if exists "series: delete own" on public.series;
create policy "series: delete own" on public.series for delete
  using (owner_id = (select auth.uid()) and archived_at is null);

drop policy if exists "series_entries: select own" on public.series_entries;
create policy "series_entries: select own" on public.series_entries for select
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.series s
      where s.id = series_id and s.owner_id = (select auth.uid()) and s.archived_at is null
    )
  );

drop policy if exists "series_entries: insert own" on public.series_entries;
create policy "series_entries: insert own" on public.series_entries for insert
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.series s
      where s.id = series_id and s.owner_id = (select auth.uid()) and s.archived_at is null
    )
  );

drop policy if exists "series_entries: update own" on public.series_entries;
create policy "series_entries: update own" on public.series_entries for update
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.series s
      where s.id = series_id and s.owner_id = (select auth.uid()) and s.archived_at is null
    )
  )
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.series s
      where s.id = series_id and s.owner_id = (select auth.uid()) and s.archived_at is null
    )
  );

drop policy if exists "series_entries: delete own" on public.series_entries;
create policy "series_entries: delete own" on public.series_entries for delete
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.series s
      where s.id = series_id and s.owner_id = (select auth.uid()) and s.archived_at is null
    )
  );

-- A trigger closes paths that run under SECURITY DEFINER and therefore bypass the RLS policies.
-- Archive demotes entries while the parent is still active; restore activates the parent before it
-- evaluates saved primary intent. No other writer may mutate an archived series entry in between.
create or replace function public.guard_archived_series_entry_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if exists (
      select 1 from public.series s where s.id = new.series_id and s.archived_at is not null
    ) then
      raise exception 'series is archived; restore it first' using errcode = '55000';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if exists (
      select 1 from public.series s
      where s.id in (old.series_id, new.series_id) and s.archived_at is not null
    ) then
      raise exception 'series is archived; restore it first' using errcode = '55000';
    end if;
    return new;
  end if;

  -- DELETE is guarded too: otherwise a definer/table-owner path could silently erase a ghost or
  -- tombstone while RLS hid its parent. The sole exception is the JWT-less auth.users deletion
  -- cascade, which must still be able to remove the whole account graph. Reader-authenticated
  -- calls (including SECURITY DEFINER RPCs) retain auth.uid() and therefore cannot use it.
  if exists (
    select 1 from public.series s where s.id = old.series_id and s.archived_at is not null
  ) and (select auth.uid()) is not null then
    raise exception 'series is archived; restore it first' using errcode = '55000';
  end if;
  return old;
end;
$$;

revoke all on function public.guard_archived_series_entry_write()
  from public, anon, authenticated, service_role;

create trigger series_entries_guard_archived_parent
before insert or update or delete on public.series_entries
for each row execute function public.guard_archived_series_entry_write();

-- Projection is active-series-only even for internal callers. This makes an archived primary
-- impossible to project if malformed legacy/service data ever bypasses the lifecycle RPC.
create or replace function public.refresh_book_series_projection(
  p_book uuid,
  p_empty_claim jsonb default '{"origin":"unknown"}'::jsonb,
  p_empty_user_chosen boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_name text;
  v_position numeric;
  v_length smallint;
  v_claim jsonb;
  v_has_primary boolean;
  v_previous_setting text := coalesce(current_setting('reverie.series_projection', true), 'off');
begin
  select b.owner_id into v_owner from public.books b where b.id = p_book for update;
  if not found then return; end if;

  select s.name, e.position, s.length, e.membership_claim
    into v_name, v_position, v_length, v_claim
  from public.series_entries e
  join public.series s on s.id = e.series_id
  where e.owner_id = v_owner
    and e.book_id = p_book
    and e.is_primary
    and e.removed_at is null
    and s.archived_at is null;
  v_has_primary := found;

  perform set_config('reverie.series_projection', 'on', true);
  if v_has_primary then
    update public.books
       set series = v_name,
           position = v_position,
           series_count = v_length,
           series_user_chosen = coalesce(v_claim ->> 'origin', 'unknown') = 'reader',
           series_claim = v_claim
     where id = p_book and owner_id = v_owner;
  else
    update public.books
       set series = null,
           position = null,
           series_count = null,
           series_user_chosen = p_empty_user_chosen,
           series_claim = p_empty_claim
     where id = p_book and owner_id = v_owner;
  end if;
  perform set_config('reverie.series_projection', v_previous_setting, true);
end;
$$;

revoke all on function public.refresh_book_series_projection(uuid, jsonb, boolean)
  from public, anon, authenticated, service_role;

create or replace function public.archive_personal_series(p_series uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_archived_at timestamptz;
  v_primary_books uuid[];
  v_entries integer;
  v_books_cleared integer;
  v_book uuid;
  v_claim jsonb := jsonb_build_object(
    'origin', 'reader', 'source', 'series_archive', 'at', now()
  );
begin
  if v_owner is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- Every writer that materializes a membership takes its book first and its series second
  -- (apply_series_membership). Archive must use the same order: taking the series first and then
  -- letting the projection trigger wait on a book would deadlock with that established path.
  -- Pre-lock the books visible before the series lock, in a total order.
  perform 1
  from public.books b
  join public.series_entries e
    on e.book_id = b.id and e.owner_id = b.owner_id
  join public.series s
    on s.id = e.series_id and s.owner_id = e.owner_id
  where e.series_id = p_series
    and e.owner_id = v_owner
    and s.archived_at is null
  order by b.id
  for update of b;

  select s.archived_at into v_archived_at
  from public.series s
  where s.id = p_series and s.owner_id = v_owner
  for update;
  if not found then raise exception 'not owner of series'; end if;

  select count(*)::integer into v_entries
  from public.series_entries e where e.series_id = p_series;

  if v_archived_at is not null then
    select count(*)::integer into v_books_cleared
    from public.series_entries e
    where e.series_id = p_series and e.archive_primary_intent;
    return jsonb_build_object(
      'series_id', p_series,
      'entries_preserved', v_entries,
      'books_cleared', v_books_cleared,
      'already_archived', true
    );
  end if;

  -- A membership transaction may have committed after the first snapshot but before this series
  -- lock. Re-query now, while no new writer can pass the series lock, and lock any newly visible
  -- linked books in the same stable order. A writer that still holds its new book but lost this
  -- series-lock race resumes only after archive commits; its entry write then hits the archived-
  -- parent guard and rolls back safely.
  perform 1
  from public.books b
  join public.series_entries e
    on e.book_id = b.id and e.owner_id = b.owner_id
  where e.series_id = p_series and e.owner_id = v_owner
  order by b.id
  for update of b;

  perform 1
  from public.series_entries e
  where e.series_id = p_series
  order by e.id
  for update;

  -- Capture the exact linked entries whose primary projection is about to be suspended after the
  -- entry locks are held. Keep book_id intact: archival removes no membership, book, read, ghost,
  -- or tombstone.
  select coalesce(array_agg(e.book_id order by e.book_id), '{}'::uuid[])
    into v_primary_books
  from public.series_entries e
  where e.series_id = p_series
    and e.removed_at is null
    and e.book_id is not null
    and e.is_primary;
  v_books_cleared := cardinality(v_primary_books);

  update public.series_entries e
     set archive_primary_intent = e.removed_at is null and e.book_id is not null and e.is_primary,
         is_primary = false
   where e.series_id = p_series;

  -- Demoting each saved primary fires the projection trigger and clears its scalar tuple. Refresh
  -- once more with the archive claim so that clear is recorded as a deliberate reader action rather
  -- than an unexplained unknown; no other private book data changes.
  foreach v_book in array v_primary_books loop
    perform public.refresh_book_series_projection(v_book, v_claim, true);
  end loop;

  update public.series
     set archived_at = now()
   where id = p_series and owner_id = v_owner;

  return jsonb_build_object(
    'series_id', p_series,
    'entries_preserved', v_entries,
    'books_cleared', v_books_cleared,
    'already_archived', false
  );
end;
$$;

revoke all on function public.archive_personal_series(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.archive_personal_series(uuid) to authenticated;

create or replace function public.restore_personal_series(p_series uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_archived_at timestamptz;
  v_entry record;
  v_restored integer := 0;
  v_skipped integer := 0;
begin
  if v_owner is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- Match apply_series_membership's book → series → entry order. Without this pre-lock, restore
  -- could hold the series and entries, then wait on a book held by a membership writer that was
  -- itself waiting on the series. Only currently linked books belong in this set. A ghost linker
  -- locks its future book then the ghost entry; restore never needs that future book, so whichever
  -- side owns the ghost entry first creates a one-way wait rather than a cycle.
  perform 1
  from public.books b
  join public.series_entries e
    on e.book_id = b.id and e.owner_id = b.owner_id
  join public.series s
    on s.id = e.series_id and s.owner_id = e.owner_id
  where e.series_id = p_series
    and e.owner_id = v_owner
    and s.archived_at is not null
  order by b.id
  for update of b;

  select s.archived_at into v_archived_at
  from public.series s
  where s.id = p_series and s.owner_id = v_owner
  for update;
  if not found then raise exception 'not owner of series'; end if;

  if v_archived_at is null then
    return jsonb_build_object(
      'series_id', p_series,
      'primaries_restored', 0,
      'primaries_skipped', 0,
      'already_active', true
    );
  end if;

  perform 1
  from public.series_entries e
  where e.series_id = p_series
  order by e.id
  for update;

  -- Activate first so the archived-parent write guard permits the deliberate restoration below.
  update public.series
     set archived_at = null
   where id = p_series and owner_id = v_owner;

  for v_entry in
    select e.id, e.book_id
    from public.series_entries e
    where e.series_id = p_series
      and e.archive_primary_intent
      and e.removed_at is null
      and e.book_id is not null
    order by e.book_id, e.id
  loop
    perform 1 from public.books b
    where b.id = v_entry.book_id and b.owner_id = v_owner
    for update;

    if found and not exists (
      select 1
      from public.series_entries primary_entry
      join public.series primary_series on primary_series.id = primary_entry.series_id
      where primary_entry.owner_id = v_owner
        and primary_entry.book_id = v_entry.book_id
        and primary_entry.is_primary
        and primary_entry.removed_at is null
        and primary_series.archived_at is null
        and primary_entry.id <> v_entry.id
    ) then
      update public.series_entries
         set is_primary = true
       where id = v_entry.id;
      v_restored := v_restored + 1;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  -- The saved intent belongs to this one archive/restore cycle. A skipped membership is now an
  -- ordinary secondary, and a later archive must capture the then-current primary state afresh.
  update public.series_entries
     set archive_primary_intent = false
   where series_id = p_series and archive_primary_intent;

  return jsonb_build_object(
    'series_id', p_series,
    'primaries_restored', v_restored,
    'primaries_skipped', v_skipped,
    'already_active', false
  );
end;
$$;

revoke all on function public.restore_personal_series(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.restore_personal_series(uuid) to authenticated;

create or replace function public.list_archived_personal_series()
returns table (
  id uuid,
  name text,
  status text,
  length smallint,
  archived_at timestamptz,
  entry_count bigint,
  linked_book_count bigint,
  ghost_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id,
         s.name,
         s.status,
         s.length,
         s.archived_at,
         count(e.id) filter (where e.removed_at is null) as entry_count,
         count(e.id) filter (where e.removed_at is null and e.book_id is not null) as linked_book_count,
         count(e.id) filter (where e.removed_at is null and e.book_id is null) as ghost_count
  from public.series s
  left join public.series_entries e on e.series_id = s.id
  where s.owner_id = (select auth.uid())
    and s.archived_at is not null
  group by s.id, s.name, s.status, s.length, s.archived_at
  order by s.archived_at desc, s.name, s.id;
$$;

revoke all on function public.list_archived_personal_series()
  from public, anon, authenticated, service_role;
grant execute on function public.list_archived_personal_series() to authenticated;
