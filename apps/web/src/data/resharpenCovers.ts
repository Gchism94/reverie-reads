import { isIngestibleCoverUrl, isStoredCoverUrl, isUpgradeableCoverUrl, upgradeCoverUrl, type Book, type CoverSource } from '@reverie/core'
import { supabase } from '../lib/supabase'
import { toBookRow } from './mappers'
import { ingestCover } from '../lib/covers'

// Cover re-sharpen sweep (docs Part 1). The stored-resolution fix (FULL_EDGE 1600 + Google zoom=0 at
// ingest) only helps covers ingested AFTER it ships; covers already stored at ~128px (a Google
// thumbnail that was backfilled before the fix) stay soft. This re-ingests them from the largest
// source available, so the stored asset becomes full-res. It also durably ingests never-stored
// hotlinks. Client display already upgrades hotlinked URLs on the fly — this is for the STORED cases.
//
// NEVER touches a user-chosen cover or a camera/upload (the reader's own image is sacred). Throttled
// to stay under the covers function's 60/min per-caller limit (image fetches don't hit the Hardcover
// API). Resumable + idempotent WITHOUT a migration: a re-ingested cover becomes a storage URL with an
// already-upgraded source URL, so it no longer matches the candidate filter on the next run.

const THROTTLE_MS = 1100 // ≥1/sec keeps us under COVERS_RATE_MAX (60/min)
const MAX_PER_RUN = 400

export interface ResharpenProgress {
  scanned: number
  /** `null` until the candidate count is known — see `sweepProgress.ts`. Never a placeholder zero. */
  total: number | null
  sharpened: number
}
export type ResharpenStopReason = 'done' | 'user' | 'limit'
export interface ResharpenResult {
  total: number
  scanned: number
  sharpened: number
  /** covers whose only source is a stored asset with no upgradeable origin — left as-is */
  skippedNoSource: number
  stopReason: ResharpenStopReason
}

/** The external URL to re-fetch for a book, or null when there's nothing higher-res to get. */
export function resharpenSource(b: Book): string | null {
  if (b.coverUserChosen) return null // the reader's chosen cover is sacred
  if (b.coverSource === 'camera' || b.coverSource === 'upload') return null // the reader's own image
  if (!b.cover) return null
  // Google is display-time only (docs/reference/reverie-metadata-sourcing.md §Covers) — re-sharpening one
  // would mean fetching and storing it, which is the very thing its terms forbid. A Google cover
  // stays a hotlink at whatever size it renders; the sweep leaves it alone.
  // A raw hotlink we can request larger (Open Library) — ingest it durably at full res.
  if (!isStoredCoverUrl(b.cover) && isUpgradeableCoverUrl(b.cover)) {
    return isIngestibleCoverUrl(b.cover) ? b.cover : null
  }
  // Already stored, but from an upgradeable origin (a backfilled ~128px thumbnail) — re-fetch bigger.
  if (isStoredCoverUrl(b.cover) && b.coverSourceUrl && isUpgradeableCoverUrl(b.coverSourceUrl)) {
    return isIngestibleCoverUrl(b.coverSourceUrl) ? b.coverSourceUrl : null
  }
  return null
}

/** Which cover source to record — the book's known source, else inferred from the URL. */
function sourceFor(b: Book, url: string): CoverSource {
  if (b.coverSource === 'google' || b.coverSource === 'openlibrary' || b.coverSource === 'url') return b.coverSource
  if (/books\.google|googleusercontent/i.test(url)) return 'google'
  if (/covers\.openlibrary\.org/i.test(url)) return 'openlibrary'
  return 'url'
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Re-ingest low-res / hotlinked covers at full resolution. Throttled, resumable, cancellable.
 * Returns counts + why it stopped. `onProgress` fires after every scanned book.
 */
export async function resharpenCovers(
  books: Book[],
  onProgress: (p: ResharpenProgress) => void,
  shouldStop: () => boolean,
): Promise<ResharpenResult> {
  const candidates = books.map((b) => ({ b, src: resharpenSource(b) })).filter((c): c is { b: Book; src: string } => !!c.src)
  const total = candidates.length
  let scanned = 0
  let sharpened = 0
  let stopReason: ResharpenStopReason = 'done'

  // Same as bulkComplete: the denominator is known here, so say it before the first ingest rather
  // than after it, or the caller has nothing but a placeholder to render.
  onProgress({ scanned: 0, total, sharpened: 0 })

  for (const { b, src } of candidates) {
    if (shouldStop()) {
      stopReason = 'user'
      break
    }
    if (scanned >= MAX_PER_RUN) {
      stopReason = 'limit'
      break
    }
    const url = upgradeCoverUrl(src, 'full')
    const outcome = await ingestCover({ bookId: b.id, source: sourceFor(b, url), url, sourceUrl: url })
    if (outcome.status === 'ok') {
      const d = outcome.data
      // Fill-only-safe: this never sets coverUserChosen, so the non-overwrite rule still holds — a
      // re-sharpen improves the stored pixels without claiming the reader chose this cover.
      const { error } = await supabase
        .from('books')
        .update(
          toBookRow({
            cover: d.cover,
            coverThumb: d.thumb,
            coverColor: d.color ?? undefined,
            coverSourceUrl: d.sourceUrl ?? url,
          }),
        )
        .eq('id', b.id)
      if (!error) sharpened++
    }
    scanned++
    onProgress({ scanned, total, sharpened })
    await sleep(THROTTLE_MS)
  }

  return { total, scanned, sharpened, skippedNoSource: books.length - total, stopReason }
}
