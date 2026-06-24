-- A4 — bulk "complete missing covers/info" resumability + negative cache.
-- When the bulk action checks a book against the enrichment sources it stamps enriched_at,
-- whether or not anything was found. Reruns skip books checked recently, so a 1,000-book run
-- that stops partway resumes from where it left off and a "nothing found" result isn't
-- re-hammered. (The enrich Edge Function still caches per ISBN/title at the API layer.)
alter table public.books add column enriched_at timestamptz;
