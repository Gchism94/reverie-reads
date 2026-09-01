import type { Book } from '@reverie/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  bulkComplete: vi.fn(),
  bulkCompleteCorpus: vi.fn(),
  fetchCandidates: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('./enrichLibrary', () => ({
  bulkComplete: (...args: unknown[]) => mocks.bulkComplete(...args),
}))

vi.mock('./enrichCorpus', () => ({
  bulkCompleteCorpus: (...args: unknown[]) => mocks.bulkCompleteCorpus(...args),
  fetchCorpusEnrichmentCandidates: (...args: unknown[]) => mocks.fetchCandidates(...args),
}))

vi.mock('../lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mocks.rpc(...args) },
}))

import { enrichImported } from './importEnrich'
import { booksKey } from './books'

const books = [
  { id: 'book-imported', corpusWorkId: 'work-imported' },
  { id: 'book-other', corpusWorkId: 'work-other' },
] as Book[]

const queryClient = () => ({
  getQueryData: vi.fn(() => books),
  invalidateQueries: vi.fn().mockResolvedValue(undefined),
})

beforeEach(() => {
  mocks.bulkComplete.mockReset().mockResolvedValue(undefined)
  mocks.bulkCompleteCorpus.mockReset().mockResolvedValue(undefined)
  mocks.fetchCandidates.mockReset().mockResolvedValue([
    { id: 'work-imported' },
    { id: 'work-other' },
  ])
  mocks.rpc.mockReset()
})

describe('post-import series classification', () => {
  it('classifies only the imported corpus works for a corpus administrator', async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null })
    const qc = queryClient()

    await enrichImported(qc as never, ['book-imported'])

    expect(mocks.bulkComplete).toHaveBeenCalledWith(
      [books[0]],
      expect.any(Function),
      expect.any(Function),
    )
    expect(mocks.bulkCompleteCorpus).toHaveBeenCalledWith(
      [{ id: 'work-imported' }],
      expect.any(Function),
      expect.any(Function),
    )
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: booksKey })
  })

  it('does not let an ordinary reader write shared classification evidence', async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null })
    const qc = queryClient()

    await enrichImported(qc as never, ['book-imported'])

    expect(mocks.bulkComplete).toHaveBeenCalledOnce()
    expect(mocks.fetchCandidates).not.toHaveBeenCalled()
    expect(mocks.bulkCompleteCorpus).not.toHaveBeenCalled()
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: booksKey })
  })
})
