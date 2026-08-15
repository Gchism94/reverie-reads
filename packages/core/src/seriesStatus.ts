import type { Book, SeriesStatus } from './types'

// The SERIES' publication status — is the series itself still being written? This is a fact
// about the series, never about the reader: "where am I in it" is derived from read states
// and lives with the series-experience surfaces, not here.

export const SERIES_STATUS_VALUES: readonly SeriesStatus[] = [
  'standalone',
  'ongoing',
  'completed',
  'on_hiatus',
  'cancelled',
  'interconnected_standalone',
  'interconnected_series',
]

/** Display copy for each status (stored values are snake_case; readers see these). */
export const SERIES_STATUS_LABELS: Record<SeriesStatus, string> = {
  standalone: 'Standalone',
  ongoing: 'Ongoing',
  completed: 'Completed',
  on_hiatus: 'On hiatus',
  cancelled: 'Cancelled',
  interconnected_standalone: 'Interconnected standalone',
  interconnected_series: 'Interconnected series',
}

/** Map any historical or imported spelling onto the enum. The pre-expansion app stored
 *  'Standalone' | 'Series' | 'Complete'; imports bring free text (incl. "interconnected standalone").
 *  Unknown values fall back on whether the book names a series at all. */
export function normalizeSeriesStatus(
  raw: string | null | undefined,
  hasSeries: boolean,
): SeriesStatus {
  const v = (raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  if (v === 'standalone' || v === 'standalones') return 'standalone'
  if (v === 'series' || v === 'ongoing' || v === 'in_progress') return 'ongoing'
  if (v === 'complete' || v === 'completed' || v === 'finished') return 'completed'
  if (v === 'on_hiatus' || v === 'hiatus' || v === 'paused') return 'on_hiatus'
  if (v === 'cancelled' || v === 'canceled') return 'cancelled'
  // Interconnected: each book stands alone in a shared world, vs. linked full series in one universe.
  // Import spellings vary — "interconnected standalone(s)", "interconnected world", "shared world".
  if (v === 'interconnected_series' || v === 'interconnected_universe' || v === 'connected_series')
    return 'interconnected_series'
  if (
    v === 'interconnected_standalone' ||
    v === 'interconnected_standalones' ||
    v === 'interconnected' ||
    v === 'interconnected_world' ||
    v === 'shared_world' ||
    v === 'companion' ||
    v === 'companion_series'
  )
    return 'interconnected_standalone'
  return hasSeries ? 'ongoing' : 'standalone'
}

/**
 * Statuses that ASSERT MEMBERSHIP in a series — the ones whose badge text claims this book belongs
 * to something, optionally with a length. `standalone` and `interconnected_standalone` do not: they
 * describe the book itself, and stay true for a book that names no series.
 */
const ASSERTS_SERIES_MEMBERSHIP: readonly Book['status'][] = [
  'ongoing',
  'completed',
  'on_hiatus',
  'cancelled',
  'interconnected_series',
]

/**
 * The one-line series badge shared by the book page and the rail.
 *
 * ── WHY THIS READS `series` AND NOT JUST `status` ───────────────────────────────────────────────
 * `status` and `series_count` SURVIVE a removal — neither `remove_series_entry` nor the two-write
 * path it replaced touches them, and whether removal should clear them is a product question the
 * owner deliberately deferred. So a book whose series was removed keeps `status: 'ongoing'` and
 * `series_count: 5`, and this function used to answer "Series of 5" for a book that is in no
 * series: a claim of membership contradicted by the row it was computed from.
 *
 * The fix is here rather than at either place it would be easier. NOT a render gate at the call
 * sites — that hides one symptom and leaves the other consumer (BookDetailRail) still claiming it,
 * and leaves the function itself still willing to produce the false answer. NOT
 * `normalizeSeriesStatus` forcing `standalone` whenever `series` is empty either — that would
 * rewrite `book.status` app-wide, changing filters and stats to fix a badge, and it would decide
 * the product question the owner parked.
 *
 * Membership-asserting statuses fall back to `Standalone` when the book names no series, which is
 * the same answer `normalizeSeriesStatus` already gives for an unrecognised status with no series.
 * `interconnected_standalone` is left alone: it describes the book, not a series it sits in.
 */
export function seriesStatusBadge(b: Pick<Book, 'status' | 'seriesCount' | 'series'>): string {
  if (!b.series?.trim() && ASSERTS_SERIES_MEMBERSHIP.includes(b.status)) return 'Standalone'
  switch (b.status) {
    case 'completed':
      return 'Series complete'
    case 'ongoing':
      return `Series${b.seriesCount ? ` of ${b.seriesCount}` : ' · length not set'}`
    case 'on_hiatus':
      return 'Series on hiatus'
    case 'cancelled':
      return 'Series cancelled'
    case 'interconnected_standalone':
      return 'Interconnected standalone'
    case 'interconnected_series':
      return `Interconnected series${b.seriesCount ? ` of ${b.seriesCount}` : ''}`
    default:
      return 'Standalone'
  }
}
