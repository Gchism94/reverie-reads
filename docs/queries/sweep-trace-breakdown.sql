-- Read a trace run recorded by "⏱ Trace 10 books" (Settings → Library tools).
-- Read-only. Run against production after the traced sweep completes.
--
-- The run id is printed in the status line when the run finishes, and is also just the most recent:
--   select distinct run_id, min(created_at) from public.sweep_traces group by 1 order by 2 desc;

-- ── 1. THE HEADLINE: where a book's wall time goes, averaged across the run ──────────────────
-- `share_pct` is against measured wall time, so it answers "what fraction of a book is this stage".
with latest as (
  select run_id from public.sweep_traces order by created_at desc limit 1
),
rows as (
  select t.id, t.total_ms, s.ord, s.span
  from public.sweep_traces t
  join latest using (run_id),
       lateral jsonb_array_elements(t.spans) with ordinality as s(span, ord)
),
per_stage as (
  select span->>'s' as stage,
         count(*) as calls,
         round(avg((span->>'ms')::numeric), 1) as avg_ms,
         round(max((span->>'ms')::numeric), 1) as max_ms,
         round(sum((span->>'ms')::numeric), 1) as total_ms
  from rows group by 1
)
select stage, calls, avg_ms, max_ms, total_ms,
       round(100 * total_ms / nullif((select sum(total_ms) from public.sweep_traces t join latest using (run_id)), 0), 1) as share_pct
from per_stage
order by total_ms desc;

-- ── 2. THE GAP: measured spans vs the iteration's own wall clock ─────────────────────────────
-- `total_ms` is wall time for the WHOLE iteration; the spans only cover the stages we instrumented.
-- `unaccounted_ms` is the answer to "is the 45s inside a stage, or between them?" A large value
-- here means the time is NOT in any timed stage — look at transport, cold starts, or the browser.
with latest as (select run_id from public.sweep_traces order by created_at desc limit 1)
select t.book_title,
       round(t.total_ms, 1) as wall_ms,
       round((select coalesce(sum((s.span->>'ms')::numeric), 0)
                from jsonb_array_elements(t.spans) as s(span)), 1) as measured_ms,
       round(t.total_ms - (select coalesce(sum((s.span->>'ms')::numeric), 0)
                from jsonb_array_elements(t.spans) as s(span)), 1) as unaccounted_ms,
       t.outcome, t.cover_source
from public.sweep_traces t join latest using (run_id)
order by t.total_ms desc;

-- ── 3. THE SELF-BLOCKING: ol-search is consumed twice per book ───────────────────────────────
-- Call 1 pays whatever gap is left from the previous book; call 2 pays a gap measured from call 1,
-- moments earlier in the SAME request. If call 2's wait is consistently near 1000ms, a book is
-- blocking itself and the two consumptions should be collapsed to one.
with latest as (select run_id from public.sweep_traces order by created_at desc limit 1)
select s.span->>'s' as stage,
       row_number() over (partition by t.id, s.span->>'s' order by s.ord) as nth_call,
       round(avg((s.span->>'ms')::numeric) over (partition by s.span->>'s'), 1) as avg_ms
from public.sweep_traces t
join latest using (run_id),
     lateral jsonb_array_elements(t.spans) with ordinality as s(span, ord)
where s.span->>'s' like 'pace.%'
order by t.id, s.ord;

-- ── 4. Does the enrich cache hide the cost? A cached book skips every source call. ───────────
with latest as (select run_id from public.sweep_traces order by created_at desc limit 1)
select case when t.spans::text like '%fetch.%' then 'went to the sources' else 'served from cache' end as path,
       count(*) as books,
       round(avg(t.total_ms), 1) as avg_wall_ms
from public.sweep_traces t join latest using (run_id)
group by 1;
