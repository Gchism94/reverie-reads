import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocked = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('../lib/supabase', () => ({
  supabase: { rpc: mocked.rpc },
}))

import {
  corpusEnrichmentCandidatesKey,
  useAdminReviewPersonalCoverForCorpus,
} from './enrichCorpus'

const queryHarness = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

describe('personal-cover corpus review mutation', () => {
  beforeEach(() => mocked.rpc.mockReset())

  it('binds the gesture to the displayed work and URL and invalidates every real cover consumer', async () => {
    mocked.rpc.mockResolvedValue({ data: 'work-a', error: null })
    const { client, wrapper } = queryHarness()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const review = renderHook(() => useAdminReviewPersonalCoverForCorpus(), { wrapper })

    await act(() =>
      review.result.current.mutateAsync({
        bookId: 'book-a',
        workId: 'work-a',
        coverUrl: 'https://books.google.com/books/content?id=reviewed',
      }),
    )

    expect(mocked.rpc).toHaveBeenCalledWith('admin_review_personal_cover_for_corpus', {
      p_book: 'book-a',
      p_expected_work: 'work-a',
      p_expected_cover_url: 'https://books.google.com/books/content?id=reviewed',
    })
    expect(
      invalidate.mock.calls.flatMap(([input]) => (input?.queryKey ? [input.queryKey] : [])),
    ).toEqual(
      expect.arrayContaining([
        ['personal-cover-corpus-review'],
        ['household'],
        ['works-browse'],
        ['works-lookup'],
        ['works-lookup-isbns'],
        corpusEnrichmentCandidatesKey,
      ]),
    )
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['works'] })
  })
})
