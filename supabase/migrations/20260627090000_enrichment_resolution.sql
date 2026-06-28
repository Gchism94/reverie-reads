-- E1: title+author → ISBN/cover resolution metadata on the global enrichment cache
-- (docs/COVER_SOURCING_AND_STUDIO.md Part 1). The real import files carry no ISBNs, so the enrich
-- Edge Function resolves identity from a title+author search and records HOW sure it is, the query it
-- used, and the alternate edition candidates the Cover Studio offers. Stored next to the cached record
-- so a cache hit (the Nth importer of the same book) replays the same confidence + cover choices with
-- zero external calls. Service-role only, like the rest of the table (RLS enabled, no policies).
alter table public.enrichment_cache
  add column if not exists confidence text,    -- 'high' | 'medium' | 'low' | 'none' (E1 match confidence)
  add column if not exists match_query text,   -- the normalized title+author query the search used
  add column if not exists alternates jsonb;   -- [{ source, cover, isbn13, title, author }] edition choices

-- Surface low-confidence / unresolved matches for the import-review "needs a look" bucket without a
-- full scan (covers the common 'low' + 'none' lookups; high-confidence rows are the vast majority).
create index if not exists enrichment_cache_low_confidence_idx
  on public.enrichment_cache (confidence)
  where confidence in ('low', 'none');
