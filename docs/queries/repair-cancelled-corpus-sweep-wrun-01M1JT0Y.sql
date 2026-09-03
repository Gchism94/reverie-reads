-- Production incident repair for Workflow run wrun_01M1JT0Y24V2DGJCHX60ZTF36K.
--
-- The Workflow failed before its first durable step because its step receiver was not serializable.
-- Two owner cancellation requests were recorded, but the failed Workflow could not reach the next
-- service checkpoint that formerly made cancellation terminal. Run this once in the Supabase SQL
-- editor after reviewing the selected row. It refuses any row that is not this exact cancelled,
-- still-active incident and is harmless if the row has already reached cancelled.

begin;

do $repair$
declare
  target public.corpus_sweep_runs%rowtype;
begin
  select * into target
  from public.corpus_sweep_runs
  where workflow_run_id = 'wrun_01M1JT0Y24V2DGJCHX60ZTF36K'
  for update;

  if not found then
    raise exception 'incident workflow run was not found';
  end if;
  if target.status = 'cancelled' then
    return;
  end if;
  if target.status not in ('queued', 'running') then
    raise exception 'incident run has unexpected status: %', target.status;
  end if;
  if target.cancel_requested_at is null then
    raise exception 'incident run has no administrator cancellation request';
  end if;

  update public.corpus_sweep_runs
     set status = 'cancelled', phase = 'complete', heartbeat_at = now(),
         completed_at = coalesce(completed_at, now()), updated_at = now()
   where id = target.id;
end
$repair$;

select id, workflow_run_id, status, phase, cancel_requested_at, completed_at
from public.corpus_sweep_runs
where workflow_run_id = 'wrun_01M1JT0Y24V2DGJCHX60ZTF36K';

commit;
