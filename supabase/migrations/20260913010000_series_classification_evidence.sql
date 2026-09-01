-- Robust automatic series classification.
--
-- Book identity and series membership are different claims. A title/author match may identify the
-- right work while a search index's first series label is still wrong. Automatic shared writes now
-- require relational evidence that contains the book; every result retains the evidence and reason.
-- Household views already project `works`, while eligible personal rows receive the trusted corpus
-- tuple as a DEFAULT. Reader/import choices remain private authority and are never overwritten.

alter table public.works
  add column series_check_evidence jsonb not null default '[]'::jsonb,
  add column series_check_reason text,
  add constraint works_series_check_evidence_array_check
    check (jsonb_typeof(series_check_evidence) = 'array');

alter table public.work_series_suggestions
  add column proposed_count integer check (proposed_count is null or proposed_count between 1 and 999),
  add column identity_confidence text not null default 'none'
    check (identity_confidence in ('high', 'medium', 'low', 'none')),
  add column evidence jsonb not null default '[]'::jsonb,
  add column reason text,
  add constraint work_series_suggestions_evidence_array_check
    check (jsonb_typeof(evidence) = 'array');

comment on column public.works.series_check_evidence is
  'Source observations behind the current series check. Search labels are candidates; only relational_membership evidence can auto-apply.';
comment on column public.work_series_suggestions.evidence is
  'Reviewable series evidence, retained with the decision instead of collapsing to one confidence word.';

-- Mark the ONE explicit shared-details editor. Other legacy functions also update works while
-- preserving objective personal metadata; those are not administrator series rulings and must not
-- turn an unverified personal label into corpus truth. Renaming keeps the established validation,
-- locking, and audit body intact while the public wrapper supplies a transaction-local intent bit.
alter function public.edit_corpus_work_metadata(
  uuid, text, numeric, int, text, text, text, text[], text[], text, jsonb, int, int, int
) rename to edit_corpus_work_metadata_with_manual_series_intent;

revoke all on function public.edit_corpus_work_metadata_with_manual_series_intent(
  uuid, text, numeric, int, text, text, text, text[], text[], text, jsonb, int, int, int
) from public, anon, authenticated, service_role;

create function public.edit_corpus_work_metadata(
  p_work uuid,
  p_series text,
  p_position numeric,
  p_series_count int,
  p_status text,
  p_genre text,
  p_subgenre text,
  p_genres text[],
  p_subgenres text[],
  p_cover_url text,
  p_cover_options jsonb,
  p_pub_y int,
  p_pub_m int,
  p_pub_d int
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  result uuid;
  caller uuid := (select auth.uid());
  caller_is_admin boolean := false;
  caller_is_owner boolean := false;
begin
  -- Match the editor body's established profile -> administrator -> personal-book -> work order.
  -- Household owners already prelock every linked book inside that body; administrators previously
  -- skipped that branch, so the wrapper closes the same book -> work inversion for them.
  perform 1 from public.profiles profile where profile.id = caller for key share;
  perform 1 from public.corpus_admins admin where admin.user_id = caller for update;
  caller_is_admin := found;
  if not caller_is_admin then
    select exists (
      select 1
      from public.household_members member
      join public.household_works household_work
        on household_work.household_id = member.household_id
       and household_work.work_id = p_work
       and household_work.removed_at is null
      where member.user_id = caller and member.role = 'owner'
    ) into caller_is_owner;
  end if;
  if caller_is_admin or caller_is_owner then
    update public.work_series_suggestions
       set status = 'superseded', reviewed_at = now(), updated_at = now()
     where work_id = p_work and status = 'pending';
    perform 1
    from public.books book
    where book.corpus_work_id = p_work and book.removed_at is null
    order by book.id
    for update;
  end if;
  perform set_config('reverie.series_manual_editor', 'on', true);
  result := public.edit_corpus_work_metadata_with_manual_series_intent(
    p_work, p_series, p_position, p_series_count, p_status, p_genre, p_subgenre,
    p_genres, p_subgenres, p_cover_url, p_cover_options, p_pub_y, p_pub_m, p_pub_d
  );
  perform set_config('reverie.series_manual_editor', '', true);
  return result;
exception when others then
  perform set_config('reverie.series_manual_editor', '', true);
  raise;
end;
$$;

revoke all on function public.edit_corpus_work_metadata(
  uuid, text, numeric, int, text, text, text, text[], text[], text, jsonb, int, int, int
) from public, anon, authenticated, service_role;
grant execute on function public.edit_corpus_work_metadata(
  uuid, text, numeric, int, text, text, text, text[], text[], text, jsonb, int, int, int
) to authenticated;

-- Any direct corpus editor is an explicit canonical override. Classifier/review writes opt out with
-- a transaction-local marker so their provider provenance survives. This also gives household-owner
-- shared edits the same durable evidence semantics as corpus-administrator edits.
create function public.mark_corpus_series_manual_override()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  editor uuid := (select auth.uid());
  observed_at timestamptz := now();
begin
  if row(new.series, new.position, new.series_count)
       is not distinct from row(old.series, old.position, old.series_count)
     or current_setting('reverie.series_classifier', true) = 'on'
  then
    return new;
  end if;

  -- A personal-removal/account-deletion preservation UPDATE still names these columns in its SET
  -- list. Without an explicit editor/classifier marker, keep the old corpus tuple and let its other
  -- objective fields proceed. This is also the deadlock boundary: the AFTER seed sees no series
  -- change and never takes personal-book locks underneath that book -> work preservation path.
  if coalesce(current_setting('reverie.series_manual_editor', true), '') <> 'on' then
    new.series := old.series;
    new.position := old.position;
    new.series_count := old.series_count;
    return new;
  end if;

  new.series_check_state := case
    when nullif(trim(coalesce(new.series, '')), '') is null then 'no_series'
    else 'found'
  end;
  new.series_checked_at := observed_at;
  new.series_check_source := 'manual';
  new.series_check_reason := 'An authorized corpus editor explicitly set the canonical series tuple.';
  new.series_check_evidence := jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
    'source', 'manual',
    'kind', case
      when nullif(trim(coalesce(new.series, '')), '') is null then 'manual_clear'
      else 'relational_membership'
    end,
    'sourceRef', new.id,
    'series', new.series,
    'position', new.position,
    'memberCount', new.series_count,
    'reviewedBy', editor,
    'at', observed_at
  )));
  new.metadata_provenance := coalesce(new.metadata_provenance, '{}'::jsonb)
    || jsonb_build_object('series', jsonb_strip_nulls(jsonb_build_object(
      'source', 'manual', 'sourceRef', new.id, 'confidence', 'high',
      'membershipConfidence', 'high', 'reviewedBy', editor, 'at', observed_at,
      'evidence', new.series_check_evidence
    )));
  return new;
end;
$$;

revoke all on function public.mark_corpus_series_manual_override()
  from public, anon, authenticated, service_role;

create trigger works_mark_series_manual_override
before update of series, position, series_count on public.works
for each row execute function public.mark_corpus_series_manual_override();

-- The corpus series tuple is a default, not an ownership claim. It may replace an unknown or prior
-- automatic value only when the reader has never chosen/imported a different one. The existing
-- trusted-series trigger materializes the structured series_entries membership in this transaction.
create function public.seed_personal_series_from_corpus()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_name text := coalesce(
    nullif(new.metadata_provenance -> 'series' ->> 'source', ''),
    nullif(new.series_check_source, ''),
    'corpus'
  );
  source_ref text := coalesce(
    nullif(new.metadata_provenance -> 'series' ->> 'sourceRef', ''),
    new.id::text
  );
  confidence text := coalesce(
    nullif(new.metadata_provenance -> 'series' ->> 'membershipConfidence', ''),
    nullif(new.metadata_provenance -> 'series' ->> 'confidence', ''),
    'high'
  );
  observed_at text := coalesce(new.series_checked_at::text, now()::text);
  claim jsonb;
begin
  if tg_op = 'UPDATE' and row(new.series, new.position, new.series_count)
       is not distinct from row(old.series, old.position, old.series_count)
  then
    return new;
  end if;

  claim := jsonb_strip_nulls(jsonb_build_object(
    'origin', 'corpus', 'source', source_name, 'sourceRef', source_ref,
    'confidence', confidence, 'at', observed_at
  ));

  -- Retire only older automatic/unknown memberships that conflict with the new canonical default.
  -- A reader/import secondary membership remains intact: the corpus owns one default, not every
  -- relationship a reader may deliberately model.
  update public.series_entries entry
     set removed_at = now(),
         book_id = null,
         is_primary = false,
         membership_claim = claim
    from public.books book, public.series series_row
   where book.corpus_work_id = new.id
     and book.removed_at is null
     and not coalesce(book.series_user_chosen, false)
     and coalesce(book.series_claim ->> 'origin', 'unknown') in (
       'unknown', 'enrichment', 'corpus'
     )
     and entry.book_id = book.id
     and entry.owner_id = book.owner_id
     and entry.series_id = series_row.id
     and entry.removed_at is null
     and coalesce(entry.membership_claim ->> 'origin', 'unknown') in (
       'unknown', 'enrichment', 'corpus'
     )
     and (
       nullif(trim(coalesce(new.series, '')), '') is null
       or lower(regexp_replace(trim(series_row.name), '[^[:alnum:]]+', '', 'g'))
         <> lower(regexp_replace(trim(new.series), '[^[:alnum:]]+', '', 'g'))
     );

  update public.books book
     set series = new.series,
         position = new.position,
         series_count = new.series_count,
         status = case
           when nullif(trim(coalesce(new.series, '')), '') is not null
             and book.status = 'standalone' then 'ongoing'
           when nullif(trim(coalesce(new.series, '')), '') is null
             and book.status = 'ongoing' then 'standalone'
           else book.status
         end,
         series_user_chosen = false,
         series_claim = claim
   where book.corpus_work_id = new.id
     and book.removed_at is null
     and not coalesce(book.series_user_chosen, false)
     and coalesce(book.series_claim ->> 'origin', 'unknown') in (
       'unknown', 'enrichment', 'corpus'
     );
  return new;
end;
$$;

revoke all on function public.seed_personal_series_from_corpus()
  from public, anon, authenticated, service_role;

create trigger works_seed_personal_series_defaults
after insert or update of series, position, series_count on public.works
for each row execute function public.seed_personal_series_from_corpus();

create or replace function public.record_corpus_series_discovery(
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
  proposed_count integer;
  source_name text := lower(coalesce(nullif(trim(p_result ->> 'source'), ''), 'catalog'));
  source_ref text := nullif(trim(p_result ->> 'sourceRef'), '');
  identity_confidence text := coalesce(
    nullif(trim(p_result ->> 'identityConfidence'), ''),
    nullif(trim(p_result ->> 'confidence'), ''),
    'none'
  );
  membership_confidence text := coalesce(
    nullif(trim(p_result ->> 'membershipConfidence'), ''),
    nullif(trim(p_result ->> 'confidence'), ''),
    'none'
  );
  evidence jsonb := coalesce(p_result -> 'evidence', '[]'::jsonb);
  reason text := nullif(trim(p_result ->> 'reason'), '');
  has_relational_evidence boolean := false;
  outcome text;
  suggestion_id uuid;
begin
  if caller is null then
    raise exception 'corpus administrator required' using errcode = '42501';
  end if;
  perform 1 from public.profiles profile where profile.id = caller for key share;
  perform 1 from public.corpus_admins admin where admin.user_id = caller for update;
  if not found then
    raise exception 'corpus administrator required' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_result, '{}'::jsonb)) <> 'object' then
    raise exception 'series discovery result must be an object' using errcode = '22023';
  end if;
  if identity_confidence not in ('high', 'medium', 'low', 'none')
     or membership_confidence not in ('high', 'medium', 'low', 'none') then
    raise exception 'invalid series discovery confidence' using errcode = '22023';
  end if;
  if jsonb_typeof(evidence) <> 'array' then
    raise exception 'series discovery evidence must be an array' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(evidence) item
    where nullif(trim(item ->> 'source'), '') is null
      or item ->> 'kind' not in (
        'relational_membership', 'candidate_label', 'provider_unavailable'
      )
  ) then
    raise exception 'series discovery evidence has an invalid source or kind'
      using errcode = '22023';
  end if;

  -- Evidence is an allowlisted record, never an upstream-document cache. Fantastic Fiction has an
  -- even narrower contract: membership, series name, order, source URL, and observation time only.
  -- In particular, do not retain or derive its series-size count or any arbitrary page content.
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'source', lower(trim(item ->> 'source')),
    'kind', item ->> 'kind',
    'sourceRef', nullif(trim(item ->> 'sourceRef'), ''),
    'series', nullif(trim(item ->> 'series'), ''),
    'position', case when jsonb_typeof(item -> 'position') = 'number'
      then item -> 'position' else null end,
    'memberCount', case
      when lower(trim(item ->> 'source')) <> 'fantasticfiction'
        and jsonb_typeof(item -> 'memberCount') = 'number'
      then item -> 'memberCount' else null end,
    'orderType', case when item ->> 'orderType' in (
      'publication', 'recommended', 'narrative', 'unspecified'
    ) then item ->> 'orderType' else 'unspecified' end
  ))), '[]'::jsonb)
  into evidence
  from jsonb_array_elements(evidence) item;

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
  if p_result ? 'count' and nullif(trim(p_result ->> 'count'), '') is not null then
    begin
      proposed_count := (p_result ->> 'count')::integer;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'invalid series count' using errcode = '22023';
    end;
    if proposed_count < 1 or proposed_count > 999 then
      raise exception 'series count must be between 1 and 999' using errcode = '22023';
    end if;
  end if;
  if source_name = 'fantasticfiction' then proposed_count := null; end if;

  if proposed_series is not null then
    select exists (
      select 1
      from jsonb_array_elements(evidence) item
      where item ->> 'kind' = 'relational_membership'
        and nullif(trim(item ->> 'source'), '') is not null
        and lower(regexp_replace(trim(item ->> 'series'), '[^[:alnum:]]+', '', 'g'))
          = lower(regexp_replace(proposed_series, '[^[:alnum:]]+', '', 'g'))
    ) into has_relational_evidence;
  end if;

  -- Review and manual edits lock a pending suggestion before books. Take that row first even when
  -- this result will supersede rather than upsert it, then follow the shared book -> work order.
  perform 1
  from public.work_series_suggestions suggestion
  where suggestion.work_id = p_work and suggestion.status = 'pending'
  for update;

  -- Personal writes take book before work. Prelocking all active copies in UUID order keeps this
  -- classifier on the same order before its work update fires the personal-default trigger.
  perform 1
  from public.books book
  where book.corpus_work_id = p_work and book.removed_at is null
  order by book.id
  for update;

  select w.* into work from public.works w where w.id = p_work for update;
  if not found then raise exception 'corpus work not found' using errcode = 'P0002'; end if;
  before_value := to_jsonb(work);

  perform set_config('reverie.series_classifier', 'on', true);

  if not matched or identity_confidence in ('low', 'none') then
    update public.works
       set series_check_state = 'unresolved', series_checked_at = p_checked_at,
           series_check_source = source_name, series_check_evidence = evidence,
           series_check_reason = reason
     where id = p_work;
    outcome := 'unresolved';

  elsif proposed_series is null then
    update public.work_series_suggestions
       set status = 'superseded', reviewed_at = p_checked_at, updated_at = p_checked_at
     where work_id = p_work and status = 'pending';
    update public.works
       set series_check_state = 'no_series', series_checked_at = p_checked_at,
           series_check_source = source_name, series_check_evidence = evidence,
           series_check_reason = reason
     where id = p_work;
    outcome := 'no_series';

  -- A provider's search label is not authority. Without the actual relationship this remains a
  -- retryable unresolved observation and does not flood the administrator queue.
  elsif membership_confidence in ('low', 'none') or not has_relational_evidence then
    update public.works
       set series_check_state = 'unresolved', series_checked_at = p_checked_at,
           series_check_source = source_name, series_check_evidence = evidence,
           series_check_reason = reason
     where id = p_work;
    outcome := 'unresolved';

  elsif membership_confidence = 'high' and (
    nullif(trim(work.series), '') is null
    or (
      lower(regexp_replace(trim(work.series), '[^[:alnum:]]+', '', 'g'))
        = lower(regexp_replace(proposed_series, '[^[:alnum:]]+', '', 'g'))
      and (work.position is null or proposed_position is null or work.position = proposed_position)
      and (work.series_count is null or proposed_count is null or work.series_count = proposed_count)
    )
  ) then
    update public.work_series_suggestions
       set status = 'superseded', reviewed_at = p_checked_at, updated_at = p_checked_at
     where work_id = p_work and status = 'pending';
    update public.works
       set series = coalesce(nullif(trim(series), ''), proposed_series),
           position = case when nullif(trim(work.series), '') is null
             then coalesce(proposed_position, position) else coalesce(position, proposed_position) end,
           series_count = coalesce(series_count, proposed_count),
           series_check_state = 'found', series_checked_at = p_checked_at,
           series_check_source = source_name, series_check_evidence = evidence,
           series_check_reason = reason,
           metadata_provenance = coalesce(metadata_provenance, '{}'::jsonb)
             || jsonb_build_object('series', jsonb_strip_nulls(jsonb_build_object(
               'source', source_name, 'sourceRef', source_ref,
               'identityConfidence', identity_confidence,
               'membershipConfidence', membership_confidence,
               'confidence', membership_confidence, 'at', p_checked_at,
               'evidence', evidence
             )))
     where id = p_work;
    outcome := case when nullif(trim(work.series), '') is null then 'applied' else 'confirmed' end;

  else
    insert into public.work_series_suggestions (
      work_id, proposed_series, proposed_position, proposed_count, source, source_ref,
      identity_confidence, confidence, evidence, reason, checked_at
    ) values (
      p_work, proposed_series, proposed_position, proposed_count, source_name, source_ref,
      identity_confidence, membership_confidence, evidence, reason, p_checked_at
    )
    on conflict (work_id) where status = 'pending'
    do update set proposed_series = excluded.proposed_series,
      proposed_position = excluded.proposed_position, proposed_count = excluded.proposed_count,
      source = excluded.source, source_ref = excluded.source_ref,
      identity_confidence = excluded.identity_confidence,
      confidence = excluded.confidence, evidence = excluded.evidence, reason = excluded.reason,
      checked_at = excluded.checked_at, updated_at = now()
    returning id into suggestion_id;
    update public.works
       set series_check_state = 'review', series_checked_at = p_checked_at,
           series_check_source = source_name, series_check_evidence = evidence,
           series_check_reason = reason
     where id = p_work;
    outcome := 'review';
  end if;

  perform set_config('reverie.series_classifier', '', true);
  select to_jsonb(w) into after_value from public.works w where w.id = p_work;
  if after_value is distinct from before_value then
    insert into public.work_metadata_edits (work_id, editor_id, previous_value, next_value)
    values (p_work, caller, before_value, after_value);
  end if;
  return jsonb_strip_nulls(jsonb_build_object('outcome', outcome, 'suggestion_id', suggestion_id));
end;
$$;

revoke all on function public.record_corpus_series_discovery(uuid, jsonb, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.record_corpus_series_discovery(uuid, jsonb, timestamptz)
  to authenticated;

create or replace function public.review_corpus_series_suggestion(
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
  if caller is null then
    raise exception 'corpus administrator required' using errcode = '42501';
  end if;
  perform 1 from public.profiles profile where profile.id = caller for key share;
  perform 1 from public.corpus_admins admin where admin.user_id = caller for update;
  if not found then
    raise exception 'corpus administrator required' using errcode = '42501';
  end if;
  if p_decision not in ('accept', 'dismiss') then
    raise exception 'invalid series suggestion decision' using errcode = '22023';
  end if;
  select s.* into suggestion from public.work_series_suggestions s
  where s.id = p_suggestion for update;
  if not found then raise exception 'series suggestion not found' using errcode = 'P0002'; end if;
  if suggestion.status <> 'pending' then
    raise exception 'series suggestion already reviewed' using errcode = 'P0001';
  end if;

  perform 1
  from public.books book
  where book.corpus_work_id = suggestion.work_id and book.removed_at is null
  order by book.id
  for update;

  select to_jsonb(w) into before_value from public.works w
  where w.id = suggestion.work_id for update;
  perform set_config('reverie.series_classifier', 'on', true);
  if p_decision = 'accept' then
    update public.works
       set series = suggestion.proposed_series,
           position = suggestion.proposed_position,
           series_count = suggestion.proposed_count,
           series_check_state = 'found', series_checked_at = suggestion.checked_at,
           series_check_source = suggestion.source,
           series_check_evidence = suggestion.evidence,
           series_check_reason = suggestion.reason,
           metadata_provenance = coalesce(metadata_provenance, '{}'::jsonb)
             || jsonb_build_object('series', jsonb_strip_nulls(jsonb_build_object(
               'source', suggestion.source, 'sourceRef', suggestion.source_ref,
               'identityConfidence', suggestion.identity_confidence,
               'confidence', suggestion.confidence,
               'membershipConfidence', suggestion.confidence,
               'at', suggestion.checked_at, 'reviewedBy', caller,
               'evidence', suggestion.evidence
             )))
     where id = suggestion.work_id;
  else
    update public.works
       set series_check_state = case when series is null then 'unresolved' else 'found' end
     where id = suggestion.work_id;
  end if;
  perform set_config('reverie.series_classifier', '', true);

  update public.work_series_suggestions
     set status = case p_decision when 'accept' then 'accepted' else 'dismissed' end,
         reviewed_by = caller, reviewed_at = now(), updated_at = now()
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
