import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// THE ENRICH FUNCTION MUST NOT WRITE COVER BYTES.
//
// It used to. `scheduleCoverCache` fetched every resolved cover a SECOND time and stored it at a
// global `covers/{isbn}.jpg` — keyed by edition rather than by reader, in a public bucket — then
// patched the cache row to point at it, so the next book to hit that key adopted the shared object
// and skipped the client's ingest entirely. Measured before removal: it produced 3% of covers and
// 100% of the degraded rows (no thumb, no colour, because only the ingest sets those).
//
// It also carried three problems the covers function does not:
//   · no host check, while PRECEDENCE.cover puts `google` SECOND — so Google bytes, which
//     docs/reverie-metadata-sourcing.md permits only as hotlinks, reached our bucket;
//   · no magic-byte sniff, no MIN_COVER_EDGE_PX floor, no size cap, no normalization;
//   · once stored, the cover carried OUR host, which defeats the host-matching audit that doc
//     built precisely because matching on the label alone closes the question wrongly.
//
// WHY A SOURCE-READING TEST. The enforcement is Deno and this repo has no Deno test runner
// (`deno` is installed neither locally nor in CI), so nothing can execute the function to prove a
// negative about it. The same constraint produced `sourcePace.test.ts`'s cross-file parity check.
// Reading the source is weaker than running it, but it is the difference between a rule that is
// checked and one that lives only in a commit message.

const enrichSrc = readFileSync(
  join(__dirname, '../../../supabase/functions/enrich/index.ts'),
  'utf8',
)

describe('the enrich function never persists cover bytes', () => {
  it('does not reference the covers Storage bucket at all', () => {
    // The covers Edge Function is the single gate for stored cover bytes — it sniffs magic bytes,
    // enforces the dimension floor, caps size, normalizes to webp and refuses Google by host.
    // Any Storage write from `enrich` is by definition a second path around all of that.
    expect(enrichSrc).not.toContain('storage/v1/object')
    expect(enrichSrc).not.toContain("bucket_id: 'covers'")
  })

  it('has no cover-caching helpers left to call', () => {
    for (const gone of ['cacheCover', 'scheduleCoverCache', 'coverKeyFor']) {
      expect(enrichSrc, `${gone} was removed with the global cover cache`).not.toContain(gone)
    }
  })

  it('exposes no cacheCover action, so nothing can ask it to store a cover', () => {
    expect(enrichSrc).not.toContain('cacheCover')
  })

  // The rewrite is the mechanism that made books adopt the shared object: scheduleCoverCache
  // PATCHed enrichment_cache.record.cover to the storage URL, and `isIngestibleCoverUrl` then
  // declined to re-ingest it because it already looked like ours.
  it('never PATCHes enrichment_cache after the fact', () => {
    expect(enrichSrc).not.toContain("method: 'PATCH'")
  })

  it('still writes the cache normally — this is a removal, not a lobotomy', () => {
    // Guards the test above from passing for the wrong reason (an empty or gutted file).
    expect(enrichSrc).toContain('async function writeCache')
    expect(enrichSrc).toContain('async function readCache')
    expect(enrichSrc).toContain('rest/v1/enrichment_cache')
  })
})

describe('the client has no way to ask for a stored cover from enrich', () => {
  const clientSrc = readFileSync(
    join(__dirname, '../../../apps/web/src/lib/enrich.ts'),
    'utf8',
  )

  it('cacheCoverUrl is gone — it had no callers even before the path was removed', () => {
    expect(clientSrc).not.toContain('cacheCoverUrl')
    expect(clientSrc).not.toContain('cacheCover')
  })
})
