-- Corpus series discovery: one shared, resumable check per work instead of asking every reader to
-- repair the same missing series metadata. “Checked and no series returned” is deliberately NOT a
-- standalone claim; it is a recheckable source observation with its own state and clock.

alter table public.works
  add column series_check_state text not null default 'unknown'
    check (series_check_state in ('unknown', 'unresolved', 'no_series', 'found', 'review')),
  add column series_checked_at timestamptz,
  add column series_check_source text;

comment on column public.works.series_check_state is
  'Series-source observation, separate from publication status. no_series means a matched catalog record returned no series; it never asserts standalone.';
comment on column public.works.series_checked_at is
  'Independent recheck clock for series discovery. Generic enriched_at must not suppress this pass.';

create table public.work_series_suggestions (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.works (id) on delete cascade,
  proposed_series text not null check (trim(proposed_series) <> ''),
  proposed_position numeric check (proposed_position is null or proposed_position > 0),
  source text not null check (trim(source) <> ''),
  source_ref text,
  confidence text not null check (confidence in ('high', 'medium')),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'dismissed', 'superseded')),
  checked_at timestamptz not null,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_series_suggestions_review_shape_check check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (status <> 'pending' and reviewed_at is not null)
  )
);

create unique index work_series_suggestions_one_pending_idx
  on public.work_series_suggestions (work_id) where status = 'pending';
create index work_series_suggestions_review_idx
  on public.work_series_suggestions (status, checked_at, id);

alter table public.work_series_suggestions enable row level security;
create policy "work_series_suggestions: corpus administrators read"
  on public.work_series_suggestions for select to authenticated
  using (public.is_corpus_admin());

-- Production retained legacy auto-exposure for new public tables. Reset every API role before
-- granting the single intended operation; RLS is not a substitute for table privilege.
revoke all on table public.work_series_suggestions
  from public, anon, authenticated, service_role;
grant select on table public.work_series_suggestions to authenticated;
grant all on table public.work_series_suggestions to service_role;

-- The general corpus-completion RPC predates reviewable series discovery. Keep its public name
-- and every non-series behavior, but make the old implementation private and strip series fields
-- in the compatibility wrapper. This prevents an older client from bypassing the confidence and
-- administrator-review boundary introduced below.
alter function public.complete_corpus_work_metadata(uuid, jsonb, timestamptz)
  rename to complete_corpus_work_metadata_without_series_review;

revoke all on function public.complete_corpus_work_metadata_without_series_review(
  uuid, jsonb, timestamptz
) from public, anon, authenticated, service_role;

create function public.complete_corpus_work_metadata(
  p_work uuid,
  p_patch jsonb,
  p_checked_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  sanitized_patch jsonb := p_patch;
begin
  if jsonb_typeof(coalesce(p_patch, '{}'::jsonb)) = 'object' then
    sanitized_patch := p_patch - 'series' - 'position';
    if jsonb_typeof(sanitized_patch -> 'provenance') = 'object' then
      sanitized_patch := jsonb_set(
        sanitized_patch,
        '{provenance}',
        (sanitized_patch -> 'provenance') - 'series' - 'seriesPosition'
      );
    end if;
  end if;
  return public.complete_corpus_work_metadata_without_series_review(
    p_work, sanitized_patch, p_checked_at
  );
end;
$$;

revoke all on function public.complete_corpus_work_metadata(uuid, jsonb, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.complete_corpus_work_metadata(uuid, jsonb, timestamptz)
  to authenticated;

create function public.record_corpus_series_discovery(
  p_work uuid,
  p_result jsonb,
  p_checked_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  work public.works%rowtype;
  before_value jsonb;
  after_value jsonb;
  matched boolean := coalesce((p_result ->> 'matched')::boolean, false);
  proposed_series text := nullif(trim(p_result ->> 'series'), '');
  proposed_position numeric;
  source_name text := coalesce(nullif(trim(p_result ->> 'source'), ''), 'catalog');
  source_ref text := nullif(trim(p_result ->> 'sourceRef'), '');
  confidence text := coalesce(nullif(trim(p_result ->> 'confidence'), ''), 'none');
  outcome text;
  suggestion_id uuid;
begin
  if caller is null or not public.is_corpus_admin() then
    raise exception 'corpus administrator required' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_result, '{}'::jsonb)) <> 'object' then
    raise exception 'series discovery result must be an object' using errcode = '22023';
  end if;
  if confidence not in ('high', 'medium', 'low', 'none') then
    raise exception 'invalid series discovery confidence' using errcode = '22023';
  end if;
  if p_result ? 'position' and nullif(trim(p_result ->> 'position'), '') is not null then
    begin
      proposed_position := (p_result ->> 'position')::numeric;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'invalid series position' using errcode = '22023';
    end;
    if proposed_position <= 0 then
      raise exception 'series position must be greater than zero' using errcode = '22023';
    end if;
  end if;

  select w.* into work from public.works w where w.id = p_work for update;
  if not found then raise exception 'corpus work not found' using errcode = 'P0002'; end if;
  before_value := to_jsonb(work);

  -- An unmatched/low-confidence lookup is not negative series evidence. It gets a short retry
  -- clock and never creates review noise.
  if not matched or confidence in ('low', 'none') then
    update public.works
       set series_check_state = 'unresolved',
           series_checked_at = p_checked_at,
           series_check_source = source_name
     where id = p_work;
    outcome := 'unresolved';

  -- A matched record with no series is still not a standalone assertion. It merely stops the
  -- normal sweep until the longer no-series recheck window expires.
  elsif proposed_series is null then
    update public.work_series_suggestions
       set status = 'superseded', reviewed_at = p_checked_at, updated_at = p_checked_at
     where work_id = p_work and status = 'pending';
    update public.works
       set series_check_state = 'no_series',
           series_checked_at = p_checked_at,
           series_check_source = source_name
     where id = p_work;
    outcome := 'no_series';

  -- High-confidence positive evidence may fill a blank or confirm the same normalized name. It
  -- never replaces a conflicting curated series without an administrator accepting the proposal.
  elsif confidence = 'high' and (
    nullif(trim(work.series), '') is null
    or (
      lower(regexp_replace(trim(work.series), '[^[:alnum:]]+', '', 'g'))
        = lower(regexp_replace(proposed_series, '[^[:alnum:]]+', '', 'g'))
      and (
        work.position is null
        or proposed_position is null
        or work.position = proposed_position
      )
    )
  ) then
    update public.work_series_suggestions
       set status = 'superseded', reviewed_at = p_checked_at, updated_at = p_checked_at
     where work_id = p_work and status = 'pending';
    update public.works
       set series = coalesce(nullif(trim(series), ''), proposed_series),
           position = case
             -- A position without a series identity is not valid membership evidence. Prefer the
             -- matched catalog position when discovery supplies one; otherwise retain the orphan
             -- as a hint rather than discarding potentially useful imported information.
             when nullif(trim(work.series), '') is null
               then coalesce(proposed_position, position)
             else coalesce(position, proposed_position)
           end,
           series_check_state = 'found',
           series_checked_at = p_checked_at,
           series_check_source = source_name,
           metadata_provenance = case
             when metadata_provenance ? 'series' then metadata_provenance
             else metadata_provenance || jsonb_strip_nulls(jsonb_build_object(
               'series', jsonb_build_object(
                 'source', source_name, 'sourceRef', source_ref,
                 'confidence', confidence, 'at', p_checked_at
               )
             ))
           end
     where id = p_work;
    outcome := case when nullif(trim(work.series), '') is null then 'applied' else 'confirmed' end;

  -- Medium confidence, or a high-confidence conflict, waits for explicit corpus-admin review.
  else
    insert into public.work_series_suggestions (
      work_id, proposed_series, proposed_position, source, source_ref, confidence, checked_at
    ) values (
      p_work, proposed_series, proposed_position, source_name, source_ref, confidence, p_checked_at
    )
    on conflict (work_id) where status = 'pending'
    do update set
      proposed_series = excluded.proposed_series,
      proposed_position = excluded.proposed_position,
      source = excluded.source,
      source_ref = excluded.source_ref,
      confidence = excluded.confidence,
      checked_at = excluded.checked_at,
      updated_at = now()
    returning id into suggestion_id;
    update public.works
       set series_check_state = 'review',
           series_checked_at = p_checked_at,
           series_check_source = source_name
     where id = p_work;
    outcome := 'review';
  end if;

  select to_jsonb(w) into after_value from public.works w where w.id = p_work;
  if after_value is distinct from before_value then
    insert into public.work_metadata_edits (work_id, editor_id, previous_value, next_value)
    values (p_work, caller, before_value, after_value);
  end if;
  return jsonb_strip_nulls(jsonb_build_object(
    'outcome', outcome, 'suggestion_id', suggestion_id
  ));
end;
$$;

revoke all on function public.record_corpus_series_discovery(uuid, jsonb, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.record_corpus_series_discovery(uuid, jsonb, timestamptz)
  to authenticated;

create function public.review_corpus_series_suggestion(
  p_suggestion uuid,
  p_decision text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  suggestion public.work_series_suggestions%rowtype;
  before_value jsonb;
  after_value jsonb;
begin
  if caller is null or not public.is_corpus_admin() then
    raise exception 'corpus administrator required' using errcode = '42501';
  end if;
  if p_decision not in ('accept', 'dismiss') then
    raise exception 'invalid series suggestion decision' using errcode = '22023';
  end if;
  select s.* into suggestion
  from public.work_series_suggestions s
  where s.id = p_suggestion for update;
  if not found then raise exception 'series suggestion not found' using errcode = 'P0002'; end if;
  if suggestion.status <> 'pending' then
    raise exception 'series suggestion already reviewed' using errcode = 'P0001';
  end if;

  select to_jsonb(w) into before_value from public.works w
  where w.id = suggestion.work_id for update;
  if p_decision = 'accept' then
    update public.works
       set series = suggestion.proposed_series,
           position = suggestion.proposed_position,
           series_check_state = 'found',
           series_checked_at = suggestion.checked_at,
           series_check_source = suggestion.source,
           metadata_provenance = metadata_provenance || jsonb_strip_nulls(jsonb_build_object(
             'series', jsonb_build_object(
               'source', suggestion.source, 'sourceRef', suggestion.source_ref,
               'confidence', suggestion.confidence, 'at', suggestion.checked_at,
               'reviewedBy', caller
             )
           ))
     where id = suggestion.work_id;
  else
    update public.works
       set series_check_state = case when series is null then 'unresolved' else 'found' end
     where id = suggestion.work_id;
  end if;

  update public.work_series_suggestions
     set status = case p_decision when 'accept' then 'accepted' else 'dismissed' end,
         reviewed_by = caller,
         reviewed_at = now(),
         updated_at = now()
   where id = p_suggestion;

  select to_jsonb(w) into after_value from public.works w where w.id = suggestion.work_id;
  if after_value is distinct from before_value then
    insert into public.work_metadata_edits (work_id, editor_id, previous_value, next_value)
    values (suggestion.work_id, caller, before_value, after_value);
  end if;
  return p_suggestion;
end;
$$;

revoke all on function public.review_corpus_series_suggestion(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.review_corpus_series_suggestion(uuid, text)
  to authenticated;
