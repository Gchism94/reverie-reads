-- A series entry previously used one number for two different facts: the canonical volume number
-- and the reader's visual reading order. Dragging book 6 upward could therefore turn its displayed
-- volume into 5.8, while a canonical novella such as ACOTAR 3.5 could not remain the fourth item in
-- the shelf without lying about one of those facts. Keep `position` as the bibliographic volume
-- number and give the reader's order its own private key.

alter table public.series_entries
  add column sort_order numeric,
  add column sort_user_edited boolean;

update public.series_entries
   set sort_order = position,
       sort_user_edited = user_edited;

alter table public.series_entries
  alter column sort_order set not null,
  alter column sort_user_edited set not null,
  alter column sort_user_edited set default false;

comment on column public.series_entries.position is
  'Canonical volume number within the series. Half volumes such as 3.5 are first-class and do not imply fourth place in a reading order.';
comment on column public.series_entries.sort_order is
  'Private persistence key for the reader-visible order. Midpoint decimals are internal and are never rendered as volume numbers.';
comment on column public.series_entries.sort_user_edited is
  'True after a reader reorders this slot. Source refreshes may update an untouched order but never overwrite a reader arrangement.';

create index series_entries_live_sort_idx
  on public.series_entries (series_id, sort_order, position, id)
  where removed_at is null;

-- Keep older trusted writers compatible. A new row begins in canonical order. A source-origin
-- canonical position correction may move an untouched reading order with it; a reader-edited order
-- and a reader editing only the volume number remain independent. A deliberate cross-series merge
-- uses the merge's already-reviewed collision-resolved position as the incoming order.
create function public.sync_series_entry_reading_order()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.sort_order is null then
      new.sort_order := new.position;
    end if;
    if new.user_edited and not new.sort_user_edited then
      new.sort_user_edited := true;
    end if;
    return new;
  end if;

  if new.series_id is distinct from old.series_id
     and new.sort_order is not distinct from old.sort_order then
    new.sort_order := new.position;
  elsif new.position is distinct from old.position
     and new.sort_order is not distinct from old.sort_order
     and not new.user_edited
     and not new.sort_user_edited then
    new.sort_order := new.position;
  end if;
  return new;
end;
$$;

create trigger series_entries_reading_order_sync
before insert or update of series_id, position, sort_order, user_edited, sort_user_edited
on public.series_entries
for each row execute function public.sync_series_entry_reading_order();

revoke all on function public.sync_series_entry_reading_order()
  from public, anon, authenticated, service_role;

create function public.set_series_reading_order(
  p_series uuid,
  p_slots jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  slot_count integer;
  moved_count integer;
begin
  if uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  perform 1
    from public.series
   where id = p_series and owner_id = uid and archived_at is null
   for update;
  if not found then
    raise exception 'series not found or not owned' using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_slots, '[]'::jsonb)) <> 'array' then
    raise exception 'set_series_reading_order: p_slots must be an array'
      using errcode = '22023';
  end if;

  create temp table if not exists series_reading_order_slots (
    entry_id uuid primary key,
    sort_order numeric not null
  ) on commit drop;
  truncate table series_reading_order_slots;

  begin
    insert into series_reading_order_slots (entry_id, sort_order)
    select
      (slot ->> 'entry_id')::uuid,
      (slot ->> 'sort_order')::numeric
    from jsonb_array_elements(coalesce(p_slots, '[]'::jsonb)) slot;
  exception
    when not_null_violation or invalid_text_representation or unique_violation then
      raise exception 'set_series_reading_order: every slot needs one unique entry_id and numeric sort_order'
        using errcode = '22023';
  end;

  select count(*) into slot_count from series_reading_order_slots;
  if slot_count > 1000 then
    raise exception 'set_series_reading_order: at most 1000 slots may move at once'
      using errcode = '22023';
  end if;

  if exists (
    select 1
      from series_reading_order_slots slot
      left join public.series_entries entry
        on entry.id = slot.entry_id
       and entry.series_id = p_series
       and entry.owner_id = uid
       and entry.removed_at is null
       and entry.membership_claim ->> 'origin' <> 'unknown'
     where entry.id is null
  ) then
    raise exception 'set_series_reading_order: a slot does not name a confirmed live entry of this series'
      using errcode = '22023';
  end if;

  update public.series_entries entry
     set sort_order = slot.sort_order,
         sort_user_edited = true
    from series_reading_order_slots slot
   where entry.id = slot.entry_id
     and entry.series_id = p_series
     and entry.owner_id = uid
     and entry.removed_at is null
     and entry.membership_claim ->> 'origin' <> 'unknown';
  get diagnostics moved_count = row_count;

  -- Repeat the ownership/membership boundary on the write itself. The series row lock
  -- serializes ordinary series mutations, while this count check also makes a stale or
  -- concurrently changed slot fail atomically instead of becoming a partial reorder.
  if moved_count <> slot_count then
    raise exception 'set_series_reading_order: a slot changed before the order could be saved'
      using errcode = '22023';
  end if;

  return jsonb_build_object('moved', moved_count);
end;
$$;

revoke all on function public.set_series_reading_order(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.set_series_reading_order(uuid, jsonb)
  to authenticated;

comment on function public.set_series_reading_order(uuid, jsonb) is
  'Atomically updates private reading-order keys for owned live entries without changing canonical volume numbers or the books.position projection.';
