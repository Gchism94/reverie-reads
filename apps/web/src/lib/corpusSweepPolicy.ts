import { isGoogleContentCover, type Contributor, type CoverSource } from '@reverie/core'
import type { EnrichResult } from './enrich'

const COMPLETE_RECHECK_DAYS = 30
const PARTIAL_RETRY_DAYS = 3
const SERIES_UNRESOLVED_RECHECK_DAYS = 30
const SERIES_STABLE_RECHECK_DAYS = 180
const DAY = 86_400_000

export const CORPUS_SWEEP_MAX_WORKS = 400
export const CORPUS_SWEEP_COVER_BATCH_SIZE = 25

export interface CorpusEnrichmentWork {
  id: string
  title: string
  authorText: string
  contributors: Contributor[]
  series: string
  position: number | null
  pages: number | null
  publicationYear: number | null
  publisher: string
  language: string
  description: string
  isbns: string[]
  genre: string
  genres: string[]
  cover: string
  enrichedAt: string | null
  seriesCheckState: 'unknown' | 'unresolved' | 'no_series' | 'found' | 'review'
  seriesCheckedAt: string | null
}

export interface CorpusEnrichmentRow {
  id: string
  title: string
  author_text: string | null
  contributors: Contributor[] | null
  series: string | null
  position: number | string | null
  pages: number | null
  pub_y: number | null
  publisher: string | null
  language: string | null
  description: string | null
  isbns: string[] | null
  genre: string | null
  genres: string[] | null
  cover_url: string | null
  enriched_at: string | null
  series_check_state: CorpusEnrichmentWork['seriesCheckState']
  series_checked_at: string | null
}

export const corpusEnrichmentSelect =
  'id, title, author_text, contributors, series, position, pages, pub_y, publisher, language, description, isbns, genre, genres, cover_url, enriched_at, series_check_state, series_checked_at'

export const corpusWorkFromRow = (row: CorpusEnrichmentRow): CorpusEnrichmentWork => ({
  id: row.id,
  title: row.title,
  authorText: row.author_text?.trim() ?? '',
  contributors: row.contributors ?? [],
  series: row.series?.trim() ?? '',
  position: row.position === null ? null : Number(row.position),
  pages: row.pages,
  publicationYear: row.pub_y,
  publisher: row.publisher?.trim() ?? '',
  language: row.language?.trim() ?? '',
  description: row.description?.trim() ?? '',
  isbns: row.isbns ?? [],
  genre: row.genre?.trim() ?? '',
  genres: row.genres ?? [],
  cover: row.cover_url ?? '',
  enrichedAt: row.enriched_at,
  seriesCheckState: row.series_check_state,
  seriesCheckedAt: row.series_checked_at,
})

/** Google is display-only by policy. Every other shared cover must be a corpus-owned object. */
export function corpusCoverNeedsDurableOwnership(url: string): boolean {
  if (!url) return false
  if (/\/storage\/v1\/object\/public\/covers\/w\//i.test(url)) return false
  if (isGoogleContentCover(url)) return false
  return true
}

function corpusWorkHasMetadataGap(work: CorpusEnrichmentWork): boolean {
  return (
    !work.cover ||
    corpusCoverNeedsDurableOwnership(work.cover) ||
    !work.isbns.length ||
    !work.publicationYear ||
    !work.pages ||
    !work.genre ||
    !work.publisher ||
    !work.language ||
    !work.description ||
    !work.contributors.length ||
    (!!work.series && work.position === null)
  )
}

/** Series discovery has its own clock; a metadata check must never suppress it. */
export function corpusSeriesCheckDue(
  work: Pick<CorpusEnrichmentWork, 'seriesCheckState' | 'seriesCheckedAt'>,
  now = Date.now(),
): boolean {
  if (work.seriesCheckState === 'review') return false
  if (!work.seriesCheckedAt || work.seriesCheckState === 'unknown') return true
  const days =
    work.seriesCheckState === 'unresolved'
      ? SERIES_UNRESOLVED_RECHECK_DAYS
      : SERIES_STABLE_RECHECK_DAYS
  return Date.parse(work.seriesCheckedAt) < now - days * DAY
}

export function corpusWorkIsIncomplete(work: CorpusEnrichmentWork, now = Date.now()): boolean {
  return corpusWorkHasMetadataGap(work) || corpusSeriesCheckDue(work, now)
}

const corpusWorkHasHighValue = (work: CorpusEnrichmentWork): boolean =>
  !!work.cover && !corpusCoverNeedsDurableOwnership(work.cover) && work.isbns.length > 0

export function corpusWorkShouldCheck(work: CorpusEnrichmentWork, now = Date.now()): boolean {
  if (corpusSeriesCheckDue(work, now)) return true
  if (!corpusWorkHasMetadataGap(work)) return false
  if (!work.enrichedAt) return true
  const days = corpusWorkHasHighValue(work) ? COMPLETE_RECHECK_DAYS : PARTIAL_RETRY_DAYS
  return Date.parse(work.enrichedAt) < now - days * DAY
}

/** Preserve the established per-run bound while retaining the full eligible count for honest
 * progress and the "run again" result. Input order is the durable processing order. */
export function corpusSweepCandidateSnapshot(
  rows: CorpusEnrichmentRow[],
  now = Date.now(),
): { total: number; workIds: string[] } {
  const candidates = rows.map(corpusWorkFromRow).filter((work) => corpusWorkShouldCheck(work, now))
  return {
    total: candidates.length,
    workIds: candidates.slice(0, CORPUS_SWEEP_MAX_WORKS).map(({ id }) => id),
  }
}

export interface CorpusMetadataPatch {
  contributors?: Contributor[]
  authorText?: string
  series?: string
  position?: number
  pages?: number
  pubY?: number
  pubM?: number
  pubD?: number
  publisher?: string
  language?: string
  description?: string
  isbns?: string[]
  genre?: string
  genres?: string[]
  coverUrl?: string
  coverSource?: CoverSource
  coverSourceUrl?: string
  coverColor?: string
  externalWorkId?: string
  editionId?: string
  provenance?: EnrichResult['provenance']
  confidence?: EnrichResult['confidence']
}

/** Preserve provider fields; the database remains the authoritative fill-only merge. */
export function corpusPatchFromEnrichment(result: EnrichResult): CorpusMetadataPatch {
  const authors = (result.authors ?? []).map((name) => name.trim()).filter(Boolean)
  const isbns = [...(result.isbns ?? []), result.isbn13, result.isbn, result.isbn10].filter(Boolean)
  return {
    ...(authors.length
      ? {
          contributors: authors.map((name, position) => ({ name, role: 'author', position })),
          authorText: authors.join(', '),
        }
      : {}),
    // Series only crosses the separate positive-evidence/review boundary.
    ...(result.pageCount !== null ? { pages: result.pageCount } : {}),
    ...(result.pubY !== null ? { pubY: result.pubY } : {}),
    ...(result.pubM !== null ? { pubM: result.pubM } : {}),
    ...(result.pubD !== null ? { pubD: result.pubD } : {}),
    ...(result.publisher ? { publisher: result.publisher } : {}),
    ...(result.language ? { language: result.language } : {}),
    ...(result.description ? { description: result.description } : {}),
    ...(isbns.length ? { isbns } : {}),
    ...(result.genre ? { genre: result.genre } : {}),
    ...(result.genres?.length ? { genres: result.genres } : {}),
    ...(result.workId ? { externalWorkId: result.workId } : {}),
    ...(result.editionId ? { editionId: result.editionId } : {}),
    ...(result.provenance ? { provenance: result.provenance } : {}),
    ...(result.confidence ? { confidence: result.confidence } : {}),
  }
}

export const corpusCoverSourceOf = (result: EnrichResult): CoverSource => {
  const source = result.provenance?.cover?.source
  return source === 'openlibrary' || source === 'hardcover' || source === 'google' ? source : 'url'
}
