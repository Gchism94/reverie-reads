import type { SeriesClaim, SeriesClaimConfidence, SeriesClaimOrigin } from './types'

export const SERIES_CLAIM_ORIGINS = [
  'unknown',
  'reader',
  'import',
  'enrichment',
  'corpus',
] as const satisfies readonly SeriesClaimOrigin[]

const CONFIDENCE = [
  'high',
  'medium',
  'low',
  'none',
] as const satisfies readonly SeriesClaimConfidence[]

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined

/** Defensive database/backup boundary. A malformed or not-yet-migrated value becomes UNKNOWN,
 * never reader-confirmed or source-trusted. */
export function normalizeSeriesClaim(value: unknown): SeriesClaim {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { origin: 'unknown' }
  const row = value as Record<string, unknown>
  const origin = SERIES_CLAIM_ORIGINS.includes(row.origin as SeriesClaimOrigin)
    ? (row.origin as SeriesClaimOrigin)
    : 'unknown'
  const confidence = CONFIDENCE.includes(row.confidence as SeriesClaimConfidence)
    ? (row.confidence as SeriesClaimConfidence)
    : undefined
  return {
    origin,
    ...(text(row.source) ? { source: text(row.source) } : {}),
    ...(text(row.sourceRef) ? { sourceRef: text(row.sourceRef) } : {}),
    ...(confidence ? { confidence } : {}),
    ...(text(row.at) ? { at: text(row.at) } : {}),
  }
}

export function makeSeriesClaim(
  origin: Exclude<SeriesClaimOrigin, 'unknown'>,
  source: string,
  details: Omit<SeriesClaim, 'origin' | 'source'> = {},
): SeriesClaim {
  return normalizeSeriesClaim({ origin, source, ...details })
}
