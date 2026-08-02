import { contributorsFromAuthors, enrichmentCoverFill, mergeImport, type Book, type CoverSource, type Incoming } from '@reverie/core'
import { supabase } from '../lib/supabase'
import { toBookRow } from './mappers'
import { enrichBookOutcome, type EnrichResult } from '../lib/enrich'
import { ingestCover } from '../lib/covers'
import { isIngestibleCoverUrl } from '@reverie/core'

// PACING LIVES SERVER-SIDE NOW — supabase/functions/_shared/sourcePace.ts. It used to be a 220ms
// sleep here, which was 4.5 req/sec under a comment quoting Open Library's 100-per-5-minutes (one
// per THREE seconds), and it only ever paced THIS loop: `importEnrich.ts` calls bulkComplete
// directly and anything can call the enrich function over HTTP. The gap is now on the far side of
// the network boundary, keyed per source, so every caller passes through it.
// Per-run ceiling: even one big library can't blow the daily Google quota in a single run.
const MAX_PER_RUN = 400
// A book with its high-value fields (cover + series position) is "complete" — recheck rarely.
const COMPLETE_RECHECK_DAYS = 30
// Still missing a high-value field after a check → retry sooner (sources update; a 429 may clear).
const PARTIAL_RETRY_DAYS = 3
const DAY = 86_400_000

/** A book worth enriching: missing a cover, ISBN, pub year, genres, or (for a series) position. */
export function isIncomplete(b: Book): boolean {
  if (!b.cover) return true
  if (!b.isbn) return true
  if (!b.pub?.y) return true
  if (!b.genres.length) return true
  if (b.status !== 'standalone' && (!b.series || b.position === '')) return true
  return false
}

/** The high-value fields that decide the recheck window — cover, and (for a series) its position. */
function hasHighValue(b: Book): boolean {
  return !!b.cover && (b.status === 'standalone' || (!!b.series && b.position !== ''))
}

/** Should we (re)check this book now? Unchecked → yes; otherwise depends on the completeness window. */
function shouldCheck(b: Book, enrichedAt: string | null): boolean {
  if (!enrichedAt) return true
  const window = hasHighValue(b) ? COMPLETE_RECHECK_DAYS : PARTIAL_RETRY_DAYS
  return Date.parse(enrichedAt) < Date.now() - window * DAY
}

/**
 * WHERE THE COVER ACTUALLY CAME FROM. This used to be hardcoded `'openlibrary'` on every ingest,
 * which was a lie whenever the merge took its cover from Hardcover — the stored row then claimed an
 * origin the image never had, and `resharpenSource` reads `coverSource` to decide what it may
 * re-fetch, so the lie propagates into a later sweep's decisions.
 *
 * `provenance` is per FIELD, so `provenance.cover.source` is the one true answer. The other two
 * enrich sources cannot appear here: `google` covers never reach ingest (`isIngestibleCoverUrl`
 * rejects the host before this is called) and `isbndb`/`manual` are not ingestible labels — so
 * anything unexpected falls back to `'url'`, which is honest ("a direct image URL") rather than
 * naming a source we did not hear it from.
 */
function coverOriginOf(e: EnrichResult): CoverSource {
  const s = e.provenance?.cover?.source
  return s === 'openlibrary' || s === 'hardcover' || s === 'google' ? s : 'url'
}

/** Map an enrichment record to an Incoming so mergeImport fills only the existing book's blanks.
 *  genre is the mapped primary genre (the C1 fill); mergeImport fills it only when blank, so the
 *  romance seed (genre='romance') is never overwritten. */
function toIncoming(e: EnrichResult, b: Book): Incoming {
  return {
    title: b.title,
    series: e.series,
    position: e.seriesPosition ?? '',
    isbn: e.isbn13 || e.isbn || e.isbn10 || '',
    // The non-overwrite rule: a user-chosen cover is never replaced (and never re-offered after the
    // reader clears it); otherwise fill-only, same as every other field mergeImport touches.
    cover: enrichmentCoverFill(b, e.cover),
    genre: e.genre || undefined,
    genres: e.genres,
    // Multi-author enrichment → contributor list (first author, rest co-authors); mergeImport
    // unions these into the existing book additively.
    contributors: e.authors?.length ? contributorsFromAuthors(e.authors) : undefined,
    pub: { y: e.pubY, m: e.pubM, d: e.pubD },
  }
}

export interface BulkProgress {
  scanned: number
  total: number
  filled: number
}

export interface BulkOptions {
  /** Request per-stage timings and persist one `sweep_traces` row per book. */
  trace?: boolean
  /** Cap this run below MAX_PER_RUN — a 10-book measurement run, not a full sweep. */
  limit?: number
  /** Group the run's rows. Generated when absent. */
  runId?: string
}

/** performance.now() where available (sub-ms, monotonic — immune to a clock step mid-sweep). */
const now = (): number =>
  typeof performance !== 'undefined' ? performance.now() : Date.now()

/**
 * Persist one trace row. Best-effort by construction: a failed insert is swallowed, because the
 * alternative is a measurement run that dies partway and destroys the data it already gathered.
 */
async function recordTrace(
  runId: string,
  b: Book,
  spans: { s: string; ms: number }[],
  totalMs: number,
  outcome: string,
  coverSource: string,
): Promise<void> {
  try {
    const { data: auth } = await supabase.auth.getUser()
    const ownerId = auth?.user?.id
    if (!ownerId) return
    await supabase.from('sweep_traces').insert({
      owner_id: ownerId,
      run_id: runId,
      book_id: b.id,
      book_title: b.title,
      spans,
      total_ms: Math.round(totalMs * 10) / 10,
      outcome,
      cover_source: coverSource,
    })
  } catch {
    /* never let instrumentation break the sweep */
  }
}

export type BulkStopReason = 'done' | 'user' | 'rate_limited' | 'limit'

export interface BulkResult {
  total: number
  scanned: number
  filled: number
  nothing: number
  stopReason: BulkStopReason
}

/**
 * Fill missing covers/info across the library, fill-only-missing (never clobbers). Throttled,
 * resumable, and negative-cached: every checked book is stamped enriched_at (found or not), and
 * reruns skip books inside their recheck window — 30 days when the high-value fields are present,
 * 3 days when something high-value is still missing (so dead-ends rest but near-misses retry).
 * Stops cleanly and resumably when the per-run ceiling is hit, the sources rate-limit, or the
 * user cancels — the unprocessed books keep their old stamp and resume next run.
 */
export async function bulkComplete(
  books: Book[],
  onProgress: (p: BulkProgress) => void,
  shouldStop: () => boolean,
  opts?: BulkOptions,
): Promise<BulkResult> {
  const runId = opts?.runId ?? crypto.randomUUID()
  const ceiling = Math.min(opts?.limit ?? MAX_PER_RUN, MAX_PER_RUN)
  const { data: rows, error } = await supabase.from('books').select('id, enriched_at')
  if (error) throw error
  const stampById = new Map(
    ((rows as { id: string; enriched_at: string | null }[]) ?? []).map((r) => [r.id, r.enriched_at]),
  )

  const candidates = books.filter((b) => isIncomplete(b) && shouldCheck(b, stampById.get(b.id) ?? null))
  const total = candidates.length
  let scanned = 0
  let filled = 0
  let nothing = 0
  let stopReason: BulkStopReason = 'done'

  for (const b of candidates) {
    if (shouldStop()) {
      stopReason = 'user'
      break
    }
    if (scanned >= ceiling) {
      stopReason = 'limit'
      break
    }
    const spans: { s: string; ms: number }[] = []
    const bookT0 = now()
    let coverSource = ''
    const t0 = now()
    const outcome = await enrichBookOutcome({
      title: b.title,
      author: [b.first, b.last].filter(Boolean).join(' '),
      isbn: b.isbn || undefined,
      trace: opts?.trace,
    })
    spans.push({ s: 'client.enrich', ms: now() - t0 })
    if (outcome.status !== 'rate_limited')
      for (const sp of outcome.trace?.spans ?? []) spans.push(sp)
    // Paused by upstream quota — stop WITHOUT stamping this book so it's retried next run.
    if (outcome.status === 'rate_limited') {
      stopReason = 'rate_limited'
      break
    }
    const checkedAt = new Date().toISOString()
    let didFill = false
    if (outcome.status === 'ok') {
      const { patch } = mergeImport(b, toIncoming(outcome.data, b))
      // Record confidence only when THIS run actually filled the cover — so a trusted user/seed cover
      // (which merge keeps) is never mislabeled by the enrichment match's confidence (E3 review signal).
      if (patch.cover && outcome.data.confidence) patch.coverConfidence = outcome.data.confidence

      // EAGER INGEST. `useCoverBackfill` moves a hotlinked cover into our Storage only when a reader
      // opens that book's detail page, so a swept library keeps hotlinks until each book is visited
      // one by one — and a library filled in bulk is exactly the one nobody browses book by book.
      // Doing it here means the sweep that found the cover is also the thing that makes it durable.
      //
      // `isIngestibleCoverUrl` is the gate, not the source label: Google covers stay hotlinks by
      // their terms, and a Google URL can arrive wearing any label. A failed ingest is NOT fatal —
      // the hotlink still renders and the lazy path retries on first view, so the sweep never loses
      // a cover it just found because Storage had a bad minute.
      if (patch.cover && isIngestibleCoverUrl(patch.cover)) {
        const origin = coverOriginOf(outcome.data)
        const t1 = now()
        const ing = await ingestCover({
          bookId: b.id,
          source: origin,
          url: patch.cover,
          trace: opts?.trace,
        })
        spans.push({ s: 'client.covers', ms: now() - t1 })
        if (ing.status === 'ok') {
          for (const sp of ing.data._trace?.spans ?? []) spans.push(sp)
          patch.cover = ing.data.cover
          patch.coverThumb = ing.data.thumb
          patch.coverSource = origin
          if (ing.data.color) patch.coverColor = ing.data.color
        }
        coverSource = origin
      }

      const t2 = now()
      const { error: ue } = await supabase
        .from('books')
        .update({ ...toBookRow(patch), enriched_at: checkedAt })
        .eq('id', b.id)
      spans.push({ s: 'client.update', ms: now() - t2 })
      if (ue) throw ue
      didFill = Object.keys(patch).length > 0
    } else {
      const t2 = now()
      const { error: ue } = await supabase.from('books').update({ enriched_at: checkedAt }).eq('id', b.id)
      spans.push({ s: 'client.update', ms: now() - t2 })
      if (ue) throw ue
    }
    if (didFill) filled++
    else nothing++
    scanned++
    // The trace row is written LAST and never throws: a measurement must not be able to fail the
    // thing it is measuring. `bookT0` spans the whole iteration, so `total_ms` includes the gaps
    // BETWEEN the timed stages — if the spans don't add up to it, the missing time is real and is
    // exactly what this exercise is looking for.
    if (opts?.trace)
      await recordTrace(runId, b, spans, now() - bookT0, outcome.status, coverSource)
    onProgress({ scanned, total, filled })
  }

  return { total, scanned, filled, nothing, stopReason }
}
