import { mergeImport, type Book, type Incoming } from '@reverie/core'
import { supabase } from '../lib/supabase'
import { toBookRow } from './mappers'
import { enrichBook, type EnrichResult } from '../lib/enrich'

// Pace requests so a large run stays well under the source caps (Google ~1000/day, Open
// Library 100/IP/5min). The enrich Edge Function tries Google first and caches per ISBN/title,
// so repeats are cheap; this gap keeps the burst rate modest on a fresh library.
const THROTTLE_MS = 220
const RECHECK_AFTER_DAYS = 30

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** A book worth enriching: missing a cover, ISBN, pub year, genres, or (for a series) position. */
export function isIncomplete(b: Book): boolean {
  if (!b.cover) return true
  if (!b.isbn) return true
  if (!b.pub?.y) return true
  if (!b.genres.length) return true
  if (b.status !== 'Standalone' && (!b.series || b.position === '')) return true
  return false
}

/** Map an enrichment record to an Incoming so mergeImport fills only the existing book's blanks. */
function toIncoming(e: EnrichResult, b: Book): Incoming {
  return {
    title: b.title,
    series: e.series,
    position: e.seriesPosition ?? '',
    isbn: e.isbn13 || e.isbn || e.isbn10 || '',
    cover: e.cover,
    genres: e.genres,
    pub: { y: e.pubY, m: e.pubM, d: e.pubD },
  }
}

export interface BulkProgress {
  scanned: number
  total: number
  filled: number
}

export interface BulkResult {
  total: number
  scanned: number
  filled: number
  nothing: number
  stopped: boolean
}

/**
 * Fill missing covers/info across the library, fill-only-missing (never clobbers). Throttled,
 * resumable, and negative-cached: books checked within RECHECK_AFTER_DAYS are skipped, and every
 * checked book is stamped enriched_at (found or not) so a stopped run resumes and dead-ends
 * aren't retried. Stops early when `shouldStop()` returns true.
 */
export async function bulkComplete(
  books: Book[],
  onProgress: (p: BulkProgress) => void,
  shouldStop: () => boolean,
): Promise<BulkResult> {
  const { data: rows, error } = await supabase.from('books').select('id, enriched_at')
  if (error) throw error
  const cutoff = Date.now() - RECHECK_AFTER_DAYS * 86_400_000
  const recentlyChecked = new Set(
    ((rows as { id: string; enriched_at: string | null }[]) ?? [])
      .filter((r) => r.enriched_at && Date.parse(r.enriched_at) > cutoff)
      .map((r) => r.id),
  )

  const candidates = books.filter((b) => isIncomplete(b) && !recentlyChecked.has(b.id))
  const total = candidates.length
  let scanned = 0
  let filled = 0
  let nothing = 0
  let stopped = false

  for (const b of candidates) {
    if (shouldStop()) {
      stopped = true
      break
    }
    const enriched = await enrichBook({
      title: b.title,
      author: [b.first, b.last].filter(Boolean).join(' '),
      isbn: b.isbn || undefined,
    })
    const checkedAt = new Date().toISOString()
    let didFill = false
    if (enriched) {
      const { patch } = mergeImport(b, toIncoming(enriched, b))
      const { error: ue } = await supabase
        .from('books')
        .update({ ...toBookRow(patch), enriched_at: checkedAt })
        .eq('id', b.id)
      if (ue) throw ue
      didFill = Object.keys(patch).length > 0
    } else {
      const { error: ue } = await supabase.from('books').update({ enriched_at: checkedAt }).eq('id', b.id)
      if (ue) throw ue
    }
    if (didFill) filled++
    else nothing++
    scanned++
    onProgress({ scanned, total, filled })
    await sleep(THROTTLE_MS)
  }

  return { total, scanned, filled, nothing, stopped }
}
