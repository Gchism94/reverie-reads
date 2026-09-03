-- Durable administrator corpus sweeps. Vercel Workflow owns orchestration while Supabase remains
-- the authorization, run-state, corpus, audit, and storage system of record. A browser starts or
-- cancels a run as an authenticated corpus administrator; only the service role used by the
-- workflow may advance items. Existing fill-only metadata and evidence-gated series RPCs remain
-- the write authority and are invoked under the initiating administrator's recorded identity.

create table public.corpus_sweep_runs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references public.profiles(id) on delete restrict,
  requested_issuer text not null
    check (requested_issuer ~* '^https?://[^/?#]+/auth/v1/?$'),
  workflow_run_id text unique,
  launch_claimed_at timestamptz,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  phase text not null default 'queued'
    check (phase in ('queued', 'recovering', 'classifying', 'complete')),
  total_count integer not null default 0 check (total_count >= 0),
  scanned_count integer not null default 0 check (scanned_count >= 0),
  filled_count integer not null default 0 check (filled_count >= 0),
  nothing_count integer not null default 0 check (nothing_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  recovery_scanned_count integer not null default 0 check (recovery_scanned_count >= 0),
  recovery_failed_count integer not null default 0 check (recovery_failed_count >= 0),
  recovery_failed_batch_count integer not null default 0
    check (recovery_failed_batch_count >= 0),
  recovered_cover_count integer not null default 0 check (recovered_cover_count >= 0),
  recovered_option_count integer not null default 0 check (recovered_option_count >= 0),
  recovery_batch_count integer not null default 0 check (recovery_batch_count >= 0),
  recovery_last_result jsonb,
  recovery_maybe_more boolean not null default true,
  error_message text,
  cancel_requested_at timestamptz,
  started_at timestamptz,
  heartbeat_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scanned_count = filled_count + nothing_count),
  check (scanned_count + failed_count <= total_count),
  check (recovery_last_result is null or jsonb_typeof(recovery_last_result) = 'object')
);

-- Exactly one logical sweep may be active. The start RPC catches this index's race and returns the
-- winner, so repeated clicks and concurrent tabs are idempotent rather than duplicate launches.
create unique index corpus_sweep_runs_one_active_idx
  on public.corpus_sweep_runs ((true))
  where status in ('queued', 'running');

create index corpus_sweep_runs_created_idx
  on public.corpus_sweep_runs (created_at desc);

create table public.corpus_sweep_run_items (
  run_id uuid not null references public.corpus_sweep_runs(id) on delete cascade,
  work_id uuid not null references public.works(id) on delete restrict,
  ordinal integer not null check (ordinal > 0),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'deferred')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  outcome jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (run_id, work_id),
  unique (run_id, ordinal),
  check (outcome is null or jsonb_typeof(outcome) = 'object')
);

create index corpus_sweep_run_items_next_idx
  on public.corpus_sweep_run_items (run_id, status, ordinal);

alter table public.corpus_sweep_runs enable row level security;
alter table public.corpus_sweep_run_items enable row level security;

revoke all on table public.corpus_sweep_runs
  from public, anon, authenticated, service_role;
grant select on table public.corpus_sweep_runs to authenticated;
grant select, insert, update, delete on table public.corpus_sweep_runs to service_role;

revoke all on table public.corpus_sweep_run_items
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.corpus_sweep_run_items to service_role;

create policy corpus_sweep_runs_admin_read
on public.corpus_sweep_runs
for select to authenticated
using (public.is_corpus_admin());

create function public.start_corpus_sweep()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  claims jsonb;
  issuer text;
  run_id uuid;
begin
  if caller is null then
    raise exception 'corpus administrator required' using errcode = '42501';
  end if;
  perform 1 from public.profiles where id = caller for key share;
  perform 1 from public.corpus_admins where user_id = caller for update;
  if not found then
    raise exception 'corpus administrator required' using errcode = '42501';
  end if;

  begin
    claims := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
  exception when others then
    claims := '{}'::jsonb;
  end;
  issuer := claims ->> 'iss';
  if issuer is null or issuer !~* '^https?://[^/?#]+/auth/v1/?$' then
    raise exception 'verified authentication issuer required' using errcode = '42501';
  end if;

  begin
    insert into public.corpus_sweep_runs (requested_by, requested_issuer)
    values (caller, issuer)
    returning id into run_id;
  exception when unique_violation then
    select id into run_id
    from public.corpus_sweep_runs
    where status in ('queued', 'running')
    order by created_at desc
    limit 1;
  end;
  return run_id;
end;
$$;

revoke all on function public.start_corpus_sweep()
  from public, anon, authenticated, service_role;
grant execute on function public.start_corpus_sweep() to authenticated;

create function public.request_corpus_sweep_cancel(p_run uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null or not public.is_corpus_admin() then
    raise exception 'corpus administrator required' using errcode = '42501';
  end if;
  update public.corpus_sweep_runs
     set cancel_requested_at = coalesce(cancel_requested_at, now()),
         updated_at = now()
   where id = p_run and status in ('queued', 'running');
  if not found then
    raise exception 'active corpus sweep not found' using errcode = 'P0002';
  end if;
  return p_run;
end;
$$;

revoke all on function public.request_corpus_sweep_cancel(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.request_corpus_sweep_cancel(uuid) to authenticated;

create function public.service_bind_corpus_sweep_workflow(p_run uuid, p_workflow_run_id text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(trim(p_workflow_run_id), '') is null then
    raise exception 'workflow run id is required' using errcode = '22023';
  end if;
  update public.corpus_sweep_runs
     set workflow_run_id = p_workflow_run_id, updated_at = now()
   where id = p_run and status in ('queued', 'running')
     and (workflow_run_id is null or workflow_run_id = p_workflow_run_id);
  if not found then
    raise exception 'bindable corpus sweep not found' using errcode = 'P0002';
  end if;
  return p_run;
end;
$$;

create function public.service_claim_corpus_sweep_launch(p_run uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.corpus_sweep_runs
     set launch_claimed_at = now(), updated_at = now()
   where id = p_run and status = 'queued' and workflow_run_id is null
     and (launch_claimed_at is null or launch_claimed_at < now() - interval '5 minutes');
  return found;
end;
$$;

create function public.service_begin_corpus_sweep(
  p_run uuid,
  p_work_ids uuid[],
  p_total_count integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  run public.corpus_sweep_runs%rowtype;
  item_count integer;
begin
  if coalesce(cardinality(p_work_ids), 0) > 400 then
    raise exception 'corpus sweep exceeds the 400-work run limit' using errcode = '22023';
  end if;
  if p_total_count < 0 or p_total_count < coalesce(cardinality(p_work_ids), 0) then
    raise exception 'invalid corpus sweep total' using errcode = '22023';
  end if;
  select * into run from public.corpus_sweep_runs where id = p_run for update;
  if not found then
    raise exception 'corpus sweep not found' using errcode = 'P0002';
  end if;

  select count(*) into item_count
  from public.corpus_sweep_run_items where run_id = p_run;
  -- The step may be retried after this transaction committed but before Workflow received its
  -- response. Once started_at is set, the persisted item set and total are the snapshot; never
  -- merge a later read of the live corpus into it.
  if run.started_at is not null then
    return item_count;
  end if;
  if run.status not in ('queued', 'running') then
    raise exception 'active corpus sweep not found' using errcode = 'P0002';
  end if;

  insert into public.corpus_sweep_run_items (run_id, work_id, ordinal)
  select p_run, item.work_id, item.ordinal::integer
  from unnest(coalesce(p_work_ids, '{}')) with ordinality item(work_id, ordinal)
  on conflict (run_id, work_id) do nothing;

  select count(*) into item_count
  from public.corpus_sweep_run_items where run_id = p_run;

  update public.corpus_sweep_runs
     set status = case when cancel_requested_at is null then 'running' else 'cancelled' end,
         phase = case when cancel_requested_at is null then 'recovering' else 'complete' end,
         total_count = p_total_count,
         started_at = coalesce(started_at, now()),
         heartbeat_at = now(),
         completed_at = case when cancel_requested_at is null then null else now() end,
         updated_at = now()
   where id = p_run;
  return item_count;
end;
$$;

create function public.service_recover_corpus_sweep_covers(
  p_run uuid,
  p_batch integer,
  p_limit integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  run public.corpus_sweep_runs%rowtype;
  claims jsonb;
  result jsonb;
begin
  select * into run from public.corpus_sweep_runs where id = p_run for update;
  if not found or run.status <> 'running' then
    raise exception 'running corpus sweep not found' using errcode = 'P0002';
  end if;
  if p_batch = run.recovery_batch_count then
    return coalesce(run.recovery_last_result, jsonb_build_object('maybeMore', false));
  end if;
  if p_batch <= 0 or p_batch <> run.recovery_batch_count + 1 then
    raise exception 'unexpected corpus cover recovery batch' using errcode = '22023';
  end if;
  if run.cancel_requested_at is not null then
    return jsonb_build_object('cancelled', true, 'maybeMore', false);
  end if;

  begin
    claims := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
  exception when others then
    claims := '{}'::jsonb;
  end;
  perform set_config(
    'request.jwt.claims',
    (claims || jsonb_build_object(
      'sub', run.requested_by::text,
      'iss', run.requested_issuer
    ))::text,
    true
  );
  result := public.admin_recover_corpus_cover_batch(p_limit);

  update public.corpus_sweep_runs
     set phase = 'recovering',
         recovery_scanned_count = recovery_scanned_count + coalesce((result ->> 'scanned')::integer, 0),
         recovery_failed_count = recovery_failed_count + coalesce((result ->> 'failed')::integer, 0),
         recovered_cover_count = recovered_cover_count + coalesce((result ->> 'recoveredCovers')::integer, 0),
         recovered_option_count = recovered_option_count + coalesce((result ->> 'recoveredOptions')::integer, 0),
         recovery_batch_count = p_batch,
         recovery_last_result = result,
         recovery_maybe_more = coalesce((result ->> 'maybeMore')::boolean, false),
         error_message = coalesce(error_message, nullif(result ->> 'errorMessage', '')),
         heartbeat_at = now(), updated_at = now()
   where id = p_run;
  return result;
end;
$$;

create function public.service_defer_corpus_sweep_cover_recovery(
  p_run uuid,
  p_batch integer,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  run public.corpus_sweep_runs%rowtype;
begin
  select * into run from public.corpus_sweep_runs where id = p_run for update;
  if not found or run.status <> 'running' then return false; end if;
  if p_batch = run.recovery_batch_count then return true; end if;
  if p_batch <= 0 or p_batch <> run.recovery_batch_count + 1 then
    raise exception 'unexpected corpus cover recovery batch' using errcode = '22023';
  end if;

  update public.corpus_sweep_runs
     set recovery_failed_batch_count = recovery_failed_batch_count + 1,
         recovery_batch_count = p_batch,
         recovery_last_result = jsonb_build_object(
           'maybeMore', true,
           'errorMessage', left(coalesce(nullif(trim(p_error), ''), 'cover recovery failed'), 1000)
         ),
         recovery_maybe_more = true,
         error_message = coalesce(
           error_message,
           left(coalesce(nullif(trim(p_error), ''), 'cover recovery failed'), 1000)
         ),
         heartbeat_at = now(), updated_at = now()
   where id = p_run;
  return true;
end;
$$;

create function public.service_claim_corpus_sweep_item(p_run uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  run public.corpus_sweep_runs%rowtype;
  claimed_work uuid;
begin
  select * into run from public.corpus_sweep_runs where id = p_run for update;
  if not found or run.status <> 'running' then return null; end if;
  if run.cancel_requested_at is not null then
    update public.corpus_sweep_runs
       set status = 'cancelled', phase = 'complete', completed_at = now(),
           heartbeat_at = now(), updated_at = now()
     where id = p_run;
    return null;
  end if;

  -- A claim step can be retried after Postgres committed but before its response reached Workflow.
  -- Return that one in-flight item before touching the next pending row.
  select work_id into claimed_work
  from public.corpus_sweep_run_items
  where run_id = p_run and status = 'running'
  order by ordinal
  limit 1;

  if claimed_work is not null then return claimed_work; end if;

  select work_id into claimed_work
  from public.corpus_sweep_run_items
  where run_id = p_run and status = 'pending'
  order by ordinal
  limit 1
  for update skip locked;

  if claimed_work is not null then
    update public.corpus_sweep_run_items
       set status = 'running', attempt_count = attempt_count + 1,
           started_at = coalesce(started_at, now()), updated_at = now()
     where run_id = p_run and work_id = claimed_work;
    update public.corpus_sweep_runs
       set phase = 'classifying', heartbeat_at = now(), updated_at = now()
     where id = p_run;
  end if;
  return claimed_work;
end;
$$;

create function public.service_authorize_corpus_sweep_work(p_run uuid, p_work uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select run.requested_by
  from public.corpus_sweep_runs run
  join public.corpus_sweep_run_items item
    on item.run_id = run.id and item.work_id = p_work
  where run.id = p_run and run.status = 'running' and item.status = 'running'
    and run.cancel_requested_at is null;
$$;

create function public.service_apply_corpus_sweep_cover(
  p_run uuid,
  p_work uuid,
  p_patch jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  run public.corpus_sweep_runs%rowtype;
  item_status text;
  claims jsonb;
begin
  select * into run from public.corpus_sweep_runs where id = p_run for update;
  if not found or run.status <> 'running' then return false; end if;
  select status into item_status
  from public.corpus_sweep_run_items
  where run_id = p_run and work_id = p_work
  for update;
  if item_status is distinct from 'running' then return false; end if;

  begin
    claims := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
  exception when others then
    claims := '{}'::jsonb;
  end;
  perform set_config(
    'request.jwt.claims',
    (claims || jsonb_build_object(
      'sub', run.requested_by::text,
      'iss', run.requested_issuer
    ))::text,
    true
  );
  -- Match the established browser pipeline: preserve the exact current cover before the metadata
  -- provider call, while a null check time leaves the work eligible if that later call is deferred.
  perform public.complete_corpus_work_metadata(p_work, coalesce(p_patch, '{}'::jsonb), null);
  update public.corpus_sweep_runs
     set heartbeat_at = now(), updated_at = now()
   where id = p_run;
  return true;
end;
$$;

create function public.service_complete_corpus_sweep_item(
  p_run uuid,
  p_work uuid,
  p_patch jsonb,
  p_series_result jsonb,
  p_checked_at timestamptz,
  p_outcome jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  run public.corpus_sweep_runs%rowtype;
  item_status text;
  claims jsonb;
  series_write jsonb;
  changed boolean;
begin
  select * into run from public.corpus_sweep_runs where id = p_run for update;
  if not found or run.status <> 'running' then return false; end if;
  select status into item_status
  from public.corpus_sweep_run_items
  where run_id = p_run and work_id = p_work
  for update;
  if item_status is distinct from 'running' then return false; end if;

  begin
    claims := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
  exception when others then
    claims := '{}'::jsonb;
  end;
  perform set_config(
    'request.jwt.claims',
    (claims || jsonb_build_object(
      'sub', run.requested_by::text,
      'iss', run.requested_issuer
    ))::text,
    true
  );
  perform public.complete_corpus_work_metadata(
    p_work, coalesce(p_patch, '{}'::jsonb), p_checked_at
  );
  series_write := public.record_corpus_series_discovery(
    p_work, coalesce(p_series_result, '{}'::jsonb), p_checked_at
  );
  changed := coalesce(p_patch, '{}'::jsonb) <> '{}'::jsonb
    or series_write ->> 'outcome' in ('applied', 'confirmed', 'review');

  update public.corpus_sweep_run_items
     set status = 'completed', outcome = coalesce(p_outcome, '{}'::jsonb)
           || jsonb_build_object('series', series_write),
         error_message = null, completed_at = now(), updated_at = now()
   where run_id = p_run and work_id = p_work;
  update public.corpus_sweep_runs
     set scanned_count = scanned_count + 1,
         filled_count = filled_count + case when changed then 1 else 0 end,
         nothing_count = nothing_count + case when changed then 0 else 1 end,
         heartbeat_at = now(), updated_at = now()
   where id = p_run;
  return true;
end;
$$;

create function public.service_defer_corpus_sweep_item(
  p_run uuid,
  p_work uuid,
  p_error text,
  p_outcome jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.corpus_sweep_runs
  where id = p_run and status = 'running'
  for update;
  if not found then return false; end if;

  update public.corpus_sweep_run_items
     set status = 'deferred', outcome = coalesce(p_outcome, '{}'::jsonb),
         error_message = left(coalesce(nullif(trim(p_error), ''), 'provider failed'), 1000),
         completed_at = now(), updated_at = now()
   where run_id = p_run and work_id = p_work and status = 'running';
  if not found then return false; end if;

  update public.corpus_sweep_runs
     set failed_count = failed_count + 1,
         error_message = coalesce(error_message, left(coalesce(nullif(trim(p_error), ''), 'provider failed'), 1000)),
         heartbeat_at = now(), updated_at = now()
   where id = p_run;
  return true;
end;
$$;

create function public.service_finish_corpus_sweep(p_run uuid, p_error text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  unfinished integer;
begin
  select count(*) into unfinished
  from public.corpus_sweep_run_items
  where run_id = p_run and status in ('pending', 'running');

  update public.corpus_sweep_runs
     set status = case
           when cancel_requested_at is not null then 'cancelled'
           when nullif(trim(p_error), '') is not null then 'failed'
           when unfinished > 0 then 'failed'
           else 'completed'
         end,
         phase = 'complete',
         error_message = coalesce(
           nullif(trim(p_error), ''),
           case when unfinished > 0 then 'workflow finished with unfinished items' end,
           error_message
         ),
         heartbeat_at = now(), completed_at = now(), updated_at = now()
   where id = p_run and status in ('queued', 'running');
  if not found then
    perform 1 from public.corpus_sweep_runs where id = p_run;
    if not found then raise exception 'corpus sweep not found' using errcode = 'P0002'; end if;
  end if;
  return p_run;
end;
$$;

-- Every workflow mutation is service-only. Reset every named platform role first; granting only
-- service_role without these revokes would leave legacy PUBLIC/anon/authenticated execute grants.
revoke all on function public.service_bind_corpus_sweep_workflow(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.service_claim_corpus_sweep_launch(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.service_begin_corpus_sweep(uuid, uuid[], integer)
  from public, anon, authenticated, service_role;
revoke all on function public.service_recover_corpus_sweep_covers(uuid, integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.service_defer_corpus_sweep_cover_recovery(uuid, integer, text)
  from public, anon, authenticated, service_role;
revoke all on function public.service_claim_corpus_sweep_item(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.service_authorize_corpus_sweep_work(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.service_apply_corpus_sweep_cover(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.service_complete_corpus_sweep_item(
  uuid, uuid, jsonb, jsonb, timestamptz, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.service_defer_corpus_sweep_item(uuid, uuid, text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.service_finish_corpus_sweep(uuid, text)
  from public, anon, authenticated, service_role;

grant execute on function public.service_bind_corpus_sweep_workflow(uuid, text) to service_role;
grant execute on function public.service_claim_corpus_sweep_launch(uuid) to service_role;
grant execute on function public.service_begin_corpus_sweep(uuid, uuid[], integer) to service_role;
grant execute on function public.service_recover_corpus_sweep_covers(uuid, integer, integer)
  to service_role;
grant execute on function public.service_defer_corpus_sweep_cover_recovery(uuid, integer, text)
  to service_role;
grant execute on function public.service_claim_corpus_sweep_item(uuid) to service_role;
grant execute on function public.service_authorize_corpus_sweep_work(uuid, uuid) to service_role;
grant execute on function public.service_apply_corpus_sweep_cover(uuid, uuid, jsonb)
  to service_role;
grant execute on function public.service_complete_corpus_sweep_item(
  uuid, uuid, jsonb, jsonb, timestamptz, jsonb
) to service_role;
grant execute on function public.service_defer_corpus_sweep_item(uuid, uuid, text, jsonb)
  to service_role;
grant execute on function public.service_finish_corpus_sweep(uuid, text) to service_role;

comment on table public.corpus_sweep_runs is
  'Durable administrator corpus-sweep state. Supabase remains authoritative across browser reloads and Workflow retries.';
comment on table public.corpus_sweep_run_items is
  'Idempotent per-work checkpoints for one durable corpus sweep.';
