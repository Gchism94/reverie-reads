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
      data: { scanned: 12, recoveredCovers: 7, recoveredOptions: 9 },
      error: null,
    })

    await expect(recoverAdminHouseholdCorpusCovers()).resolves.toEqual({
      scanned: 12,
      recoveredCovers: 7,
      recoveredOptions: 9,
    })
    expect(mocks.rpc).toHaveBeenCalledWith('admin_recover_personal_corpus_covers')
  })

  it('reports published alternatives even when the corpus already had a default cover', () => {
    expect(
      corpusCoverRecoverySummary({ scanned: 3, recoveredCovers: 0, recoveredOptions: 2 }),
    ).toBe(' · published 2 household cover options')
    expect(
      corpusCoverRecoverySummary({ scanned: 3, recoveredCovers: 1, recoveredOptions: 1 }),
    ).toBe(' · filled 1 missing corpus cover · published 1 household cover option')
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

  it('runs owner-scoped recovery before completing an empty candidate set', async () => {
    const order: string[] = []
    const progress = vi.fn()
    const complete = vi.fn(async (candidates, onProgress) => {
      order.push('complete')
      expect(candidates).toEqual([])
      onProgress({ scanned: 0, total: 0, filled: 0 })
      return {
        scanned: 0,
        total: 0,
        filled: 0,
        failed: 0,
        nothing: 0,
        stopReason: 'done' as const,
      }
    })

    const outcome = await runCorpusCompletionPipeline(progress, () => false, {
      recover: async () => {
        order.push('recover')
        return { scanned: 3, recoveredCovers: 0, recoveredOptions: 2 }
      },
      fetchCandidates: async () => {
        order.push('fetch')
        return []
      },
      complete,
    })

    expect(order).toEqual(['recover', 'fetch', 'complete'])
    expect(progress).toHaveBeenCalledWith({ scanned: 0, total: 0, filled: 0 })
    expect(outcome.recovery).toEqual({ scanned: 3, recoveredCovers: 0, recoveredOptions: 2 })
  })
})
