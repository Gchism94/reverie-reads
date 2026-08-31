-- Structured series membership authority — Phase 2B.
--
-- Forward-only by design. Existing series_entries are NOT classified: is_primary defaults false
-- and both claims default to origin=unknown. A reader review or a newly trusted writer establishes
-- authority after this migration. The legacy books.series/position/series_count tuple remains as a
-- compatibility projection of one explicit primary membership; secondary memberships never write
-- it. No title-level data is backfilled here.

alter table public.series_entries
  add column is_primary boolean not null default false,
  add column membership_claim jsonb not null default '{"origin":"unknown"}'::jsonb,
  add column position_claim jsonb not null default '{"origin":"unknown"}'::jsonb;

alter table public.series_entries
  add constraint series_entries_primary_live_book_check
    check (not is_primary or (book_id is not null and removed_at is null)),
  add constraint series_entries_membership_claim_object_check
    check (jsonb_typeof(membership_claim) = 'object'),
  add constraint series_entries_membership_claim_origin_check
    check (
      membership_claim ? 'origin'
      and jsonb_typeof(membership_claim -> 'origin') = 'string'
      and membership_claim ->> 'origin' in ('unknown', 'reader', 'import', 'enrichment', 'corpus')
    ),
  add constraint series_entries_membership_claim_confidence_check
    check (
      not (membership_claim ? 'confidence')
      or (
        jsonb_typeof(membership_claim -> 'confidence') = 'string'
        and membership_claim ->> 'confidence' in ('high', 'medium', 'low', 'none')
      )
    ),
  add constraint series_entries_membership_claim_optional_text_check
    check (
      (not (membership_claim ? 'source') or jsonb_typeof(membership_claim -> 'source') = 'string')
      and (not (membership_claim ? 'sourceRef') or jsonb_typeof(membership_claim -> 'sourceRef') = 'string')
      and (not (membership_claim ? 'at') or jsonb_typeof(membership_claim -> 'at') = 'string')
    ),
  add constraint series_entries_position_claim_object_check
    check (jsonb_typeof(position_claim) = 'object'),
  add constraint series_entries_position_claim_origin_check
    check (
      position_claim ? 'origin'
      and jsonb_typeof(position_claim -> 'origin') = 'string'
      and position_claim ->> 'origin' in ('unknown', 'reader', 'import', 'enrichment', 'corpus')
    ),
  add constraint series_entries_position_claim_confidence_check
    check (
      not (position_claim ? 'confidence')
      or (
        jsonb_typeof(position_claim -> 'confidence') = 'string'
        and position_claim ->> 'confidence' in ('high', 'medium', 'low', 'none')
      )
    ),
  add constraint series_entries_position_claim_optional_text_check
    check (
      (not (position_claim ? 'source') or jsonb_typeof(position_claim -> 'source') = 'string')
      and (not (position_claim ? 'sourceRef') or jsonb_typeof(position_claim -> 'sourceRef') = 'string')
      and (not (position_claim ? 'at') or jsonb_typeof(position_claim -> 'at') = 'string')
    );

comment on column public.series_entries.is_primary is
  'The one live structured membership projected to books.series for legacy consumers. False is '
  'also the forward-only value for every historical entry until explicit review.';
comment on column public.series_entries.membership_claim is
  'Provenance for whether this book or ghost belongs to this series. Independent of order truth.';
comment on column public.series_entries.position_claim is
  'Provenance for this numeric in-series position. Unknown may still carry a deterministic display '
  'slot; it does not claim the number is bibliographically trusted.';

create unique index series_entries_primary_book_uidx
  on public.series_entries (owner_id, book_id)
  where is_primary and removed_at is null and book_id is not null;

-- merge_books re-parents every live loser entry before it applies the selected scalar fields. If
-- both source books have a primary membership in different series, changing the loser's book_id
-- would otherwise collide with the one-primary constraint before the selected winner can be
-- materialized. Preserve the receiving book's current primary for that intermediate step; the
-- trusted selected books.series claim promotes the intended winner later in the same transaction.
create or replace function public.demote_reparented_series_primary()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_primary and (new.book_id is null or new.removed_at is not null) then
    new.is_primary := false;
  elsif new.is_primary
     and new.book_id is not null
     and new.book_id is distinct from old.book_id
     and exists (
       select 1 from public.series_entries e
       where e.owner_id = new.owner_id
         and e.book_id = new.book_id
         and e.is_primary
         and e.removed_at is null
         and e.id <> new.id
     )
  then
    new.is_primary := false;
  end if;
  return new;
end;
$$;

revoke all on function public.demote_reparented_series_primary()
  from public, anon, authenticated, service_role;

create trigger series_entries_demote_reparented_primary
before update of book_id, removed_at, is_primary on public.series_entries
for each row execute function public.demote_reparented_series_primary();

-- merge_series can tombstone a primary loser entry when the same book already has a secondary
-- entry in the surviving series. At commit, promote that exact surviving membership only when the
-- compatibility string names it and its membership has been reviewed. This is deliberately
-- deferred: ordinary primary removal clears books.series, so it has no exact candidate and never
-- auto-promotes an unrelated secondary membership.
create or replace function public.repair_merged_series_primary()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate uuid;
begin
  if old.book_id is null then return new; end if;
  if exists (
    select 1 from public.series_entries e
    where e.owner_id = old.owner_id and e.book_id = old.book_id
      and e.is_primary and e.removed_at is null
  ) then
    return new;
  end if;
  select e.id into v_candidate
  from public.books b
  join public.series s on s.owner_id = b.owner_id and s.name = b.series
  join public.series_entries e on e.series_id = s.id and e.book_id = b.id
  where b.id = old.book_id
    and b.owner_id = old.owner_id
    and e.removed_at is null
    and e.membership_claim ->> 'origin' <> 'unknown'
  order by e.id
  limit 1;
  if v_candidate is not null then
    update public.series_entries set is_primary = true where id = v_candidate;
  end if;
  return new;
end;
$$;

revoke all on function public.repair_merged_series_primary()
  from public, anon, authenticated, service_role;

create constraint trigger series_entries_repair_merged_primary
after update on public.series_entries
deferrable initially deferred
for each row
when (old.is_primary and not new.is_primary)
execute function public.repair_merged_series_primary();

-- RLS checked only the entry owner and parent series. It did not check the linked book owner, so an
-- authenticated reader could construct an entry pointing at another reader's book. Enforce the
-- owner-consistent relation for every forward insert/update without rewriting historical rows.
create or replace function public.guard_series_entry_ownership()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.series s where s.id = new.series_id and s.owner_id = new.owner_id
  ) then
    raise exception 'series entry owner does not own the parent series' using errcode = '23514';
  end if;
  if new.book_id is not null and not exists (
    select 1 from public.books b where b.id = new.book_id and b.owner_id = new.owner_id
  ) then
    raise exception 'series entry owner does not own the linked book' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_series_entry_ownership()
  from public, anon, authenticated, service_role;

create trigger series_entries_guard_ownership
before insert or update of series_id, owner_id, book_id on public.series_entries
for each row execute function public.guard_series_entry_ownership();

-- Project one primary membership back to the scalar compatibility fields. The local setting avoids
-- making the books triggers interpret their own derived write as a new claim.
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
    and e.removed_at is null;
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

create or replace function public.project_changed_series_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.is_primary and old.book_id is not null then
    perform public.refresh_book_series_projection(old.book_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.is_primary and new.book_id is not null then
    perform public.refresh_book_series_projection(new.book_id);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.project_changed_series_entry()
  from public, anon, authenticated, service_role;

create trigger series_entries_project_primary
after insert or update of series_id, position, book_id, is_primary, membership_claim, removed_at
or delete on public.series_entries
for each row execute function public.project_changed_series_entry();

create or replace function public.project_changed_series()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_book uuid;
begin
  for v_book in
    select e.book_id
    from public.series_entries e
    where e.series_id = new.id and e.is_primary and e.removed_at is null and e.book_id is not null
  loop
    perform public.refresh_book_series_projection(v_book);
  end loop;
  return new;
end;
$$;

revoke all on function public.project_changed_series()
  from public, anon, authenticated, service_role;

create trigger series_project_primary_books
after update of name, length on public.series
for each row execute function public.project_changed_series();

-- The internal admission primitive. It keeps membership and order provenance separate, allows a
-- justified secondary membership, and uses one explicitly selected primary for compatibility.
create or replace function public.apply_series_membership(
  p_owner uuid,
  p_book uuid,
  p_series uuid,
  p_series_name text,
  p_position numeric,
  p_length integer,
  p_make_primary boolean,
  p_membership_claim jsonb,
  p_position_claim jsonb,
  p_strict_position boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_series uuid := p_series;
  v_entry uuid;
  v_position numeric := p_position;
  v_claim jsonb := coalesce(p_membership_claim, '{"origin":"unknown"}'::jsonb);
  v_position_claim jsonb := coalesce(p_position_claim, '{"origin":"unknown"}'::jsonb);
  v_title text;
  v_author text;
begin
  select b.title, coalesce(nullif(b.authors_display, ''), trim(concat_ws(' ', b.author_first, b.author_last)), '')
    into v_title, v_author
  from public.books b
  where b.id = p_book and b.owner_id = p_owner
  for update;
  if not found then raise exception 'not owner of book'; end if;

  if v_series is null then
    if nullif(trim(coalesce(p_series_name, '')), '') is null then
      raise exception 'series name is required' using errcode = '22023';
    end if;
    select s.id into v_series
    from public.series s
    where s.owner_id = p_owner and s.name = trim(p_series_name)
    for update;
    if v_series is null then
      insert into public.series (owner_id, name, length)
      values (p_owner, trim(p_series_name), p_length)
      returning id into v_series;
    end if;
  else
    perform 1 from public.series s where s.id = v_series and s.owner_id = p_owner for update;
    if not found then raise exception 'not owner of series'; end if;
  end if;

  if p_length is not null then
    update public.series set length = p_length where id = v_series and length is distinct from p_length;
  end if;

  select e.id into v_entry
  from public.series_entries e
  where e.series_id = v_series
    and e.owner_id = p_owner
    and e.book_id = p_book
    and e.removed_at is null
  for update;

  if v_position is null then
    select floor(coalesce(max(e.position), 0)) + 1 into v_position
    from public.series_entries e where e.series_id = v_series and e.removed_at is null;
    v_position_claim := '{"origin":"unknown"}'::jsonb;
  elsif exists (
    select 1 from public.series_entries e
    where e.series_id = v_series and e.removed_at is null and e.position = v_position
      and (v_entry is null or e.id <> v_entry)
  ) then
    if p_strict_position then
      raise exception 'series position is already occupied' using errcode = '23505';
    end if;
    select floor(greatest(coalesce(max(e.position), 0), v_position)) + 1 into v_position
    from public.series_entries e where e.series_id = v_series and e.removed_at is null;
    v_position_claim := '{"origin":"unknown"}'::jsonb;
  end if;

  if p_make_primary then
    update public.series_entries
       set is_primary = false
     where owner_id = p_owner and book_id = p_book and removed_at is null and is_primary
       and (v_entry is null or id <> v_entry);
  end if;

  if v_entry is null then
    insert into public.series_entries (
      series_id, owner_id, position, title, author, book_id, source, user_edited,
      is_primary, membership_claim, position_claim
    ) values (
      v_series, p_owner, v_position, v_title, v_author, p_book, 'manual',
      coalesce(v_claim ->> 'origin', 'unknown') = 'reader',
      p_make_primary, v_claim, v_position_claim
    ) returning id into v_entry;
  else
    update public.series_entries
       set position = v_position,
           membership_claim = v_claim,
           position_claim = v_position_claim,
           is_primary = p_make_primary or is_primary,
           user_edited = user_edited or coalesce(v_claim ->> 'origin', 'unknown') = 'reader'
     where id = v_entry;
  end if;

  if p_make_primary then perform public.refresh_book_series_projection(p_book); end if;
  return v_entry;
end;
$$;

revoke all on function public.apply_series_membership(uuid, uuid, uuid, text, numeric, integer, boolean, jsonb, jsonb, boolean)
  from public, anon, authenticated, service_role;

-- Authenticated owner boundary for book edit, Add/import review, and a deliberate secondary link.
create or replace function public.set_book_series_membership(
  p_book uuid,
  p_series uuid,
  p_series_name text,
  p_position numeric,
  p_length integer,
  p_make_primary boolean,
  p_membership_claim jsonb,
  p_position_claim jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_entry uuid;
begin
  if v_owner is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_series is null and nullif(trim(coalesce(p_series_name, '')), '') is null then
    if not coalesce(p_make_primary, true) then
      raise exception 'a secondary membership needs a series' using errcode = '22023';
    end if;
    select e.id into v_entry
    from public.series_entries e
    where e.owner_id = v_owner and e.book_id = p_book and e.is_primary and e.removed_at is null
    for update;
    if v_entry is not null then
      update public.series_entries
         set removed_at = now(), book_id = null, is_primary = false, user_edited = true,
             membership_claim = coalesce(p_membership_claim, '{"origin":"reader","source":"book_edit"}'::jsonb)
       where id = v_entry;
    else
      perform 1 from public.books b where b.id = p_book and b.owner_id = v_owner for update;
      if not found then raise exception 'not owner of book'; end if;
    end if;
    perform public.refresh_book_series_projection(
      p_book,
      coalesce(p_membership_claim, '{"origin":"reader","source":"book_edit"}'::jsonb),
      true
    );
    return v_entry;
  end if;
  return public.apply_series_membership(
    v_owner, p_book, p_series, p_series_name, p_position, p_length,
    coalesce(p_make_primary, true), p_membership_claim, p_position_claim,
    coalesce(p_position_claim ->> 'origin', 'unknown') = 'reader'
  );
end;
$$;

revoke all on function public.set_book_series_membership(uuid, uuid, text, numeric, integer, boolean, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.set_book_series_membership(uuid, uuid, text, numeric, integer, boolean, jsonb, jsonb)
  to authenticated;

-- Trusted forward book claims materialize in the SAME transaction as the book insert/update. A
-- low/unknown-confidence enrichment does not silently admit membership; it stays available for
-- review. Historical unknown rows remain untouched because this trigger is not a backfill.
create or replace function public.materialize_trusted_book_series_claim()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_origin text := coalesce(new.series_claim ->> 'origin', 'unknown');
  v_trusted boolean;
begin
  if current_setting('reverie.series_projection', true) = 'on' then return new; end if;
  v_trusted := v_origin in ('reader', 'import', 'corpus')
    or (v_origin = 'enrichment' and coalesce(new.series_claim ->> 'confidence', '') = 'high');

  if nullif(trim(coalesce(new.series, '')), '') is not null and v_trusted then
    perform public.apply_series_membership(
      new.owner_id, new.id, null, new.series, new.position, new.series_count, true,
      new.series_claim,
      case when new.position is null then '{"origin":"unknown"}'::jsonb else new.series_claim end,
      false
    );
  elsif nullif(trim(coalesce(new.series, '')), '') is null
    and v_origin in ('reader', 'corpus')
    and tg_op = 'UPDATE'
  then
    update public.series_entries
       set is_primary = false,
           removed_at = now(),
           book_id = null,
           user_edited = true,
           membership_claim = new.series_claim
     where owner_id = new.owner_id and book_id = new.id and removed_at is null and is_primary;
    perform public.refresh_book_series_projection(
      new.id, new.series_claim, v_origin = 'reader'
    );
  end if;
  return new;
end;
$$;

revoke all on function public.materialize_trusted_book_series_claim()
  from public, anon, authenticated, service_role;

create trigger books_materialize_trusted_series_insert
after insert on public.books
for each row execute function public.materialize_trusted_book_series_claim();
create trigger books_materialize_trusted_series_update
after update of series, series_claim on public.books
for each row execute function public.materialize_trusted_book_series_claim();

-- If an old/direct writer touches scalar position or length while a primary membership exists,
-- authority wins and re-projects. This closes divergence during the compatibility period without
-- refusing the schema-first rollout's currently deployed client.
create or replace function public.enforce_book_series_projection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('reverie.series_projection', true) <> 'on'
     and exists (
       select 1 from public.series_entries e
       where e.owner_id = new.owner_id and e.book_id = new.id and e.is_primary and e.removed_at is null
     )
  then
    perform public.refresh_book_series_projection(new.id);
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_book_series_projection()
  from public, anon, authenticated, service_role;

create trigger books_enforce_series_projection
after update of series, position, series_count, series_claim on public.books
for each row execute function public.enforce_book_series_projection();

-- Reordering delegates to the established collision-safe transaction, then records order
-- provenance only for entries whose requested final positions actually landed.
create or replace function public.set_series_order_claimed(
  p_series uuid,
  p_slots jsonb default '[]'::jsonb,
  p_origin text default 'reader',
  p_opts jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_claim jsonb;
begin
  v_result := public.set_series_order(p_series, p_slots, p_origin, p_opts);
  v_claim := jsonb_build_object(
    'origin', case when p_origin = 'reader' then 'reader' else 'enrichment' end,
    'source', case when p_origin = 'reader' then 'series_order' else 'hardcover_series' end,
    'at', now()
  );
  update public.series_entries e
     set position_claim = v_claim
    from (
      select (x ->> 'entry_id')::uuid as entry_id, (x ->> 'position')::numeric as position
      from jsonb_array_elements(coalesce(p_slots, '[]'::jsonb)) x
    ) wanted
   where e.id = wanted.entry_id
     and e.series_id = p_series
     and e.removed_at is null
     and e.position = wanted.position
     and (p_origin = 'reader' or not e.user_edited);
  return v_result;
end;
$$;

revoke all on function public.set_series_order_claimed(uuid, jsonb, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.set_series_order_claimed(uuid, jsonb, text, jsonb)
  to authenticated;

create or replace function public.set_primary_series_membership(p_entry uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_book uuid;
begin
  select e.book_id into v_book
  from public.series_entries e
  where e.id = p_entry and e.owner_id = v_owner and e.removed_at is null
  for update;
  if not found or v_book is null then raise exception 'live linked series entry not found'; end if;
  update public.series_entries set is_primary = false
   where owner_id = v_owner and book_id = v_book and removed_at is null and is_primary and id <> p_entry;
  update public.series_entries
     set is_primary = true,
         membership_claim = jsonb_build_object('origin', 'reader', 'source', 'primary_selection', 'at', now()),
         user_edited = true
   where id = p_entry;
  perform public.refresh_book_series_projection(v_book);
end;
$$;

revoke all on function public.set_primary_series_membership(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.set_primary_series_membership(uuid) to authenticated;

-- merge_books predates structured authority and applies its selected scalar series only after it
-- re-parents entries. The fail-closed scalar trigger correctly refuses to treat that naked string
-- as a new claim, so this owner-facing successor resolves the selected value back to an existing,
-- reviewed membership after the legacy atomic merge completes. No membership is inferred when the
-- selected string has no reviewed structured row.
create or replace function public.merge_books_authoritative(
  p_primary uuid,
  p_loser uuid,
  p_fields jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_selected text := nullif(trim(coalesce(p_fields ->> 'series', '')), '');
  v_entry uuid;
begin
  perform public.merge_books(p_primary, p_loser, p_fields);
  if v_selected is null then return; end if;

  select e.id into v_entry
  from public.series_entries e
  join public.series s on s.id = e.series_id
  where e.owner_id = v_owner
    and e.book_id = p_primary
    and e.removed_at is null
    and e.membership_claim ->> 'origin' <> 'unknown'
    and s.name = v_selected
  order by e.id
  limit 1;
  if v_entry is null then return; end if;

  update public.series_entries set is_primary = false
   where owner_id = v_owner and book_id = p_primary and removed_at is null
     and is_primary and id <> v_entry;
  update public.series_entries set is_primary = true where id = v_entry;
  perform public.refresh_book_series_projection(p_primary);
end;
$$;

revoke all on function public.merge_books_authoritative(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.merge_books_authoritative(uuid, uuid, jsonb) to authenticated;

-- merge_series can retire a primary loser entry before its legacy step that renames books. The
-- projection trigger immediately clears that book's scalar tuple—as it should—so the legacy name
-- predicate no longer sees the row. Capture only the exact redundant-book cases up front, run the
-- established atomic merge, then promote their reviewed surviving membership. Ordinary primary
-- removal remains non-promoting.
create or replace function public.merge_series_authoritative(
  p_primary uuid,
  p_loser uuid,
  p_name_key_a text,
  p_name_key_b text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_books uuid[];
  v_book uuid;
  v_entry uuid;
  v_result jsonb;
begin
  select coalesce(array_agg(loser.book_id order by loser.book_id), '{}'::uuid[])
    into v_books
  from public.series_entries loser
  where loser.owner_id = v_owner
    and loser.series_id = p_loser
    and loser.is_primary
    and loser.removed_at is null
    and loser.book_id is not null
    and exists (
      select 1 from public.series_entries survivor
      where survivor.owner_id = v_owner
        and survivor.series_id = p_primary
        and survivor.book_id = loser.book_id
        and survivor.removed_at is null
    );

  v_result := public.merge_series(
    p_primary, p_loser, p_name_key_a, p_name_key_b
  );

  foreach v_book in array v_books loop
    select e.id into v_entry
    from public.series_entries e
    where e.owner_id = v_owner
      and e.series_id = p_primary
      and e.book_id = v_book
      and e.removed_at is null
      and e.membership_claim ->> 'origin' <> 'unknown'
    order by e.id
    limit 1;
    if v_entry is not null then
      update public.series_entries set is_primary = false
       where owner_id = v_owner and book_id = v_book and removed_at is null
         and is_primary and id <> v_entry;
      update public.series_entries set is_primary = true where id = v_entry;
      perform public.refresh_book_series_projection(v_book);
    end if;
  end loop;
  return v_result;
end;
$$;

revoke all on function public.merge_series_authoritative(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.merge_series_authoritative(uuid, uuid, text, text) to authenticated;

create or replace function public.remove_series_membership(p_entry uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_book uuid;
  v_primary boolean;
  v_claim jsonb := jsonb_build_object('origin', 'reader', 'source', 'series_remove', 'at', now());
begin
  select e.book_id, e.is_primary into v_book, v_primary
  from public.series_entries e where e.id = p_entry and e.owner_id = v_owner for update;
  if not found then raise exception 'not owner of series entry'; end if;
  update public.series_entries
     set removed_at = now(), book_id = null, is_primary = false, user_edited = true,
         membership_claim = v_claim
   where id = p_entry;
  if v_primary and v_book is not null then
    perform public.refresh_book_series_projection(v_book, v_claim, true);
  end if;
end;
$$;

revoke all on function public.remove_series_membership(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.remove_series_membership(uuid) to authenticated;

create or replace function public.rename_personal_series(p_series uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
begin
  if nullif(trim(coalesce(p_name, '')), '') is null then
    raise exception 'series name is required' using errcode = '22023';
  end if;
  update public.series set name = trim(p_name)
   where id = p_series and owner_id = v_owner;
  if not found then raise exception 'not owner of series'; end if;
end;
$$;

revoke all on function public.rename_personal_series(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.rename_personal_series(uuid, text) to authenticated;

-- One explicit review admits the current exact-name compatibility books and confirms the live
-- slots on that series. It does not normalize names, merge variants, or touch tombstones.
create or replace function public.admit_series_compatibility_claims(
  p_series uuid,
  p_series_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_series uuid := p_series;
  v_name text := trim(coalesce(p_series_name, ''));
  v_book record;
  v_entry record;
  v_claim jsonb := jsonb_build_object('origin', 'reader', 'source', 'series_review', 'at', now());
  n_books integer := 0;
  n_entries integer := 0;
begin
  if v_owner is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if v_series is not null then
    select s.name into v_name from public.series s where s.id = v_series and s.owner_id = v_owner for update;
    if not found then raise exception 'not owner of series'; end if;
  elsif nullif(v_name, '') is null then
    raise exception 'series name is required' using errcode = '22023';
  end if;

  for v_book in
    select b.id, b.position, b.series_count
    from public.books b
    where b.owner_id = v_owner and b.removed_at is null and b.series = v_name
    order by b.position nulls last, b.title, b.id
  loop
    perform public.apply_series_membership(
      v_owner, v_book.id, v_series, v_name, v_book.position, v_book.series_count, true,
      v_claim, '{"origin":"unknown"}'::jsonb, false
    );
    if v_series is null then
      select s.id into v_series from public.series s where s.owner_id = v_owner and s.name = v_name;
    end if;
    n_books := n_books + 1;
  end loop;

  if v_series is null then
    insert into public.series (owner_id, name) values (v_owner, v_name) returning id into v_series;
  end if;

  for v_entry in
    select e.id, e.book_id
    from public.series_entries e
    where e.series_id = v_series and e.owner_id = v_owner and e.removed_at is null
      and e.membership_claim ->> 'origin' = 'unknown'
    order by e.position, e.id
  loop
    update public.series_entries
       set membership_claim = v_claim, user_edited = true,
           is_primary = case
             when v_entry.book_id is null then false
             when exists (
               select 1 from public.series_entries p
               where p.owner_id = v_owner and p.book_id = v_entry.book_id
                 and p.is_primary and p.removed_at is null and p.id <> v_entry.id
             ) then false
             else true
           end
     where id = v_entry.id;
    n_entries := n_entries + 1;
  end loop;

  return jsonb_build_object('series_id', v_series, 'books_admitted', n_books, 'entries_reviewed', n_entries);
end;
$$;

revoke all on function public.admit_series_compatibility_claims(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.admit_series_compatibility_claims(uuid, text) to authenticated;

-- Link a reviewed ghost to a newly created personal book without creating a duplicate slot.
create or replace function public.link_series_entry_to_book(
  p_entry uuid,
  p_book uuid,
  p_make_primary boolean,
  p_membership_claim jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
begin
  perform 1 from public.books b where b.id = p_book and b.owner_id = v_owner for update;
  if not found then raise exception 'not owner of book'; end if;
  perform 1 from public.series_entries e
   where e.id = p_entry and e.owner_id = v_owner and e.removed_at is null and e.book_id is null
   for update;
  if not found then raise exception 'live unlinked series entry not found'; end if;
  if p_make_primary then
    update public.series_entries set is_primary = false
     where owner_id = v_owner and book_id = p_book and removed_at is null and is_primary;
  end if;
  update public.series_entries
     set book_id = p_book,
         is_primary = coalesce(p_make_primary, true),
         membership_claim = coalesce(p_membership_claim, '{"origin":"reader","source":"ghost_acquire"}'::jsonb),
         user_edited = true
   where id = p_entry;
end;
$$;

revoke all on function public.link_series_entry_to_book(uuid, uuid, boolean, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.link_series_entry_to_book(uuid, uuid, boolean, jsonb) to authenticated;
