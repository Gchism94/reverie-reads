-- D1: global shared enrichment cache (docs/ENRICHMENT_STRATEGY.md Step 5). The enrich Edge
-- Function stores the merged, most-complete record here keyed by a canonical cache key AND the
-- resolved ISBN-13 / work / edition id, so the Nth user scanning the same book hits cache and
-- makes ZERO external calls. This is reference data, not per-user: it holds no owner_id and is
-- reachable ONLY by the service role (the Edge Function) — RLS is enabled with NO policies, so
-- the anon/authenticated clients can never read or write it directly.
create table public.enrichment_cache (
  -- canonical key: 'isbn:<13>' when an ISBN is known, else 'ta:<norm-title>|<norm-author>'.
  key text primary key,
  isbn13 text,
  work_id text,
  edition_id text,
  record jsonb not null,        -- the merged EnrichedRecord (includes per-field provenance)
  provenance jsonb,             -- per-field { source, at } (mirrored from record for querying)
  complete boolean not null default false, -- high-value fields present → 30-day window, else 3-day
  fetched_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Secondary lookups so a scan-by-ISBN or a resolve-to-work both hit the same row.
create index enrichment_cache_isbn13_idx on public.enrichment_cache (isbn13) where isbn13 is not null;
create index enrichment_cache_work_idx on public.enrichment_cache (work_id) where work_id is not null;

alter table public.enrichment_cache enable row level security; -- no policies: service role only
grant all on public.enrichment_cache to service_role;
