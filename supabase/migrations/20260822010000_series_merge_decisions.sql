-- series_merge_decisions — the persistent ruling table (docs/tasks/task-series-consolidation.md).
--
-- ── Why this exists ──────────────────────────────────────────────────────────────────────────────
-- Phase 1's audit (fix/duplicate-series) found eleven candidate duplicate series-name pairs and the
-- signal quality was wildly uneven: one initialism link was real (ACOTAR <-> A Court of Thorns and
-- Roses), nine of ten prefix links were noise. That is why this repo does NOT auto-decide identity
-- judgments (Tier 4 does not exist as a product surface — see seriesNameKey's own comment). Instead
-- every pair gets decided ONCE, by a human, and the decision is remembered forever in both
-- directions — that is what makes triage a one-time cost instead of a recurring prompt. This table
-- is the memory.
--
-- ── Three outcomes, not two ──────────────────────────────────────────────────────────────────────
-- The task doc as originally written names two: same (merge) and distinct (leave alone, suppress
-- re-proposal). fix/series-consolidation's PR 1 (aadb71b, seriesNameKey's own comment) found a THIRD
-- shape neither covers: Fifty Shades / Fifty Shades as Told by Christian, Ravenhood Legacy / The
-- Ravenhood, Sinners / Sinners and Saints, Mountain Men / Mountain Men Matchmaker are SIBLING series
-- in a shared universe — related, but each its own reading order, its own length, its own "have I
-- read this" state. Recording them as 'distinct' is technically true but throws away the
-- relationship; recording them as 'same' would flatten two real series into one, which is exactly
-- the Tier 4 failure mode this whole mechanism exists to prevent. related_but_separate names the
-- shape rather than forcing it through one of the other two. (No UI consumes this outcome yet — that
-- is PR 3's job — but the schema needs to hold the true answer from day one, not the nearest of two
-- wrong ones.)
--
-- ── Why 'same' cannot be recorded here directly ──────────────────────────────────────────────────
-- Only merge_series (next migration) is allowed to write ruling = 'same', as part of actually
-- performing the merge in the same transaction. Recording 'same' WITHOUT merging would permanently
-- suppress re-proposal of a pair whose duplicate row is still sitting there live — the exact
-- "found once, then invisible forever" failure this table exists to prevent, just pointed at the
-- wrong target. record_series_ruling (this file) refuses ruling = 'same' outright and says so.
--
-- ── Name keys are supplied by the caller, never recomputed here ─────────────────────────────────
-- seriesNameKey (packages/core/src/seriesIndex.ts) is the ONE implementation of the normalization
-- rule (lowercase, strip one leading article, strip a trailing "series", drop non-alphanumerics).
-- Reimplementing it in SQL would create a second copy that can silently drift from the first — the
-- exact class of defect this repo's own CLAUDE.md keeps naming (a stored fact two writers can
-- disagree about). Every function here takes pre-computed keys as text and only compares/orders
-- them; it never derives one from a name.
--
-- ── Canonical pair ordering ──────────────────────────────────────────────────────────────────────
-- name_key_a/name_key_b always store name_key_a <= name_key_b (a check constraint, not just
-- convention) so a pair decided as (A, B) is found whichever order it is later proposed in.
-- unique (owner_id, name_key_a, name_key_b) is the structural guarantee that a ruling, once made,
-- cannot be silently duplicated by re-triage.

create table public.series_merge_decisions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name_key_a text not null,
  name_key_b text not null,
  ruling text not null check (ruling in ('same', 'distinct', 'related_but_separate')),
  -- Populated only when ruling = 'same' — which series row survived and what name became its alias.
  -- Both null for distinct/related_but_separate: there is no survivor because nothing merged.
  surviving_series_id uuid references public.series(id) on delete set null,
  alias_name text,
  decided_at timestamptz not null default now(),
  constraint series_merge_decisions_pair_ordered check (name_key_a <= name_key_b),
  constraint series_merge_decisions_same_has_survivor check (
    (ruling = 'same' and surviving_series_id is not null and alias_name is not null)
    or (ruling <> 'same' and surviving_series_id is null and alias_name is null)
  ),
  unique (owner_id, name_key_a, name_key_b)
);

comment on table public.series_merge_decisions is
  'One row per owner per decided series-name pair (Tier 3 proposals and manual merges). ruling is '
  'same/distinct/related_but_separate; name_key_a <= name_key_b so either proposal order finds the '
  'same row. same rows are written only by merge_series, atomically with the merge itself.';

create index series_merge_decisions_owner_idx on public.series_merge_decisions (owner_id);

alter table public.series_merge_decisions enable row level security;

create policy series_merge_decisions_select on public.series_merge_decisions
  for select using (owner_id = auth.uid());
create policy series_merge_decisions_insert on public.series_merge_decisions
  for insert with check (owner_id = auth.uid());
create policy series_merge_decisions_update on public.series_merge_decisions
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy series_merge_decisions_delete on public.series_merge_decisions
  for delete using (owner_id = auth.uid());

-- record_series_ruling — the ONLY path for 'distinct' and 'related_but_separate'. 'same' is refused
-- here by design; see header. Upserts on the canonical pair so re-deciding (a reader changing their
-- mind — CLAUDE.md's Wings-and-Ruin precedent: the protection guards against silent algorithmic
-- override, never against the reader changing their mind) replaces the prior ruling rather than
-- erroring or duplicating.
create or replace function public.record_series_ruling(
  p_series_a   uuid,
  p_series_b   uuid,
  p_name_key_a text,
  p_name_key_b text,
  p_ruling     text
)
returns public.series_merge_decisions
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := (select auth.uid());
  v_row public.series_merge_decisions;
begin
  if p_ruling not in ('distinct', 'related_but_separate') then
    raise exception 'record_series_ruling: ruling must be distinct or related_but_separate — same is recorded by merge_series only, never here'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_series_a = p_series_b then
    raise exception 'record_series_ruling: a series cannot be ruled against itself';
  end if;
  if not exists (select 1 from public.series where id = p_series_a and owner_id = uid) then
    raise exception 'not owner of series a';
  end if;
  if not exists (select 1 from public.series where id = p_series_b and owner_id = uid) then
    raise exception 'not owner of series b';
  end if;
  if coalesce(p_name_key_a, '') = '' or coalesce(p_name_key_b, '') = '' then
    raise exception 'record_series_ruling: name keys must be computed by the caller (seriesNameKey) — this function does not derive them, to avoid a second implementation drifting from the TypeScript one';
  end if;

  insert into public.series_merge_decisions (owner_id, name_key_a, name_key_b, ruling)
  values (uid, least(p_name_key_a, p_name_key_b), greatest(p_name_key_a, p_name_key_b), p_ruling)
  on conflict (owner_id, name_key_a, name_key_b)
  do update set ruling = excluded.ruling, decided_at = now(), surviving_series_id = null, alias_name = null
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.record_series_ruling(uuid, uuid, text, text, text) from public;
revoke execute on function public.record_series_ruling(uuid, uuid, text, text, text) from anon;
grant  execute on function public.record_series_ruling(uuid, uuid, text, text, text) to authenticated;
