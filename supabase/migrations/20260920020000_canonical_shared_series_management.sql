-- Administrator lifecycle for the canonical shared-series catalog.
-- Every RPC is optimistic (`p_expected_revision`) and follows the existing lock order:
-- affected personal books -> works -> normalized identity advisory keys -> catalog rows.

create function public.update_corpus_series(
  p_series uuid,
  p_expected_revision bigint,
  p_name text,
  p_status text,
  p_declared_count integer,
  p_aliases text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  caller uuid := (select auth.uid());
  current_row public.corpus_series%rowtype;
  updated_row public.corpus_series%rowtype;
  clean_name text := nullif(trim(coalesce(p_name, '')), '');
  new_key text;
  old_name text;
  alias_name text;
  alias_key text;
begin
  if caller is null or not public.is_corpus_admin() then
    raise exception 'corpus administrator required' using errcode = '42501';
  end if;
  if clean_name is null then
    raise exception 'series name is required' using errcode = '22023';
  end if;
  if p_status is not null and p_status not in (
    'ongoing', 'completed', 'on_hiatus', 'cancelled',
    'interconnected_standalone', 'interconnected_series'
  ) then
    raise exception 'invalid series status' using errcode = '22023';
  end if;
  if p_declared_count is not null and p_declared_count not between 1 and 999 then
    raise exception 'series length must be between 1 and 999' using errcode = '22023';
  end if;

  select s.* into current_row from public.corpus_series s where s.id = p_series;
  if not found or current_row.archived_at is not null then
    raise exception 'active corpus series not found' using errcode = 'P0002';
  end if;

  -- Match shared-work writers that already take personal books before corpus works.
  perform 1
  from public.books b
  join public.corpus_series_entries e on e.work_id = b.corpus_work_id
  where e.series_id = p_series and e.removed_at is null and e.is_primary
    and b.removed_at is null
  order by b.id
  for update of b;
  perform 1
  from public.works w
  join public.corpus_series_entries e on e.work_id = w.id
  where e.series_id = p_series and e.removed_at is null and e.is_primary
  order by w.id
  for update of w;

  new_key := public.corpus_series_identity_key(clean_name);
  perform pg_advisory_xact_lock(hashtextextended(identity_key, 0))
  from (
    select distinct identity_key
    from unnest(array[
      'name:' || current_row.name_key || ':' || current_row.creator_key,
      'name:' || new_key || ':' || current_row.creator_key
    ]) as keys(identity_key)
    order by identity_key
  ) ordered_keys;

  select s.* into current_row from public.corpus_series s where s.id = p_series for update;
  if current_row.revision <> p_expected_revision then
    raise exception 'corpus series changed; refresh before saving' using errcode = 'PT409';
  end if;
  old_name := current_row.name;
  update public.corpus_series
     set name = clean_name,
         name_key = new_key,
         status = p_status,
         declared_count = p_declared_count,
         catalog_state = 'confirmed',
         reviewed_by = caller,
         revision = revision + 1
   where id = p_series
   returning * into updated_row;

  update public.corpus_series_names
     set name = clean_name, name_key = new_key, source = 'manual', source_ref = caller::text
   where series_id = p_series and kind = 'canonical';

  if public.corpus_series_identity_key(old_name) <> new_key then
    insert into public.corpus_series_names (
      series_id, name, name_key, creator_key, kind, source, source_ref
    ) values (
      p_series, old_name, public.corpus_series_identity_key(old_name),
      current_row.creator_key, 'alias', 'manual', caller::text
    ) on conflict (series_id, name_key, creator_key) do nothing;
  end if;

  foreach alias_name in array coalesce(p_aliases, '{}'::text[]) loop
    alias_name := nullif(trim(alias_name), '');
    if alias_name is null then continue; end if;
    alias_key := public.corpus_series_identity_key(alias_name);
    insert into public.corpus_series_names (
      series_id, name, name_key, creator_key, kind, source, source_ref
    ) values (
      p_series, alias_name, alias_key, current_row.creator_key,
      case when alias_key = new_key then 'canonical' else 'alias' end,
      'manual', caller::text
    ) on conflict (series_id, name_key, creator_key) do nothing;
  end loop;

  perform set_config('reverie.series_manual_editor', 'on', true);
  perform set_config('reverie.corpus_series_target', p_series::text, true);
  update public.works w
     set series = clean_name,
         series_count = p_declared_count,
         status = coalesce(p_status, w.status)
    from public.corpus_series_entries e
   where e.series_id = p_series and e.work_id = w.id
     and e.removed_at is null and e.is_primary;
  perform set_config('reverie.corpus_series_target', '', true);
  perform set_config('reverie.series_manual_editor', '', true);

  insert into public.corpus_series_edits (
    series_id, editor_id, action, previous_value, next_value
  ) values (
    p_series, caller,
    case when old_name is distinct from clean_name then 'rename' else 'update' end,
    to_jsonb(current_row), to_jsonb(updated_row)
  );
  select s.* into updated_row from public.corpus_series s where s.id = p_series;
  return to_jsonb(updated_row);
exception when others then
  perform set_config('reverie.corpus_series_target', '', true);
  perform set_config('reverie.series_manual_editor', '', true);
  raise;
end;
$fn$;

revoke all on function public.update_corpus_series(uuid, bigint, text, text, integer, text[])
  from public, anon, authenticated, service_role;
grant execute on function public.update_corpus_series(uuid, bigint, text, text, integer, text[])
  to authenticated;

create function public.merge_corpus_series(
  p_target uuid,
  p_source uuid,
  p_expected_target_revision bigint,
  p_expected_source_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  caller uuid := (select auth.uid());
  target_row public.corpus_series%rowtype;
  source_row public.corpus_series%rowtype;
  moved_entries integer := 0;
  folded_entries integer := 0;
begin
  if caller is null or not public.is_corpus_admin() then
    raise exception 'corpus administrator required' using errcode = '42501';
  end if;
  if p_target = p_source then
    raise exception 'a series cannot be merged into itself' using errcode = '22023';
  end if;
  select s.* into target_row from public.corpus_series s where s.id = p_target;
  select s.* into source_row from public.corpus_series s where s.id = p_source;
  if target_row.id is null or source_row.id is null
     or target_row.archived_at is not null or source_row.archived_at is not null then
    raise exception 'both corpus series must be active' using errcode = 'P0002';
  end if;

  perform 1
  from public.books b
  join public.corpus_series_entries e on e.work_id = b.corpus_work_id
  where e.series_id in (p_target, p_source) and e.removed_at is null and e.is_primary
    and b.removed_at is null
  order by b.id
  for update of b;
  perform 1
  from public.works w
  join public.corpus_series_entries e on e.work_id = w.id
  where e.series_id in (p_target, p_source) and e.removed_at is null and e.is_primary
  order by w.id
  for update of w;

  perform pg_advisory_xact_lock(hashtextextended(identity_key, 0))
  from (
    select distinct identity_key
    from unnest(array[
      'name:' || target_row.name_key || ':' || target_row.creator_key,
      'name:' || source_row.name_key || ':' || source_row.creator_key
    ]) as keys(identity_key)
    order by identity_key
  ) ordered_keys;

  perform 1 from public.corpus_series s
   where s.id in (p_target, p_source) order by s.id for update;
  select s.* into target_row from public.corpus_series s where s.id = p_target;
  select s.* into source_row from public.corpus_series s where s.id = p_source;
  if target_row.revision <> p_expected_target_revision
     or source_row.revision <> p_expected_source_revision then
    raise exception 'corpus series changed; refresh before merging' using errcode = 'PT409';
  end if;

  -- Fold duplicate memberships into the target row before re-parenting. A conflicting position is
  -- preserved as evidence and makes the surviving series reviewable; neither value is invented.
  update public.corpus_series_entries target_entry
     set position = coalesce(target_entry.position, source_entry.position),
         is_primary = target_entry.is_primary or source_entry.is_primary,
         membership_claim = case
           when target_entry.membership_claim ->> 'origin' = 'unknown'
             then source_entry.membership_claim else target_entry.membership_claim end,
         position_claim = case
           when target_entry.position is null then source_entry.position_claim
           else target_entry.position_claim end,
         evidence = target_entry.evidence || source_entry.evidence
    from public.corpus_series_entries source_entry
   where target_entry.series_id = p_target
     and source_entry.series_id = p_source
     and target_entry.work_id = source_entry.work_id
     and target_entry.work_id is not null
     and target_entry.removed_at is null
     and source_entry.removed_at is null;
  get diagnostics folded_entries = row_count;

  update public.corpus_series_entries source_entry
     set removed_at = now(), is_primary = false, archive_primary_intent = false
   where source_entry.series_id = p_source
     and source_entry.removed_at is null
     and source_entry.work_id is not null
     and exists (
       select 1 from public.corpus_series_entries target_entry
       where target_entry.series_id = p_target
         and target_entry.work_id = source_entry.work_id
         and target_entry.removed_at is null
     );

  update public.corpus_series_entries
     set series_id = p_target
   where series_id = p_source;
  get diagnostics moved_entries = row_count;

  -- Provider ids and names are global identity claims. Delete only an exact duplicate already on
  -- the target; any true collision with a third record remains a constraint failure.
  delete from public.corpus_series_sources source_identity
   where source_identity.series_id = p_source
     and exists (
       select 1 from public.corpus_series_sources target_identity
       where target_identity.series_id = p_target
         and target_identity.source = source_identity.source
         and target_identity.source_ref = source_identity.source_ref
     );
  update public.corpus_series_sources set series_id = p_target where series_id = p_source;

  delete from public.corpus_series_names source_name
   where source_name.series_id = p_source
     and exists (
       select 1 from public.corpus_series_names target_name
       where target_name.series_id = p_target
         and target_name.name_key = source_name.name_key
         and target_name.creator_key = source_name.creator_key
     );
  update public.corpus_series_names
     set series_id = p_target, kind = 'alias'
   where series_id = p_source;

  insert into public.corpus_series_names (
    series_id, name, name_key, creator_key, kind, source, source_ref
  ) values (
    p_target, source_row.name, source_row.name_key, source_row.creator_key,
    'alias', 'manual', caller::text
  ) on conflict (series_id, name_key, creator_key) do nothing;

  update public.corpus_series
     set status = coalesce(status, source_row.status),
         declared_count = coalesce(declared_count, source_row.declared_count),
         catalog_state = case
           when declared_count is not null and source_row.declared_count is not null
             and declared_count <> source_row.declared_count then 'review'
           else catalog_state
         end,
         evidence = evidence || source_row.evidence,
         reviewed_by = caller,
         revision = revision + 1
   where id = p_target;
  select s.* into target_row from public.corpus_series s where s.id = p_target;
  update public.corpus_series
     set archived_at = now(), merged_into = p_target, reviewed_by = caller,
         revision = revision + 1
   where id = p_source;

  perform set_config('reverie.series_manual_editor', 'on', true);
  perform set_config('reverie.corpus_series_target', p_target::text, true);
  update public.works w
     set series = target_row.name,
         series_count = coalesce(target_row.declared_count, w.series_count),
         status = coalesce(target_row.status, w.status)
    from public.corpus_series_entries e
   where e.series_id = p_target and e.work_id = w.id
     and e.removed_at is null and e.is_primary;
  perform set_config('reverie.corpus_series_target', '', true);
  perform set_config('reverie.series_manual_editor', '', true);

  insert into public.corpus_series_edits (
    series_id, editor_id, action, previous_value, next_value
  ) values (
    p_target, caller, 'merge', to_jsonb(source_row), jsonb_build_object(
      'target', p_target, 'source', p_source, 'entries_moved', moved_entries,
      'duplicates_folded', folded_entries
    )
  );
  return jsonb_build_object(
    'target', p_target, 'source', p_source, 'entries_moved', moved_entries,
    'duplicates_folded', folded_entries
  );
exception when others then
  perform set_config('reverie.corpus_series_target', '', true);
  perform set_config('reverie.series_manual_editor', '', true);
  raise;
end;
$fn$;

revoke all on function public.merge_corpus_series(uuid, uuid, bigint, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.merge_corpus_series(uuid, uuid, bigint, bigint)
  to authenticated;

create function public.archive_corpus_series(p_series uuid, p_expected_revision bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  caller uuid := (select auth.uid());
  current_row public.corpus_series%rowtype;
  cleared integer := 0;
begin
  if caller is null or not public.is_corpus_admin() then
    raise exception 'corpus administrator required' using errcode = '42501';
  end if;
  select s.* into current_row from public.corpus_series s where s.id = p_series;
  if not found then raise exception 'corpus series not found' using errcode = 'P0002'; end if;
  if current_row.archived_at is not null then
    return jsonb_build_object('series_id', p_series, 'already_archived', true, 'works_cleared', 0);
  end if;

  perform 1 from public.books b
  join public.corpus_series_entries e on e.work_id = b.corpus_work_id
  where e.series_id = p_series and e.removed_at is null and e.is_primary
    and b.removed_at is null order by b.id for update of b;
  perform 1 from public.works w
  join public.corpus_series_entries e on e.work_id = w.id
  where e.series_id = p_series and e.removed_at is null and e.is_primary
  order by w.id for update of w;
  select s.* into current_row from public.corpus_series s where s.id = p_series for update;
  if current_row.revision <> p_expected_revision then
    raise exception 'corpus series changed; refresh before archiving' using errcode = 'PT409';
  end if;

  update public.corpus_series_entries
     set archive_primary_intent = is_primary, is_primary = false
   where series_id = p_series and removed_at is null;
  select count(*)::integer into cleared
  from public.corpus_series_entries e
  where e.series_id = p_series and e.removed_at is null and e.archive_primary_intent;

  perform set_config('reverie.series_manual_editor', 'on', true);
  perform set_config('reverie.corpus_series_target', p_series::text, true);
  update public.works w
     set series = null, position = null, series_count = null,
         status = case when status in ('ongoing', 'completed', 'on_hiatus', 'cancelled')
           then 'standalone' else status end
    from public.corpus_series_entries e
   where e.series_id = p_series and e.work_id = w.id and e.archive_primary_intent;
  perform set_config('reverie.corpus_series_target', '', true);
  perform set_config('reverie.series_manual_editor', '', true);

  update public.corpus_series
     set archived_at = now(), reviewed_by = caller, revision = revision + 1
   where id = p_series;
  insert into public.corpus_series_edits (
    series_id, editor_id, action, previous_value, next_value
  ) values (
    p_series, caller, 'archive', to_jsonb(current_row),
    jsonb_build_object('works_cleared', cleared)
  );
  return jsonb_build_object(
    'series_id', p_series, 'already_archived', false, 'works_cleared', cleared
  );
exception when others then
  perform set_config('reverie.corpus_series_target', '', true);
  perform set_config('reverie.series_manual_editor', '', true);
  raise;
end;
$fn$;

revoke all on function public.archive_corpus_series(uuid, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.archive_corpus_series(uuid, bigint) to authenticated;

create function public.restore_corpus_series(p_series uuid, p_expected_revision bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  caller uuid := (select auth.uid());
  current_row public.corpus_series%rowtype;
  entry_row record;
  restored integer := 0;
  skipped integer := 0;
begin
  if caller is null or not public.is_corpus_admin() then
    raise exception 'corpus administrator required' using errcode = '42501';
  end if;
  select s.* into current_row from public.corpus_series s where s.id = p_series;
  if not found then raise exception 'corpus series not found' using errcode = 'P0002'; end if;
  if current_row.archived_at is null then
    return jsonb_build_object('series_id', p_series, 'already_active', true, 'restored', 0, 'skipped', 0);
  end if;
  if current_row.merged_into is not null then
    raise exception 'a merged series cannot be restored; edit the surviving record'
      using errcode = '55000';
  end if;

  perform 1 from public.books b
  join public.corpus_series_entries e on e.work_id = b.corpus_work_id
  where e.series_id = p_series and e.archive_primary_intent and b.removed_at is null
  order by b.id for update of b;
  perform 1 from public.works w
  join public.corpus_series_entries e on e.work_id = w.id
  where e.series_id = p_series and e.archive_primary_intent
  order by w.id for update of w;
  select s.* into current_row from public.corpus_series s where s.id = p_series for update;
  if current_row.revision <> p_expected_revision then
    raise exception 'corpus series changed; refresh before restoring' using errcode = 'PT409';
  end if;

  update public.corpus_series
     set archived_at = null, reviewed_by = caller, revision = revision + 1
   where id = p_series;

  for entry_row in
    select e.* from public.corpus_series_entries e
    where e.series_id = p_series and e.archive_primary_intent
      and e.removed_at is null and e.work_id is not null
    order by e.work_id, e.id
  loop
    if not exists (
      select 1 from public.corpus_series_entries other_entry
      join public.corpus_series other_series on other_series.id = other_entry.series_id
      where other_entry.work_id = entry_row.work_id
        and other_entry.removed_at is null and other_entry.is_primary
        and other_series.archived_at is null and other_entry.id <> entry_row.id
    ) and exists (
      select 1 from public.works w where w.id = entry_row.work_id
        and nullif(trim(coalesce(w.series, '')), '') is null
    ) then
      update public.corpus_series_entries set is_primary = true where id = entry_row.id;
      perform set_config('reverie.series_manual_editor', 'on', true);
      perform set_config('reverie.corpus_series_target', p_series::text, true);
      update public.works
         set series = current_row.name,
             position = entry_row.position,
             series_count = current_row.declared_count,
             status = coalesce(current_row.status, 'ongoing')
       where id = entry_row.work_id;
      restored := restored + 1;
    else
      skipped := skipped + 1;
    end if;
  end loop;
  perform set_config('reverie.corpus_series_target', '', true);
  perform set_config('reverie.series_manual_editor', '', true);
  update public.corpus_series_entries
     set archive_primary_intent = false
   where series_id = p_series and archive_primary_intent;

  insert into public.corpus_series_edits (
    series_id, editor_id, action, previous_value, next_value
  ) values (
    p_series, caller, 'restore', to_jsonb(current_row),
    jsonb_build_object('restored', restored, 'skipped', skipped)
  );
  return jsonb_build_object(
    'series_id', p_series, 'already_active', false,
    'restored', restored, 'skipped', skipped
  );
exception when others then
  perform set_config('reverie.corpus_series_target', '', true);
  perform set_config('reverie.series_manual_editor', '', true);
  raise;
end;
$fn$;

revoke all on function public.restore_corpus_series(uuid, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.restore_corpus_series(uuid, bigint) to authenticated;

-- Add or correct an explicit reading-order slot. Linked entries take their display identity from
-- `works`; unbound slots let an administrator record a known title before Reverie has that work.
-- Linking an unbound slot to a work remains an identity-review action on the work itself.
create function public.save_corpus_series_entry(
  p_series uuid,
  p_expected_revision bigint,
  p_entry uuid,
  p_title text,
  p_author text,
  p_position numeric,
  p_label text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  caller uuid := (select auth.uid());
  series_row public.corpus_series%rowtype;
  entry_row public.corpus_series_entries%rowtype;
  saved_row public.corpus_series_entries%rowtype;
  clean_title text := trim(coalesce(p_title, ''));
  clean_author text := trim(coalesce(p_author, ''));
  clean_label text := nullif(trim(coalesce(p_label, '')), '');
begin
  if caller is null or not public.is_corpus_admin() then
    raise exception 'corpus administrator required' using errcode = '42501';
  end if;
  if p_position is not null and p_position <= 0 then
    raise exception 'series position must be greater than zero' using errcode = '22023';
  end if;

  select s.* into series_row from public.corpus_series s where s.id = p_series;
  if not found or series_row.archived_at is not null then
    raise exception 'active corpus series not found' using errcode = 'P0002';
  end if;
  if p_entry is not null then
    select e.* into entry_row
    from public.corpus_series_entries e
    where e.id = p_entry and e.series_id = p_series and e.removed_at is null;
    if not found then
      raise exception 'active corpus series entry not found' using errcode = 'P0002';
    end if;
  elsif clean_title = '' then
    raise exception 'an unbound series slot needs a title' using errcode = '22023';
  end if;

  -- Keep the deployed writer order when a slot already points at a work.
  if entry_row.work_id is not null then
    perform 1 from public.books b
    where b.corpus_work_id = entry_row.work_id and b.removed_at is null
    order by b.id for update;
    perform 1 from public.works w where w.id = entry_row.work_id for update;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'name:' || series_row.name_key || ':' || series_row.creator_key, 0
  ));
  select s.* into series_row from public.corpus_series s where s.id = p_series for update;
  if series_row.revision <> p_expected_revision then
    raise exception 'corpus series changed; refresh before saving the slot'
      using errcode = 'PT409';
  end if;

  if p_entry is null then
    insert into public.corpus_series_entries (
      series_id, position, label, title, author_text, is_primary,
      membership_claim, position_claim, evidence, source, source_ref
    ) values (
      p_series, p_position, clean_label, clean_title, clean_author, false,
      jsonb_build_object('origin', 'manual', 'reviewedBy', caller, 'at', now()),
      case when p_position is null then '{"origin":"unknown"}'::jsonb
        else jsonb_build_object('origin', 'manual', 'reviewedBy', caller, 'at', now()) end,
      '[]'::jsonb, 'manual', caller::text
    ) returning * into saved_row;
    update public.corpus_series
       set reviewed_by = caller, catalog_state = 'confirmed', revision = revision + 1
     where id = p_series;
    insert into public.corpus_series_edits (
      series_id, editor_id, action, previous_value, next_value
    ) values (p_series, caller, 'entry_add', null, to_jsonb(saved_row));
  elsif entry_row.work_id is null then
    update public.corpus_series_entries
       set title = clean_title, author_text = clean_author, position = p_position,
           label = clean_label, source = 'manual', source_ref = caller::text,
           position_claim = case when p_position is null then '{"origin":"unknown"}'::jsonb
             else jsonb_build_object('origin', 'manual', 'reviewedBy', caller, 'at', now()) end
     where id = p_entry
     returning * into saved_row;
    update public.corpus_series
       set reviewed_by = caller, catalog_state = 'confirmed', revision = revision + 1
     where id = p_series;
    insert into public.corpus_series_edits (
      series_id, editor_id, action, previous_value, next_value
    ) values (p_series, caller, 'entry_update', to_jsonb(entry_row), to_jsonb(saved_row));
  else
    update public.corpus_series_entries set label = clean_label where id = p_entry;
    perform set_config('reverie.series_manual_editor', 'on', true);
    perform set_config('reverie.corpus_series_target', p_series::text, true);
    update public.works
       set position = p_position
     where id = entry_row.work_id;
    perform set_config('reverie.corpus_series_target', '', true);
    perform set_config('reverie.series_manual_editor', '', true);
    select e.* into saved_row from public.corpus_series_entries e where e.id = p_entry;
    insert into public.corpus_series_edits (
      series_id, editor_id, action, previous_value, next_value
    ) values (p_series, caller, 'entry_update', to_jsonb(entry_row), to_jsonb(saved_row));
  end if;
  return to_jsonb(saved_row);
exception when others then
  perform set_config('reverie.corpus_series_target', '', true);
  perform set_config('reverie.series_manual_editor', '', true);
  raise;
end;
$fn$;

revoke all on function public.save_corpus_series_entry(
  uuid, bigint, uuid, text, text, numeric, text
) from public, anon, authenticated, service_role;
grant execute on function public.save_corpus_series_entry(
  uuid, bigint, uuid, text, text, numeric, text
) to authenticated;

create function public.remove_corpus_series_entry(
  p_entry uuid,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  caller uuid := (select auth.uid());
  series_row public.corpus_series%rowtype;
  entry_row public.corpus_series_entries%rowtype;
begin
  if caller is null or not public.is_corpus_admin() then
    raise exception 'corpus administrator required' using errcode = '42501';
  end if;
  select e.* into entry_row
  from public.corpus_series_entries e
  where e.id = p_entry and e.removed_at is null;
  if not found then
    raise exception 'active corpus series entry not found' using errcode = 'P0002';
  end if;
  select s.* into series_row
  from public.corpus_series s
  where s.id = entry_row.series_id and s.archived_at is null;
  if not found then
    raise exception 'active corpus series not found' using errcode = 'P0002';
  end if;

  if entry_row.work_id is not null then
    perform 1 from public.books b
    where b.corpus_work_id = entry_row.work_id and b.removed_at is null
    order by b.id for update;
    perform 1 from public.works w where w.id = entry_row.work_id for update;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'name:' || series_row.name_key || ':' || series_row.creator_key, 0
  ));
  select s.* into series_row
  from public.corpus_series s where s.id = entry_row.series_id for update;
  if series_row.revision <> p_expected_revision then
    raise exception 'corpus series changed; refresh before removing the slot'
      using errcode = 'PT409';
  end if;

  if entry_row.work_id is not null and entry_row.is_primary then
    perform set_config('reverie.series_manual_editor', 'on', true);
    perform set_config('reverie.corpus_series_target', entry_row.series_id::text, true);
    update public.works
       set series = null, position = null, series_count = null,
           status = case when status in ('ongoing', 'completed', 'on_hiatus', 'cancelled')
             then 'standalone' else status end
     where id = entry_row.work_id;
    perform set_config('reverie.corpus_series_target', '', true);
    perform set_config('reverie.series_manual_editor', '', true);
  else
    update public.corpus_series_entries
       set removed_at = now(), is_primary = false, archive_primary_intent = false
     where id = p_entry;
    update public.corpus_series
       set reviewed_by = caller, revision = revision + 1
     where id = entry_row.series_id;
  end if;
  insert into public.corpus_series_edits (
    series_id, editor_id, action, previous_value, next_value
  ) values (
    entry_row.series_id, caller, 'entry_remove', to_jsonb(entry_row),
    jsonb_build_object('removed_at', now())
  );
  return jsonb_build_object('entry_id', p_entry, 'series_id', entry_row.series_id);
exception when others then
  perform set_config('reverie.corpus_series_target', '', true);
  perform set_config('reverie.series_manual_editor', '', true);
  raise;
end;
$fn$;

revoke all on function public.remove_corpus_series_entry(uuid, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.remove_corpus_series_entry(uuid, bigint) to authenticated;

create function public.list_archived_corpus_series()
returns table (
  id uuid,
  name text,
  creator_key text,
  status text,
  declared_count integer,
  revision bigint,
  archived_at timestamptz,
  merged_into uuid,
  entry_count bigint,
  linked_work_count bigint
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select s.id, s.name, s.creator_key, s.status, s.declared_count, s.revision,
         s.archived_at, s.merged_into,
         count(e.id) filter (where e.removed_at is null),
         count(e.work_id) filter (where e.removed_at is null and e.work_id is not null)
  from public.corpus_series s
  left join public.corpus_series_entries e on e.series_id = s.id
  where public.is_corpus_admin() and s.archived_at is not null
  group by s.id
  order by s.archived_at desc, s.id;
$fn$;

revoke all on function public.list_archived_corpus_series()
  from public, anon, authenticated, service_role;
grant execute on function public.list_archived_corpus_series() to authenticated;
