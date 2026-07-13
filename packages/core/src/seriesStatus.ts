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
]

/** Display copy for each status (stored values are snake_case; readers see these). */
export const SERIES_STATUS_LABELS: Record<SeriesStatus, string> = {
  standalone: 'Standalone',
  ongoing: 'Ongoing',
  completed: 'Completed',
  on_hiatus: 'On hiatus',
  cancelled: 'Cancelled',
}

/** Map any historical or imported spelling onto the five-value enum. The pre-expansion app
 *  stored 'Standalone' | 'Series' | 'Complete'; imports bring free text. Unknown values fall
 *  back on whether the book names a series at all. */
export function normalizeSeriesStatus(raw: string | null | undefined, hasSeries: boolean): SeriesStatus {
  const v = (raw ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (v === 'standalone' || v === 'standalones') return 'standalone'
  if (v === 'series' || v === 'ongoing' || v === 'in_progress') return 'ongoing'
  if (v === 'complete' || v === 'completed' || v === 'finished') return 'completed'
  if (v === 'on_hiatus' || v === 'hiatus' || v === 'paused') return 'on_hiatus'
  if (v === 'cancelled' || v === 'canceled') return 'cancelled'
  return hasSeries ? 'ongoing' : 'standalone'
}

/** The one-line series badge shared by the book page and the rail. */
export function seriesStatusBadge(b: Pick<Book, 'status' | 'seriesCount'>): string {
  switch (b.status) {
    case 'completed':
      return 'Series complete'
    case 'ongoing':
      return `Series${b.seriesCount ? ` of ${b.seriesCount}` : ' · length not set'}`
    case 'on_hiatus':
      return 'Series on hiatus'
    case 'cancelled':
      return 'Series cancelled'
    default:
      return 'Standalone'
  }
}
