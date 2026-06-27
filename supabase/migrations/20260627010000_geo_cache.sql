-- Phase 7 H2: server-side cache for the policy-bound geo calls (Overpass nearby-store queries +
-- Nominatim geocoding) proxied through the `geo` Edge Function. Reference data, not per-user: keyed
-- by a rounded area / normalized query so the Nth identical search makes zero upstream calls
-- (respecting OSM usage policy). Reachable ONLY by the service role — RLS on, no policies, no
-- client grants — like enrichment_cache.
create table public.geo_cache (
  key text primary key,           -- 'stores:<lat>,<lng>:<radius>' | 'geocode:<q>' | 'reverse:<lat>,<lng>'
  payload jsonb not null,         -- the raw upstream response (parsed client-side)
  fetched_at timestamptz not null default now()
);
alter table public.geo_cache enable row level security; -- no policies: service role only
grant all on public.geo_cache to service_role;
