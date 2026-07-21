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
export function normalizeSeriesStatus(raw: string | null | undefined, hasSeries: boolean): SeriesStatus {
  const v = (raw ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
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
    case 'interconnected_standalone':
      return 'Interconnected standalone'
    case 'interconnected_series':
      return `Interconnected series${b.seriesCount ? ` of ${b.seriesCount}` : ''}`
    default:
      return 'Standalone'
  }
}
