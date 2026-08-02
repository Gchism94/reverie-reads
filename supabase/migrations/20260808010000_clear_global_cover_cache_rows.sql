-- Stop enrichment_cache from still handing out the removed global cover cache's URLs.
--
-- `chore/drop-global-cover-cache` removed the WRITER (`scheduleCoverCache`), not what it already
-- wrote. `enrichment_cache` rows it rewrote still carry a `record.cover` pointing at our own
-- Storage bucket, and nothing about removing the writer makes those rows go stale early: a
-- rewritten row has both a cover and an isbn13, so `isComplete` is true and `isFresh` keeps it
-- for COMPLETE_DAYS = 30. Every hit on such a row still hands `bulkComplete` and `AddRoute` a
-- stored URL that `isIngestibleCoverUrl` declines to re-ingest (it already looks like ours) — so
-- new covers with no thumb and no colour could keep appearing for up to 30 days after this
-- deploys, from a writer that no longer exists to explain them.
--
-- ── Why `record.cover` is nulled and not `provenance` ───────────────────────────────────────────
-- `provenance` (both the mirrored column and the copy nested inside `record` itself) is the ONLY
-- surviving witness to where a cover really came from — the object path is just an ISBN, and once
-- adopted a book's own row carries our host, same as the row here. Clearing it now would make the
-- Google-origin breakdown this cleanup is a precondition for permanently unanswerable. Left alone.
--
-- ── Why the condition can only match rows the removed writer touched ───────────────────────────
-- `record.cover` is populated by mergeRecords from the source adapters (Google / Open Library /
-- Hardcover / ISBNdb), which return external URLs — the merge itself never had a reason to write
-- our own Storage host. The only code path that ever put a `/storage/v1/object/public/covers/` URL
-- into `record.cover` was `scheduleCoverCache`'s PATCH. So the WHERE clause below cannot match a
-- row this migration didn't mean to touch.
--
-- ── What this does NOT do ───────────────────────────────────────────────────────────────────────
-- No `storage.objects` row is touched or deleted — the already-stored bytes are a separate,
-- deliberately deferred data decision (docs/BACKLOG.md). A cleared row simply falls through to a
-- fresh source query on its next cache miss, same as any other stale row.
do $$
declare
  n_cleared int;
begin
  update public.enrichment_cache
  set record = jsonb_set(record, '{cover}', '""'::jsonb),
      complete = false, -- isComplete requires a cover; clearing it must retire the 30-day window too
      updated_at = now()
  where record ->> 'cover' like '%/storage/v1/object/public/covers/%';

  get diagnostics n_cleared = row_count;

  raise notice 'global cover cache cleanup: % enrichment_cache row(s) had record.cover pointing at our own Storage bucket, now cleared; provenance left intact on all of them',
    n_cleared;
end $$;
