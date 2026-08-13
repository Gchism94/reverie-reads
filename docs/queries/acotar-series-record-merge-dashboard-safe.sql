-- ACOTAR consolidation — dashboard-safe rewrite of THE FIX.
--
-- Same PRE-FLIGHT (Q1-Q4) and POST-RUN AUDIT (A1-A5) as acotar-series-record-merge.sql —
-- unchanged, still run those from the SQL Editor exactly as before. Only THE FIX section
-- below is different.
--
-- WHY THIS VERSION: the original THE FIX used `begin; set local role ...; select set_config(...);
-- do $$ ... $$; select merge_series(...); commit; reset role;` — an explicit transaction spanning
-- SEVEN separate statements. merge_series() reads auth.uid() internally (packages/core confirms:
-- every ownership check in the function is `where owner_id = (select auth.uid())`), so
-- request.jwt.claims has to be set in the SAME transaction as the merge_series() call itself —
-- set_config(..., true) is transaction-local and resets the instant its transaction ends. When
-- run via the Supabase SQL Editor, that transaction didn't survive to the final `commit;`: the
-- RPC ran for real (the JSON it returned had real counts), but whatever committed never included
-- it, so POST-RUN AUDIT showed nothing had changed.
--
-- This version puts EVERYTHING — the claim, the guards, and the merge_series() call — inside one
-- `do $$ ... $$` block. A `do` block is a single statement. Postgres cannot split it across two
-- transactions or two connections; it either runs whole or doesn't run at all. No begin, no
-- commit, no role-switching to keep in sync — one paste, one statement, one outcome.

\set ON_ERROR_STOP on

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- THE FIX — run this whole block as ONE paste (don't split it), only after PRE-FLIGHT (Q1-Q4 in
-- acotar-series-record-merge.sql) still match.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

do $$
declare
  n_primary    int;
  n_loser      int;
  n_loser_live int;
  result       jsonb;
  primary_id   constant uuid := 'aa4e251e-be7a-45bf-a66b-78bbf9406e71';
  loser_id     constant uuid := '2bec23ba-a016-4e97-aa60-e7dfff528fa7';
  owner_id_    constant uuid := 'd4bf8f6b-c754-48b6-914c-7ea0227bb7fa';
begin
  -- Impersonate the owner for this statement only — merge_series() needs auth.uid() to resolve.
  -- is_local => true is safe here specifically BECAUSE this whole do-block is one transaction;
  -- it doesn't need to outlive this block, and it can't leak into anything that runs after it.
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', owner_id_::text, 'role', 'authenticated')::text, true);

  -- Same three guards as the original — re-verify nothing has moved since PRE-FLIGHT.
  select count(*) into n_primary from public.series where id = primary_id and owner_id = owner_id_;
  if n_primary <> 1 then raise exception 'guard #1: primary series not found under expected owner, STOP'; end if;

  select count(*) into n_loser from public.series where id = loser_id and owner_id = owner_id_;
  if n_loser <> 1 then raise exception 'guard #2: loser series not found under expected owner, STOP'; end if;

  select count(*) into n_loser_live from public.series_entries
   where series_id = loser_id and removed_at is null;
  if n_loser_live <> 1 then
    raise exception 'guard #3: expected exactly 1 live entry on ACOTAR, found % — re-verify before merging', n_loser_live;
  end if;

  -- The merge itself, in the SAME statement as the claim that makes auth.uid() resolve.
  select public.merge_series(
    primary_id, loser_id, 'courtofthornsandroses', 'acotar'
  ) into result;

  raise notice 'merge_series result: %', result;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- POST-RUN AUDIT — identical to acotar-series-record-merge.sql's A1-A5. Copy those five queries
-- from that file and run them next (unchanged, still read-only, still the real proof — the
-- `raise notice` above is a nice-to-have, not the verification).
-- ════════════════════════════════════════════════════════════════════════════════════════════════
