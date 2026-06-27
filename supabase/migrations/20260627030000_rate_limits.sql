-- Phase 7 H3: per-user/IP rate limiting for the user-facing Edge Functions (enrich, geo), to stop
-- abuse + upstream quota burn. A fixed-window counter in Postgres, incremented atomically; the
-- functions call rate_limit_consume with the service role and return 429 + Retry-After when over.
-- Reference data, service-role only (RLS on, no policies, no client grants).
create table public.rate_limits (
  bucket text not null,             -- e.g. 'enrich:user:<uid>' | 'geo:ip:<addr>'
  window_start timestamptz not null,
  count int not null default 0,
  primary key (bucket, window_start)
);
alter table public.rate_limits enable row level security; -- no policies: service role only
grant all on public.rate_limits to service_role;

-- Atomically count one hit in the current fixed window and report whether it's allowed.
create or replace function public.rate_limit_consume(p_key text, p_max int, p_window_secs int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  w_start timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_secs) * p_window_secs);
  w_end timestamptz := w_start + make_interval(secs => p_window_secs);
  c int;
begin
  insert into public.rate_limits (bucket, window_start, count)
    values (p_key, w_start, 1)
    on conflict (bucket, window_start) do update set count = public.rate_limits.count + 1
    returning count into c;
  return jsonb_build_object(
    'allowed', c <= p_max,
    'count', c,
    'limit', p_max,
    'remaining', greatest(0, p_max - c),
    'reset_at', w_end,
    'retry_after', greatest(0, ceil(extract(epoch from (w_end - now())))::int)
  );
end;
$$;
grant execute on function public.rate_limit_consume(text, int, int) to service_role;

-- Housekeeping: drop windows older than a day so the table stays small. (Owner: schedule via
-- pg_cron, e.g. hourly; harmless to skip — rows are tiny and bounded per bucket per window.)
create or replace function public.prune_rate_limits()
returns void language sql security definer set search_path = public as $$
  delete from public.rate_limits where window_start < now() - interval '1 day';
$$;
