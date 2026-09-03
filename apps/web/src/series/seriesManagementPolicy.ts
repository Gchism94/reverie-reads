import { SERIES_LIFECYCLE_STATUS_VALUES, type SeriesStatus } from '@reverie/core'

interface MergeEligibilityRow {
  liveEntries: number
  unreviewedEntries: number
  series: { status: SeriesStatus | null }
}

/** A merge target must represent a live, confirmed series. Work-level standalone classifications,
 * tombstone-only records, and unresolved historical guesses stay out of destructive choices. */
export const isSeriesMergeEligible = (row: MergeEligibilityRow): boolean =>
  row.liveEntries > 0 &&
  row.unreviewedEntries === 0 &&
  (!row.series.status || SERIES_LIFECYCLE_STATUS_VALUES.includes(row.series.status))
