-- Close the stranded-run class exposed by the first production Workflow launch. A Workflow that
-- fails outside user code cannot call service_finish_corpus_sweep, so an indefinitely queued or
-- running row would otherwise hold corpus_sweep_runs_one_active_idx forever. Cancellation is now
-- terminal immediately, and a later administrator start may retire a run whose durable heartbeat
-- has been absent for more than 30 minutes before creating its replacement.

create or replace function public.start_corpus_sweep()
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

  -- This also closes cancellation requests written before this migration, whose failed Workflow
  -- can no longer reach a service checkpoint to make the transition itself.
  update public.corpus_sweep_runs
     set status = 'cancelled', phase = 'complete', heartbeat_at = now(),
         completed_at = coalesce(completed_at, now()), updated_at = now()
   where status in ('queued', 'running') and cancel_requested_at is not null;

  -- Five-minute systemic pauses and step retry windows remain safely below this threshold. A row
  -- without any launch heartbeat falls back to launch/creation time, covering pre-step failures.
  update public.corpus_sweep_runs
     set status = 'failed', phase = 'complete',
         error_message = coalesce(error_message, 'workflow heartbeat expired before completion'),
         heartbeat_at = now(), completed_at = coalesce(completed_at, now()), updated_at = now()
   where status in ('queued', 'running')
     and cancel_requested_at is null
     and coalesce(heartbeat_at, launch_claimed_at, created_at)
       < now() - interval '30 minutes';

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

create or replace function public.request_corpus_sweep_cancel(p_run uuid)
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
     set status = 'cancelled', phase = 'complete',
         cancel_requested_at = coalesce(cancel_requested_at, now()),
         heartbeat_at = now(), completed_at = coalesce(completed_at, now()), updated_at = now()
   where id = p_run and status in ('queued', 'running');
  if found then return p_run; end if;

  -- Browser retries and double submissions must reconnect to the same terminal result.
  perform 1 from public.corpus_sweep_runs where id = p_run and status = 'cancelled';
  if found then return p_run; end if;

  raise exception 'active corpus sweep not found' using errcode = 'P0002';
end;
$$;

-- CREATE OR REPLACE preserves existing ACLs, but restate the boundary so this migration remains
-- independently auditable against projects with legacy default privileges.
revoke all on function public.start_corpus_sweep()
  from public, anon, authenticated, service_role;
grant execute on function public.start_corpus_sweep() to authenticated;

revoke all on function public.request_corpus_sweep_cancel(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.request_corpus_sweep_cancel(uuid) to authenticated;
