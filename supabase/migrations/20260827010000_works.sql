-- works — the shared corpus, and works-layer Phase 1 (claude/task-works-layer-scope.md; owner
-- decisions 2026-08-22). One row per WORK, readable by every signed-in reader, holding OBJECTIVE
-- metadata only. This is the first book-describing table in the schema that is not per-user.
--
-- ── WHAT MAY LIVE HERE, AND WHAT NEVER MAY ──────────────────────────────────────────────────────
-- Objective, shareable bibliographic fields: title, contributors, series/position/count/status,
-- pages, publication date, canonical cover fields, primary genre, tags. NOTHING personal ever
-- lands in this table: no ratings, no read state, no ownership, no spice/darkness — and never any
-- AGGREGATE of personal data (the no-averaged-rating rule is app-wide and applies doubly to a
-- shared table). A reader's own copy of these facts continues to live on their `books` row; this
-- table is the catalog they browse, not the shelf they own.
--
-- ── IDENTITY: work_key, with work_id alongside (works-scoping recommendation B) ─────────────────
-- work_key = enrichment_cache.work_id when the work has been resolved, else the normalized
-- `title|author` pair. The normalization is packages/core/src/normalize.ts's `norm` (lowercase,
-- strip to a-z0-9) over title and the FULL author name — chosen because it is byte-identical to
-- how the enrich fn builds enrichment_cache's own `ta:` keys (enrich/index.ts:63,524), so the
-- enrichment backfill is a pure key join (`'ta:' || work_key`) rather than a heuristic re-match.
-- `work_id` sits nullable beside it so a later editions layer renames nothing.
--
-- ── WRITE PATH: service_role ONLY, and the missing policies are the design ─────────────────────
-- RLS is ENABLED with exactly one SELECT policy. There are deliberately NO insert/update/delete
-- policies: service_role bypasses RLS, and the import script + enrichment backfill (both
-- owner-run, both service-role) ARE the write path — the enrichment_cache pattern, one table up.
-- Do not "fix" the missing policies. Client promotion is fenced out on purpose: without this, one
-- reader's typo in a title becomes every reader's metadata. If a client-facing write path is ever
-- wanted, it arrives as a reviewed RPC with the full revoke-then-grant treatment (CLAUDE.md's RPC
-- rule), not as a policy on this table.

create table public.works (
  id uuid primary key default gen_random_uuid(),
  -- canonical identity; see header. Unique is the idempotency anchor for the import's upsert.
  work_key text not null unique,
  -- resolved external work identity (enrichment_cache.work_id), when known
  work_id text,
  title text not null,
  -- the Contributor[] shape the app's Book type carries: [{ name, role, position }]
  contributors jsonb not null default '[]',
  -- DENORMALIZED search target: the contributor names joined as plain text, written by the same
  -- scripts that write `contributors`. Exists because the browse's author search runs through
  -- PostgREST, which can `ilike` a text column but cannot substring-search inside a jsonb array —
  -- `contains` is exact-shape containment, not "name includes". One writer (the import/backfill),
  -- two representations, and the jsonb stays the structured truth.
  author_text text not null default '',
  series text,
  position numeric,
  series_count int,
  status text,
  pages int,
  pub_y int,
  pub_m int,
  pub_d int,
  cover_url text,
  cover_source text,
  cover_source_url text,
  cover_color text,
  cover_confidence numeric,
  -- primary genre (lowercased canonical token, the shape genreNormalize emits)
  genre text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at rides the same trigger fn every mutable table here uses.
create trigger works_set_updated_at
  before update on public.works
  for each row execute function public.set_updated_at();

create index works_genre_idx on public.works (genre);
-- Title search: a plain `ilike` scan over ~1.2k rows measures in fractions of a millisecond, so no
-- trigram index is added and pg_trgm stays un-enabled (it is not in use anywhere in this schema).
-- The decision is recorded here rather than silently omitted: if the corpus grows to the point
-- where browse search is measurably slow, enable pg_trgm and add a gin(title gin_trgm_ops) index
-- THEN, against a measurement — not now, against a guess.

alter table public.works enable row level security;

-- The whole read model: any signed-in reader browses the corpus. anon stays outside — the corpus
-- is app content, not a public API.
create policy "works: read all" on public.works
  for select to authenticated using (true);

grant select on public.works to authenticated;
grant all on public.works to service_role;
