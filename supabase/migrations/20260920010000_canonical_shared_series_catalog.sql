-- Canonical shared-series catalog.
--
-- `works.series/position/series_count/status` remains the deployed compatibility projection used by
-- household reads and eligible personal defaults. These tables add the missing shared graph:
-- stable series identity, aliases, provider ids, multiple memberships, and unbound known slots.
-- Personal `series` / `series_entries` remain reader-owned and are never used as corpus evidence.

create function public.corpus_series_identity_key(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $fn$
  select lower(regexp_replace(trim(coalesce(p_value, '')), '[^[:alnum:]]+', '', 'g'));
$fn$;

revoke all on function public.corpus_series_identity_key(text)
  from public, anon, authenticated, service_role;
grant execute on function public.corpus_series_identity_key(text) to service_role;

create table public.corpus_series (
  id uuid primary key default gen_random_uuid(),
  name text not null check (trim(name) <> ''),
  name_key text not null check (name_key <> ''),
  -- Same-name series by different creators stay distinct. Stable provider ids can later connect a
  -- multi-author series without pretending that name alone is a global identifier.
  creator_key text not null default '',
  status text check (status in (
    'ongoing', 'completed', 'on_hiatus', 'cancelled',
    'interconnected_standalone', 'interconnected_series'
  )),
  declared_count integer check (declared_count is null or declared_count between 1 and 999),
  catalog_state text not null default 'confirmed'
    check (catalog_state in ('confirmed', 'review')),
  evidence jsonb not null default '[]'::jsonb
    check (jsonb_typeof(evidence) = 'array'),
  revision bigint not null default 1 check (revision > 0),
  created_by uuid references public.profiles (id) on delete set null,
  reviewed_by uuid references public.profiles (id) on delete set null,
  archived_at timestamptz,
  merged_into uuid references public.corpus_series (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint corpus_series_merge_shape_check check (
    (merged_into is null) or (archived_at is not null and merged_into <> id)
  )
);

create index corpus_series_active_name_idx
  on public.corpus_series (name_key, creator_key, id)
  where archived_at is null;
create index corpus_series_archived_idx
  on public.corpus_series (archived_at, id)
  where archived_at is not null;

create trigger corpus_series_set_updated_at
before update on public.corpus_series
for each row execute function public.set_updated_at();

create table public.corpus_series_names (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.corpus_series (id) on delete cascade,
  name text not null check (trim(name) <> ''),
  name_key text not null check (name_key <> ''),
  creator_key text not null default '',
  kind text not null check (kind in ('canonical', 'alias')),
  source text not null default 'manual' check (trim(source) <> ''),
  source_ref text,
  created_at timestamptz not null default now(),
  unique (series_id, name_key, creator_key)
);

create unique index corpus_series_names_one_canonical_idx
  on public.corpus_series_names (series_id)
  where kind = 'canonical';
create index corpus_series_names_series_idx
  on public.corpus_series_names (series_id, kind, name_key);
create index corpus_series_names_lookup_idx
  on public.corpus_series_names (name_key, creator_key, series_id);

create table public.corpus_series_sources (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.corpus_series (id) on delete cascade,
  source text not null check (trim(source) <> ''),
  source_ref text not null check (trim(source_ref) <> ''),
  evidence jsonb not null default '[]'::jsonb
    check (jsonb_typeof(evidence) = 'array'),
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (source, source_ref)
);

create index corpus_series_sources_series_idx
  on public.corpus_series_sources (series_id, source, source_ref);

create table public.corpus_series_entries (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.corpus_series (id) on delete cascade,
  work_id uuid references public.works (id) on delete set null,
  position numeric check (position is null or position > 0),
  label text,
  -- Unbound slots are shared bibliographic hints, not personal books. A linked entry renders its
  -- identity from `works`; an unbound entry must retain a title and may later be linked explicitly.
  title text not null default '',
  author_text text not null default '',
  is_primary boolean not null default false,
  archive_primary_intent boolean not null default false,
  membership_claim jsonb not null default '{"origin":"unknown"}'::jsonb
    check (jsonb_typeof(membership_claim) = 'object'),
  position_claim jsonb not null default '{"origin":"unknown"}'::jsonb
    check (jsonb_typeof(position_claim) = 'object'),
  evidence jsonb not null default '[]'::jsonb
    check (jsonb_typeof(evidence) = 'array'),
  source text not null default 'manual' check (trim(source) <> ''),
  source_ref text,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint corpus_series_entries_identity_check check (
    work_id is not null or trim(title) <> ''
  ),
  constraint corpus_series_entries_primary_check check (
    not is_primary or (work_id is not null and removed_at is null)
  )
);

create trigger corpus_series_entries_set_updated_at
before update on public.corpus_series_entries
for each row execute function public.set_updated_at();

create unique index corpus_series_entries_live_work_idx
  on public.corpus_series_entries (series_id, work_id)
  where work_id is not null and removed_at is null;
create unique index corpus_series_entries_primary_work_idx
  on public.corpus_series_entries (work_id)
  where work_id is not null and removed_at is null and is_primary;
create index corpus_series_entries_order_idx
  on public.corpus_series_entries (series_id, position nulls last, id)
  where removed_at is null;

create table public.corpus_series_edits (
  id uuid primary key default gen_random_uuid(),
  series_id uuid references public.corpus_series (id) on delete set null,
  editor_id uuid references public.profiles (id) on delete set null,
  action text not null check (action in (
    'seed', 'sync', 'update', 'rename', 'merge', 'archive', 'restore',
    'entry_add', 'entry_update', 'entry_remove'
  )),
  previous_value jsonb,
  next_value jsonb,
  created_at timestamptz not null default now()
);

create index corpus_series_edits_series_idx
  on public.corpus_series_edits (series_id, created_at desc, id);

-- Shared objective metadata is readable to signed-in readers. Archived recovery and every write
-- remain RPC-only. Reset all API ACLs first because production retained legacy auto-exposure.
alter table public.corpus_series enable row level security;
alter table public.corpus_series_names enable row level security;
alter table public.corpus_series_sources enable row level security;
alter table public.corpus_series_entries enable row level security;
alter table public.corpus_series_edits enable row level security;

create policy "corpus_series: read active" on public.corpus_series
  for select to authenticated using (archived_at is null);
create policy "corpus_series_names: read active" on public.corpus_series_names
  for select to authenticated using (exists (
    select 1 from public.corpus_series s where s.id = series_id and s.archived_at is null
  ));
create policy "corpus_series_sources: read active" on public.corpus_series_sources
  for select to authenticated using (exists (
    select 1 from public.corpus_series s where s.id = series_id and s.archived_at is null
  ));
create policy "corpus_series_entries: read active" on public.corpus_series_entries
  for select to authenticated using (exists (
    select 1 from public.corpus_series s where s.id = series_id and s.archived_at is null
  ));
create policy "corpus_series_edits: administrators read" on public.corpus_series_edits
  for select to authenticated using (public.is_corpus_admin());

revoke all on table public.corpus_series, public.corpus_series_names,
  public.corpus_series_sources, public.corpus_series_entries, public.corpus_series_edits
  from public, anon, authenticated, service_role;
grant select on table public.corpus_series, public.corpus_series_names,
  public.corpus_series_sources, public.corpus_series_entries to authenticated;
grant select on table public.corpus_series_edits to authenticated;
grant all on table public.corpus_series, public.corpus_series_names,
  public.corpus_series_sources, public.corpus_series_entries, public.corpus_series_edits
  to service_role;

-- Synchronize one reviewed work into the shared graph. This function never reads personal series
-- rows and never creates a personal book. It runs after the existing works -> eligible-personal
-- default trigger, so both projections consume the same reviewed corpus tuple.
create function public.sync_corpus_series_catalog_work(p_work uuid, p_action text default 'sync')
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  work public.works%rowtype;
  target_series uuid;
  current_entry public.corpus_series_entries%rowtype;
  v_source_name text;
  v_source_ref text;
  v_series_name text;
  v_name_key text;
  v_creator_key text;
  source_lock text;
  name_lock text;
  claim jsonb;
  evidence_value jsonb;
  valid_status text;
  count_conflict boolean := false;
begin
  select w.* into work from public.works w where w.id = p_work for update;
  if not found then return null; end if;

  select e.* into current_entry
  from public.corpus_series_entries e
  join public.corpus_series s on s.id = e.series_id
  where e.work_id = p_work and e.removed_at is null and e.is_primary
  order by e.id
  limit 1;

  v_series_name := nullif(trim(coalesce(work.series, '')), '');
  -- `review` retains an already-curated tuple while a conflicting proposal waits. Unknown legacy
  -- text is deliberately excluded until the classifier or administrator reviews it.
  if v_series_name is null or work.series_check_state not in ('found', 'review') then
    if current_entry.id is not null then
      update public.corpus_series_entries
         set removed_at = now(), is_primary = false, archive_primary_intent = false
       where id = current_entry.id;
      update public.corpus_series
         set revision = revision + 1
       where id = current_entry.series_id;
    end if;
    return null;
  end if;

  v_name_key := public.corpus_series_identity_key(v_series_name);
  v_creator_key := public.corpus_series_identity_key(work.author_text);
  v_source_name := coalesce(
    nullif(work.metadata_provenance -> 'series' ->> 'source', ''),
    nullif(work.series_check_source, ''),
    'corpus'
  );
  v_source_ref := coalesce(
    nullif(work.metadata_provenance -> 'series' ->> 'sourceRef', ''),
    nullif(work.series_check_evidence -> 0 ->> 'sourceRef', '')
  );
  evidence_value := case
    when jsonb_typeof(work.series_check_evidence) = 'array' then work.series_check_evidence
    else '[]'::jsonb
  end;
  claim := jsonb_strip_nulls(jsonb_build_object(
    'origin', 'corpus', 'source', v_source_name, 'sourceRef', v_source_ref,
    'confidence', coalesce(
      nullif(work.metadata_provenance -> 'series' ->> 'membershipConfidence', ''),
      nullif(work.metadata_provenance -> 'series' ->> 'confidence', ''),
      'high'
    ),
    'at', coalesce(work.series_checked_at, now())
  ));
  valid_status := case when work.status in (
    'ongoing', 'completed', 'on_hiatus', 'cancelled',
    'interconnected_standalone', 'interconnected_series'
  ) then work.status end;

  -- All catalog identity writers use the same sorted advisory-key order after their affected work
  -- locks. A stable provider id wins; name+creator is the fallback, never name alone.
  source_lock := case
    when v_source_name not in ('manual', 'corpus') and v_source_ref is not null
      then 'source:' || v_source_name || ':' || v_source_ref
  end;
  name_lock := 'name:' || v_name_key || ':' || v_creator_key;
  perform pg_advisory_xact_lock(hashtextextended(lock_key, 0))
  from (
    select distinct lock_key
    from unnest(array_remove(array[source_lock, name_lock], null)) as keys(lock_key)
    order by lock_key
  ) ordered_keys;

  -- A catalog lifecycle RPC pins the intended target in transaction-local state. Ordinary corpus
  -- edits do not set it and therefore resolve by provider id, then normalized name+creator.
  begin
    target_series := nullif(current_setting('reverie.corpus_series_target', true), '')::uuid;
  exception when invalid_text_representation then
    target_series := null;
  end;

  if target_series is null and source_lock is not null then
    select s.series_id into target_series
    from public.corpus_series_sources s
    join public.corpus_series c on c.id = s.series_id and c.archived_at is null
    where s.source = v_source_name and s.source_ref = v_source_ref;
  end if;
  if target_series is null then
    select (array_agg(distinct n.series_id order by n.series_id))[1] into target_series
    from public.corpus_series_names n
    join public.corpus_series c on c.id = n.series_id and c.archived_at is null
    where n.name_key = v_name_key and n.creator_key = v_creator_key
    having count(distinct n.series_id) = 1;
  end if;

  if target_series is null then
    insert into public.corpus_series (
      name, name_key, creator_key, status, declared_count, evidence
    ) values (
      v_series_name, v_name_key, v_creator_key, valid_status, work.series_count, evidence_value
    ) returning id into target_series;
    insert into public.corpus_series_names (
      series_id, name, name_key, creator_key, kind, source, source_ref
    ) values (
      target_series, v_series_name, v_name_key, v_creator_key, 'canonical', v_source_name, v_source_ref
    );
    insert into public.corpus_series_edits (
      series_id, action, previous_value, next_value
    ) values (
      target_series, 'seed', null,
      jsonb_build_object('work_id', work.id, 'name', v_series_name, 'position', work.position)
    );
  end if;

  if source_lock is not null then
    insert into public.corpus_series_sources (
      series_id, source, source_ref, evidence, observed_at
    ) values (
      target_series, v_source_name, v_source_ref, evidence_value,
      coalesce(work.series_checked_at, now())
    )
    on conflict (source, source_ref) do update set
      evidence = excluded.evidence,
      observed_at = excluded.observed_at;
  end if;

  -- A spelling from the reviewed work becomes an alias only inside the creator scope. A name
  -- fallback is used only when it resolves to exactly one active series; provider ids distinguish
  -- homonyms without forcing an arbitrary merge.
  insert into public.corpus_series_names (
    series_id, name, name_key, creator_key, kind, source, source_ref
  ) values (
    target_series, v_series_name, v_name_key, v_creator_key,
    case when exists (
      select 1 from public.corpus_series_names n
      where n.series_id = target_series and n.kind = 'canonical'
    ) then 'alias' else 'canonical' end,
    v_source_name, v_source_ref
  )
  on conflict (series_id, name_key, creator_key) do nothing;

  if current_entry.id is not null and current_entry.series_id <> target_series then
    update public.corpus_series_entries
       set removed_at = now(), is_primary = false, archive_primary_intent = false
     where id = current_entry.id;
    update public.corpus_series set revision = revision + 1
     where id = current_entry.series_id;
  end if;

  -- Never let an old primary survive a reviewed move. Secondary memberships are preserved.
  update public.corpus_series_entries
     set is_primary = false
   where work_id = p_work and removed_at is null and is_primary and series_id <> target_series;

  insert into public.corpus_series_entries (
    series_id, work_id, position, title, author_text, is_primary,
    membership_claim, position_claim, evidence, source, source_ref
  ) values (
    target_series, p_work, work.position, work.title, work.author_text, true,
    claim,
    case when work.position is null then '{"origin":"unknown"}'::jsonb else claim end,
    evidence_value, v_source_name, v_source_ref
  )
  on conflict (series_id, work_id) where work_id is not null and removed_at is null
  do update set
    position = excluded.position,
    title = excluded.title,
    author_text = excluded.author_text,
    is_primary = true,
    membership_claim = excluded.membership_claim,
    position_claim = excluded.position_claim,
    evidence = excluded.evidence,
    source = excluded.source,
    source_ref = excluded.source_ref;

  select c.declared_count is not null and work.series_count is not null
         and c.declared_count <> work.series_count
    into count_conflict
  from public.corpus_series c where c.id = target_series;

  update public.corpus_series c
     set status = coalesce(c.status, valid_status),
         declared_count = coalesce(c.declared_count, work.series_count),
         catalog_state = case when count_conflict then 'review' else c.catalog_state end,
         evidence = case
           when evidence_value = '[]'::jsonb or c.evidence @> evidence_value then c.evidence
           else c.evidence || evidence_value
         end,
         revision = c.revision + 1
   where c.id = target_series;

  insert into public.corpus_series_edits (
    series_id, action, previous_value, next_value
  ) values (
    target_series,
    case when p_action in ('seed', 'sync') then p_action else 'sync' end,
    case when current_entry.id is null then null else to_jsonb(current_entry) end,
    jsonb_build_object('work_id', work.id, 'position', work.position, 'primary', true)
  );
  return target_series;
end;
$fn$;

revoke all on function public.sync_corpus_series_catalog_work(uuid, text)
  from public, anon, authenticated, service_role;

create function public.sync_corpus_series_catalog_work_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  perform public.sync_corpus_series_catalog_work(new.id, 'sync');
  return new;
end;
$fn$;

revoke all on function public.sync_corpus_series_catalog_work_trigger()
  from public, anon, authenticated, service_role;

create trigger works_sync_corpus_series_catalog
after insert or update of series, position, series_count, status, series_check_state,
  series_check_evidence, metadata_provenance on public.works
for each row execute function public.sync_corpus_series_catalog_work_trigger();

-- Durable initial population from already-reviewed corpus truth. This changes no personal or
-- household membership and never promotes unknown legacy text. It is part of establishing the
-- new schema, not an incident-specific repair.
do $backfill$
declare
  work_id uuid;
begin
  for work_id in
    select w.id
    from public.works w
    where nullif(trim(coalesce(w.series, '')), '') is not null
      and w.series_check_state in ('found', 'review')
    order by w.id
  loop
    perform public.sync_corpus_series_catalog_work(work_id, 'seed');
  end loop;
end;
$backfill$;
