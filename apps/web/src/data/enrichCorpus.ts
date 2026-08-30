import {
  isGoogleContentCover,
  isIngestibleCoverUrl,
  type Contributor,
  type CoverSource,
} from '@reverie/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { enrichBookOutcome, type EnrichResult } from '../lib/enrich'
import { ingestCorpusCover } from '../lib/covers'
import { supabase } from '../lib/supabase'
import { pageAll } from './paging'

const MAX_PER_RUN = 400
const FAILURE_STREAK_LIMIT = 5
const COMPLETE_RECHECK_DAYS = 30
const PARTIAL_RETRY_DAYS = 3
const DAY = 86_400_000

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
}

interface CorpusEnrichmentRow {
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
}

const toWork = (row: CorpusEnrichmentRow): CorpusEnrichmentWork => ({
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
})

/** Objective gaps the aggregator can actually fill. A missing series is not itself a gap: most
 * books are standalones, and enrichment must not manufacture series membership from absence. */
export function corpusWorkIsIncomplete(work: CorpusEnrichmentWork): boolean {
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

/** Google is display-only by policy. Every other shared cover must be a corpus-owned object; a
 * personal `u/` object remains reader-deletable and an upstream hotlink remains source-deletable. */
export function corpusCoverNeedsDurableOwnership(url: string): boolean {
  if (!url) return false
  if (/\/storage\/v1\/object\/public\/covers\/w\//i.test(url)) return false
  if (isGoogleContentCover(url)) return false
  return true
}

const corpusWorkHasHighValue = (work: CorpusEnrichmentWork): boolean =>
  !!work.cover && !corpusCoverNeedsDurableOwnership(work.cover) && work.isbns.length > 0

export function corpusWorkShouldCheck(work: CorpusEnrichmentWork, now = Date.now()): boolean {
  if (!corpusWorkIsIncomplete(work)) return false
  if (!work.enrichedAt) return true
  const days = corpusWorkHasHighValue(work) ? COMPLETE_RECHECK_DAYS : PARTIAL_RETRY_DAYS
  return Date.parse(work.enrichedAt) < now - days * DAY
}

export async function fetchCorpusAdminStatus(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_corpus_admin')
  if (error) throw error
  return data === true
}

export const corpusAdminKey = ['corpus-admin'] as const
export const corpusEnrichmentCandidatesKey = ['corpus-enrichment-candidates'] as const
export const personalCoverCorpusReviewKey = (
  bookId: string,
  workId: string,
  coverUrl: string,
) => ['personal-cover-corpus-review', bookId, workId, coverUrl] as const

export function personalCoverIsReviewed(options: unknown, coverUrl: string): boolean {
  return (
    !!coverUrl &&
    Array.isArray(options) &&
    options.some(
      (option) =>
        !!option &&
        typeof option === 'object' &&
        (option as { url?: unknown }).url === coverUrl,
    )
  )
}

export function useCorpusAdminStatus() {
  return useQuery({ queryKey: corpusAdminKey, queryFn: fetchCorpusAdminStatus, staleTime: 60_000 })
}

/** A personal cover is reviewed only when its exact URL is already an accepted corpus option. */
export function usePersonalCoverCorpusReview({
  bookId,
  workId,
  coverUrl,
  enabled,
}: {
  bookId: string
  workId: string
  coverUrl: string
  enabled: boolean
}) {
  return useQuery({
    queryKey: personalCoverCorpusReviewKey(bookId, workId, coverUrl),
    enabled: enabled && !!bookId && !!workId && !!coverUrl,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from('works')
        .select('cover_options')
        .eq('id', workId)
        .single()
      if (error) throw error
      const options = (data as { cover_options?: unknown }).cover_options
      return personalCoverIsReviewed(options, coverUrl)
    },
  })
}

export function useAdminReviewPersonalCoverForCorpus() {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { action: 'Reviewing a personal cover for the corpus' },
    mutationFn: async ({
      bookId,
      workId,
      coverUrl,
    }: {
      bookId: string
      workId: string
      coverUrl: string
    }): Promise<string> => {
      const { data, error } = await supabase.rpc('admin_review_personal_cover_for_corpus', {
        p_book: bookId,
        p_expected_work: workId,
        p_expected_cover_url: coverUrl,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['personal-cover-corpus-review'] }),
        queryClient.invalidateQueries({ queryKey: ['household'] }),
        queryClient.invalidateQueries({ queryKey: ['works-browse'] }),
        queryClient.invalidateQueries({ queryKey: ['works-lookup'] }),
        queryClient.invalidateQueries({ queryKey: ['works-lookup-isbns'] }),
        queryClient.invalidateQueries({ queryKey: corpusEnrichmentCandidatesKey }),
      ])
    },
  })
}

export function useAdminAddCorpusWorkTrope() {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { action: 'Adding a shared corpus trope' },
    mutationFn: async ({ workId, name }: { workId: string; name: string }): Promise<string> => {
      const { data, error } = await supabase.rpc('admin_add_corpus_work_trope', {
        p_work: workId,
        p_name: name,
        p_facet: 'vibe',
      })
      if (error) throw error
      return data as string
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['household'] }),
        queryClient.invalidateQueries({ queryKey: ['tropes'] }),
        queryClient.invalidateQueries({ queryKey: ['works'] }),
      ])
    },
  })
}

export async function fetchCorpusEnrichmentCandidates(): Promise<CorpusEnrichmentWork[]> {
  const rows = await pageAll<CorpusEnrichmentRow>('corpus enrichment candidates', (from, to) =>
    supabase
      .from('works')
      .select(
        'id, title, author_text, contributors, series, position, pages, pub_y, publisher, language, description, isbns, genre, genres, cover_url, enriched_at',
        { count: 'exact' },
      )
      .order('id')
      .range(from, to),
  )
  return rows.map(toWork).filter((work) => corpusWorkShouldCheck(work))
}

export function useCorpusEnrichmentCandidates(enabled: boolean) {
  return useQuery({
    queryKey: corpusEnrichmentCandidatesKey,
    enabled,
    queryFn: fetchCorpusEnrichmentCandidates,
    staleTime: 30_000,
  })
}

const coverSourceOf = (result: EnrichResult): CoverSource => {
  const source = result.provenance?.cover?.source
  return source === 'openlibrary' || source === 'hardcover' || source === 'google'
    ? source
    : 'url'
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

/** Preserve every objective field returned by enrichment; the RPC remains the authoritative
 * fill-only merge and ignores values where the corpus already has curated data. */
export function corpusPatchFromEnrichment(result: EnrichResult): CorpusMetadataPatch {
  const authors = (result.authors ?? []).map((name) => name.trim()).filter(Boolean)
  const isbns = [
    ...(result.isbns ?? []),
    result.isbn13,
    result.isbn,
    result.isbn10,
  ].filter(Boolean)
  return {
    ...(authors.length
      ? {
          contributors: authors.map((name, position) => ({ name, role: 'author', position })),
          authorText: authors.join(', '),
        }
      : {}),
    ...(result.series ? { series: result.series } : {}),
    ...(result.seriesPosition !== null ? { position: result.seriesPosition } : {}),
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

export interface CorpusBulkProgress {
  scanned: number
  total: number
  filled: number
}

export type CorpusBulkStopReason = 'done' | 'user' | 'rate_limited' | 'limit' | 'error'

export interface CorpusBulkResult extends CorpusBulkProgress {
  failed: number
  nothing: number
  stopReason: CorpusBulkStopReason
  errorMessage?: string
}

export interface CorpusCoverRecoveryResult {
  scanned: number
  recoveredCovers: number
  recoveredOptions: number
}

export function corpusCoverRecoverySummary(recovery: CorpusCoverRecoveryResult): string {
  const parts: string[] = []
  if (recovery.recoveredCovers) {
    parts.push(
      `filled ${recovery.recoveredCovers} missing corpus cover${recovery.recoveredCovers === 1 ? '' : 's'}`,
    )
  }
  if (recovery.recoveredOptions) {
    parts.push(
      `published ${recovery.recoveredOptions} personal cover option${recovery.recoveredOptions === 1 ? '' : 's'}`,
    )
  }
  return parts.length ? ` · ${parts.join(' · ')}` : ''
}

/** Preserve this administrator's exact selected personal covers before asking external sources for
 * alternatives. The RPC is owner-scoped even for administrators and validates every stored object
 * against the authenticated project's issuer. */
export async function recoverAdminPersonalCorpusCovers(): Promise<CorpusCoverRecoveryResult> {
  const { data, error } = await supabase.rpc('admin_recover_personal_corpus_covers')
  if (error) throw error
  const result = (data ?? {}) as Partial<CorpusCoverRecoveryResult>
  return {
    scanned: Number(result.scanned ?? 0),
    recoveredCovers: Number(result.recoveredCovers ?? 0),
    recoveredOptions: Number(result.recoveredOptions ?? 0),
  }
}

const writeCorpusPatch = async (
  workId: string,
  patch: CorpusMetadataPatch,
  checkedAt: string | null,
): Promise<void> => {
  const { error } = await supabase.rpc('complete_corpus_work_metadata', {
    p_work: workId,
    p_patch: patch,
    p_checked_at: checkedAt,
  })
  if (error) throw error
}

export async function bulkCompleteCorpus(
  candidates: readonly CorpusEnrichmentWork[],
  onProgress: (progress: CorpusBulkProgress) => void,
  shouldStop: () => boolean,
): Promise<CorpusBulkResult> {
  const total = candidates.length
  let scanned = 0
  let filled = 0
  let failed = 0
  let nothing = 0
  let consecutiveFailures = 0
  let stopReason: CorpusBulkStopReason = 'done'
  let errorMessage: string | undefined
  onProgress({ scanned, total, filled })

  for (const work of candidates) {
    if (shouldStop()) {
      stopReason = 'user'
      break
    }
    if (scanned >= MAX_PER_RUN) {
      stopReason = 'limit'
      break
    }

    // Rescue the exact established artwork before any provider lookup. A temporary provider
    // failure must not strand a reader-owned u/ object or upstream hotlink in the shared corpus.
    // Null checked_at keeps this work eligible for its still-needed metadata check.
    let relocatedCover = false
    if (corpusCoverNeedsDurableOwnership(work.cover)) {
      const ingest = await ingestCorpusCover({
        workId: work.id,
        source: 'url',
        url: work.cover,
        sourceUrl: work.cover,
      })
      if (ingest.status === 'ok') {
        const coverPatch: CorpusMetadataPatch = {
          coverUrl: ingest.data.cover,
          coverSource: 'url',
          coverSourceUrl: work.cover,
          ...(ingest.data.color ? { coverColor: ingest.data.color } : {}),
        }
        try {
          await writeCorpusPatch(work.id, coverPatch, null)
          relocatedCover = true
        } catch (error) {
          stopReason = 'error'
          errorMessage = error instanceof Error ? error.message : String(error)
          break
        }
      }
    }

    const outcome = await enrichBookOutcome({
      title: work.title,
      author: work.authorText,
      isbn: work.isbns[0],
    })
    if (outcome.status === 'rate_limited') {
      stopReason = 'rate_limited'
      break
    }
    if (outcome.status === 'failed') {
      failed++
      consecutiveFailures++
      errorMessage ??= outcome.reason
      if (consecutiveFailures >= FAILURE_STREAK_LIMIT) {
        stopReason = 'error'
        break
      }
      continue
    }
    consecutiveFailures = 0
    const checkedAt = new Date().toISOString()
    let patch: CorpusMetadataPatch = {}
    if (outcome.status === 'ok') {
      patch = corpusPatchFromEnrichment(outcome.data)
      if (
        !relocatedCover &&
        outcome.data.cover &&
        (!work.cover || corpusCoverNeedsDurableOwnership(work.cover)) &&
        !patch.coverUrl
      ) {
        const source = coverSourceOf(outcome.data)
        if (isIngestibleCoverUrl(outcome.data.cover)) {
          const ingest = await ingestCorpusCover({
            workId: work.id,
            source,
            url: outcome.data.cover,
            sourceUrl: outcome.data.cover,
          })
          if (ingest.status === 'ok') {
            patch.coverUrl = ingest.data.cover
            patch.coverSource = source
            patch.coverSourceUrl = ingest.data.sourceUrl ?? outcome.data.cover
            if (ingest.data.color) patch.coverColor = ingest.data.color
          }
        } else if (source === 'google') {
          // Google permits display-time URLs but not durable byte storage. The admin RPC accepts
          // only the exact allowlisted Books image host for this exception.
          patch.coverUrl = outcome.data.cover
          patch.coverSource = 'google'
          patch.coverSourceUrl = outcome.data.cover
        }
      }
    }
    try {
      await writeCorpusPatch(work.id, patch, checkedAt)
    } catch (error) {
      stopReason = 'error'
      errorMessage = error instanceof Error ? error.message : String(error)
      break
    }
    if (relocatedCover || Object.keys(patch).length) filled++
    else nothing++
    scanned++
    onProgress({ scanned, total, filled })
  }
  return { scanned, total, filled, failed, nothing, stopReason, errorMessage }
}

export interface CorpusCompletionPipelineResult {
  recovery: CorpusCoverRecoveryResult
  result: CorpusBulkResult
}

interface CorpusCompletionPipelineDependencies {
  recover: () => Promise<CorpusCoverRecoveryResult>
  fetchCandidates: () => Promise<CorpusEnrichmentWork[]>
  complete: typeof bulkCompleteCorpus
}

/**
 * Recover the signed-in administrator's exact personal covers before deciding whether the shared
 * corpus has any ordinary enrichment work left. A zero-length metadata candidate list must not
 * suppress this owner-scoped recovery: accepted alternatives can still be missing from otherwise
 * complete works.
 */
export async function runCorpusCompletionPipeline(
  onProgress: (progress: CorpusBulkProgress) => void,
  shouldStop: () => boolean,
  dependencies: CorpusCompletionPipelineDependencies = {
    recover: recoverAdminPersonalCorpusCovers,
    fetchCandidates: fetchCorpusEnrichmentCandidates,
    complete: bulkCompleteCorpus,
  },
): Promise<CorpusCompletionPipelineResult> {
  const recovery = await dependencies.recover()
  const candidates = await dependencies.fetchCandidates()
  const result = await dependencies.complete(candidates, onProgress, shouldStop)
  return { recovery, result }
}
