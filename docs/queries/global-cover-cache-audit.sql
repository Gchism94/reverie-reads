-- What the global `covers/{isbn}.jpg` objects actually are, and what reads them.
-- READ-ONLY. Run against production. Owner's to run — Code has no production read access
-- (see BACKLOG: the Supabase MCP connection reaches a different project).
--
-- Background: `scheduleCoverCache` in the enrich function stores every resolved cover a second
-- time at `covers/{isbn13}.jpg`, then PATCHes `enrichment_cache.record.cover` to that URL. The
-- next book to hit that cache key adopts the global object as its own cover and skips the client
-- ingest entirely, because `isIngestibleCoverUrl` sees a stored URL and declines to re-fetch it.

-- ── 1. The split, and whether the global objects are actually referenced by books ─────────────
-- If `books_pointing_at_global` is 0, nothing reads them through this path and they are dead
-- weight. If it is non-zero, those books took the cache-hit path.
select
  (select count(*) from storage.objects
     where bucket_id = 'covers' and name not like 'u/%')                as global_objects,
  (select count(*) from storage.objects
     where bucket_id = 'covers' and name like 'u/%')                    as client_ingest_objects,
  (select count(*) from public.books
     where cover_url like '%/storage/v1/object/public/covers/%'
       and cover_url not like '%/covers/u/%')                           as books_pointing_at_global,
  (select count(*) from public.books
     where cover_url like '%/storage/v1/object/public/covers/u/%')      as books_pointing_at_own;

-- ── 2. THE RIGHTS QUESTION: how many global objects are Google-derived? ──────────────────────
-- PRECEDENCE.cover puts google SECOND, and scheduleCoverCache has no host check, so Google bytes
-- can reach the shared bucket. Once stored, neither the cover_source label nor the host reveals
-- it — the enrichment_cache provenance is the only remaining witness.
select
  ec.provenance -> 'cover' ->> 'source'                                  as cover_came_from,
  count(*)                                                               as cache_rows,
  count(*) filter (where ec.record ->> 'cover' like '%/storage/v1/object/public/covers/%')
                                                                         as now_points_at_our_bucket
from public.enrichment_cache ec
where ec.provenance -> 'cover' ->> 'source' is not null
group by 1
order by 2 desc;

-- ── 3. Books whose stored cover came from Google via the global cache ────────────────────────
-- The audit in docs/reference/reverie-metadata-sourcing.md matched on cover_source_url's HOST, which a
-- laundered cover defeats. This joins back through the cache to recover the real origin.
select b.id, b.title, b.cover_source, left(b.cover_url, 70) as cover_url,
       ec.provenance -> 'cover' ->> 'source' as true_origin
from public.books b
join public.enrichment_cache ec
  on ec.record ->> 'cover' = b.cover_url
where ec.provenance -> 'cover' ->> 'source' = 'google'
order by b.title;

-- ── 4. Quality cost of the cache-hit path: no thumb, no colour ───────────────────────────────
-- Those are only set by the client ingest, which a book adopting a global object skips.
select
  case when cover_url like '%/covers/u/%' then 'client ingest' else 'global cache' end as path,
  count(*) as books,
  count(*) filter (where cover_thumb_url is null or cover_thumb_url = '') as missing_thumb,
  count(*) filter (where cover_color is null or cover_color = '')         as missing_colour
from public.books
where cover_url like '%/storage/v1/object/public/covers/%'
group by 1;
