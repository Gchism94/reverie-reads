import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  calls: [] as string[],
  enrich: vi.fn(),
  ingest: vi.fn(),
  rpc: vi.fn(),
  classify: vi.fn(),
}))

vi.mock('../lib/enrich', () => ({
  enrichBookOutcome: (...args: unknown[]) => {
    mocks.calls.push('enrich')
    return mocks.enrich(...args)
  },
}))

vi.mock('../lib/covers', () => ({
  ingestCorpusCover: (...args: unknown[]) => {
    mocks.calls.push('ingest')
    return mocks.ingest(...args)
  },
}))

vi.mock('../lib/seriesClassification', () => ({
  classifyEnrichedSeries: (...args: unknown[]) => mocks.classify(...args),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => {
      mocks.calls.push('rpc')
      return mocks.rpc(...args)
    },
  },
}))

import {
  bulkCompleteCorpus,
  corpusCoverRecoverySummary,
  recoverAdminHouseholdCorpusCovers,
  runCorpusCompletionPipeline,
  type CorpusEnrichmentWork,
} from './enrichCorpus'

const work = (cover: string): CorpusEnrichmentWork => ({
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Recovered Work',
  authorText: 'A Writer',
  contributors: [{ name: 'A Writer', role: 'author', position: 0 }],
  series: '',
  position: null,
  pages: null,
  publicationYear: null,
  publisher: '',
  language: '',
  description: '',
  isbns: [],
  genre: '',
  genres: [],
  cover,
  enrichedAt: null,
  seriesCheckState: 'unknown',
  seriesCheckedAt: null,
})

const workAt = (index: number): CorpusEnrichmentWork => ({
  ...work(''),
  id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  title: `Recovered Work ${index}`,
})

beforeEach(() => {
  mocks.calls.length = 0
  mocks.enrich.mockReset()
  mocks.ingest.mockReset()
  mocks.rpc.mockReset()
  mocks.classify.mockReset()
})

describe('corpus cover recovery', () => {
  it('normalizes the owner-scoped recovery result', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        scanned: 12,
        failed: 1,
        recoveredCovers: 7,
        recoveredOptions: 9,
        maybeMore: true,
        errorMessage: 'one source was invalid',
      },
      error: null,
    })

    await expect(recoverAdminHouseholdCorpusCovers()).resolves.toEqual({
      scanned: 12,
      failed: 1,
      failedBatches: 0,
      recoveredCovers: 7,
      recoveredOptions: 9,
      maybeMore: true,
      errorMessage: 'one source was invalid',
    })
    expect(mocks.rpc).toHaveBeenCalledWith('admin_recover_corpus_cover_batch', { p_limit: 25 })
  })

  it('reports published alternatives even when the corpus already had a default cover', () => {
    expect(
      corpusCoverRecoverySummary({
        scanned: 3,
        failed: 0,
        failedBatches: 0,
        recoveredCovers: 0,
        recoveredOptions: 2,
        maybeMore: false,
      }),
    ).toBe(' · checked 3 local cover sources · published 2 household cover options')
    expect(
      corpusCoverRecoverySummary({
        scanned: 3,
        failed: 0,
        failedBatches: 0,
        recoveredCovers: 1,
        recoveredOptions: 1,
        maybeMore: false,
      }),
    ).toBe(
      ' · checked 3 local cover sources · filled 1 missing corpus cover · published 1 household cover option',
    )
  })

  it('relocates the exact current cover before a failed metadata lookup', async () => {
    const personalCover =
      'https://project.test/storage/v1/object/public/covers/u/reader/book/rev1.webp'
    const corpusCover =
      'https://project.test/storage/v1/object/public/covers/w/11111111-1111-4111-8111-111111111111/rev2.webp'
    mocks.ingest.mockResolvedValue({
      status: 'ok',
      data: { cover: corpusCover, thumb: '', sourceUrl: personalCover, color: '#123456' },
    })
    mocks.rpc.mockResolvedValue({ data: null, error: null })
    mocks.enrich.mockResolvedValue({ status: 'failed', reason: 'provider unavailable' })

    const result = await bulkCompleteCorpus([work(personalCover)], () => undefined, () => false)

    expect(mocks.calls).toEqual(['ingest', 'rpc', 'enrich'])
    expect(mocks.rpc).toHaveBeenCalledWith('complete_corpus_work_metadata', {
      p_work: '11111111-1111-4111-8111-111111111111',
      p_patch: {
        coverUrl: corpusCover,
        coverSource: 'url',
        coverSourceUrl: personalCover,
        coverColor: '#123456',
      },
      p_checked_at: null,
    })
    expect(result).toMatchObject({ failed: 1, stopReason: 'done' })
  })

  it('routes series evidence through its review-aware RPC instead of the generic patch', async () => {
    mocks.enrich.mockResolvedValue({
      status: 'ok',
      data: {
        title: 'Recovered Work',
        authors: ['A Writer'],
        author: 'A Writer',
        series: 'Recovered Saga',
        seriesPosition: 2,
        publisher: '',
        pubY: null,
        pubM: null,
        pubD: null,
        pageCount: null,
        isbn10: '',
        isbn13: '',
        isbn: '',
        language: '',
        genres: [],
        description: '',
        cover: '',
        workId: 'hc-work-1',
        source: 'hardcover',
        confidence: 'high',
        provenance: {
          series: { source: 'hardcover', at: '2026-09-11T00:00:00Z' },
        },
      },
    })
    mocks.rpc.mockImplementation(async (name: string) => ({
      data: name === 'record_corpus_series_discovery' ? { outcome: 'applied' } : null,
      error: null,
    }))
    mocks.classify.mockResolvedValue({
      outcome: 'found',
      matched: true,
      series: 'Recovered Saga',
      position: 2,
      count: 3,
      identityConfidence: 'high',
      membershipConfidence: 'high',
      source: 'hardcover',
      sourceRef: 'hc-series-1',
      reason: 'Relational membership matched.',
      evidence: [
        {
          source: 'hardcover',
          kind: 'relational_membership',
          sourceRef: 'hc-series-1',
          series: 'Recovered Saga',
          position: 2,
          memberCount: 3,
        },
      ],
    })

    const result = await bulkCompleteCorpus([work('')], () => undefined, () => false)

    expect(mocks.rpc).toHaveBeenNthCalledWith(
      1,
      'complete_corpus_work_metadata',
      expect.objectContaining({
        p_work: '11111111-1111-4111-8111-111111111111',
        p_patch: expect.not.objectContaining({ series: expect.anything() }),
      }),
    )
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      2,
      'record_corpus_series_discovery',
      expect.objectContaining({
        p_work: '11111111-1111-4111-8111-111111111111',
        p_result: {
          outcome: 'found',
          matched: true,
          series: 'Recovered Saga',
          position: 2,
          count: 3,
          identityConfidence: 'high',
          membershipConfidence: 'high',
          source: 'hardcover',
          sourceRef: 'hc-series-1',
          reason: 'Relational membership matched.',
          evidence: [
            {
              source: 'hardcover',
              kind: 'relational_membership',
              sourceRef: 'hc-series-1',
              series: 'Recovered Saga',
              position: 2,
              memberCount: 3,
            },
          ],
        },
      }),
    )
    expect(result).toMatchObject({ scanned: 1, filled: 1, stopReason: 'done' })
  })

  it('counts a confirmed corpus series replay as a filled reconciliation', async () => {
    mocks.enrich.mockResolvedValue({
      status: 'ok',
      data: {
        title: 'Recovered Work',
        authors: [],
        author: 'A Writer',
        series: 'Recovered Saga',
        seriesPosition: 2,
        publisher: '',
        pubY: null,
        pubM: null,
        pubD: null,
        pageCount: null,
        isbn10: '',
        isbn13: '',
        isbn: '',
        language: '',
        genres: [],
        description: '',
        cover: '',
        source: 'hardcover',
      },
    })
    mocks.classify.mockResolvedValue({
      matched: true,
      identityConfidence: 'high',
      membershipConfidence: 'high',
      source: 'hardcover',
      series: 'Recovered Saga',
      position: 2,
      evidence: [
        {
          source: 'hardcover',
          kind: 'relational_membership',
          series: 'Recovered Saga',
          position: 2,
        },
      ],
    })
    mocks.rpc.mockImplementation(async (name: string) => ({
      data: name === 'record_corpus_series_discovery' ? { outcome: 'confirmed' } : null,
      error: null,
    }))

    const result = await bulkCompleteCorpus(
      [{ ...work(''), series: 'Recovered Saga', position: 2 }],
      () => undefined,
      () => false,
    )

    expect(result).toMatchObject({ scanned: 1, filled: 1, nothing: 0, stopReason: 'done' })
  })

  it('still runs one bounded recovery batch when no metadata candidates are waiting', async () => {
    const order: string[] = []
    const progress = vi.fn()
    const complete = vi.fn()

    const outcome = await runCorpusCompletionPipeline(progress, () => false, {
      recover: async () => {
        order.push('recover')
        return {
          scanned: 3,
          failed: 0,
          failedBatches: 0,
          recoveredCovers: 0,
          recoveredOptions: 2,
          maybeMore: false,
        }
      },
      fetchCandidates: async () => {
        order.push('fetch')
        return []
      },
      refreshCandidates: vi.fn(),
      complete,
    })

    expect(order).toEqual(['fetch', 'recover'])
    expect(complete).not.toHaveBeenCalled()
    expect(progress).toHaveBeenCalledWith({
      scanned: 0,
      total: 0,
      filled: 0,
      recoveryScanned: 0,
      phase: 'recovering',
    })
    expect(outcome.recovery).toMatchObject({
      scanned: 3,
      recoveredCovers: 0,
      recoveredOptions: 2,
      maybeMore: false,
    })
  })

  it('interleaves cover recovery and refreshed classification in groups of 25', async () => {
    const order: string[] = []
    const candidates = Array.from({ length: 26 }, (_, index) => workAt(index + 1))
    const recoveryResults = [
      {
        scanned: 25,
        failed: 0,
        failedBatches: 0,
        recoveredCovers: 4,
        recoveredOptions: 6,
        maybeMore: true,
      },
      {
        scanned: 2,
        failed: 0,
        failedBatches: 0,
        recoveredCovers: 1,
        recoveredOptions: 1,
        maybeMore: false,
      },
    ]
    const progress = vi.fn()
    const complete = vi.fn(async (batch, onProgress) => {
      order.push(`complete:${batch.length}`)
      onProgress({
        scanned: batch.length,
        total: batch.length,
        filled: batch.length,
        recoveryScanned: 0,
        phase: 'classifying',
      })
      return {
        scanned: batch.length,
        total: batch.length,
        filled: batch.length,
        failed: 0,
        nothing: 0,
        stopReason: 'done' as const,
        recoveryScanned: 0,
        phase: 'classifying' as const,
      }
    })

    const outcome = await runCorpusCompletionPipeline(progress, () => false, {
      recover: async () => {
        order.push('recover')
        return recoveryResults.shift()!
      },
      fetchCandidates: async () => {
        order.push('fetch')
        return candidates
      },
      refreshCandidates: async (ids) => {
        order.push(`refresh:${ids.length}`)
        return ids.map((id) => ({ ...candidates.find((candidate) => candidate.id === id)! }))
      },
      complete,
    })

    expect(order).toEqual([
      'fetch',
      'recover',
      'refresh:25',
      'complete:25',
      'recover',
      'refresh:1',
      'complete:1',
    ])
    expect(outcome.result).toMatchObject({ scanned: 26, total: 26, filled: 26 })
    expect(outcome.recovery).toMatchObject({
      scanned: 27,
      recoveredCovers: 5,
      recoveredOptions: 7,
      maybeMore: false,
    })
    expect(progress).toHaveBeenCalledWith({
      scanned: 25,
      total: 26,
      filled: 25,
      recoveryScanned: 25,
      phase: 'recovering',
    })
  })

  it('continues classification when a recovery batch is unavailable', async () => {
    const candidate = workAt(1)
    const complete = vi.fn(async (batch, onProgress) => {
      expect(batch).toEqual([candidate])
      onProgress({
        scanned: 1,
        total: 1,
        filled: 0,
        recoveryScanned: 0,
        phase: 'classifying',
      })
      return {
        scanned: 1,
        total: 1,
        filled: 0,
        failed: 0,
        nothing: 1,
        stopReason: 'done' as const,
        recoveryScanned: 0,
        phase: 'classifying' as const,
      }
    })

    const outcome = await runCorpusCompletionPipeline(vi.fn(), () => false, {
      recover: async () => {
        throw new Error('canceling statement due to statement timeout')
      },
      fetchCandidates: async () => [candidate],
      refreshCandidates: async () => [candidate],
      complete,
    })

    expect(complete).toHaveBeenCalledOnce()
    expect(outcome.result).toMatchObject({ scanned: 1, stopReason: 'done' })
    expect(outcome.recovery).toMatchObject({
      failedBatches: 1,
      maybeMore: true,
      errorMessage: 'canceling statement due to statement timeout',
    })
  })
})
