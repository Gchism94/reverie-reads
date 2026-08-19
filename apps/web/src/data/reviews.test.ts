import { describe, expect, it, vi } from 'vitest'

/**
 * The truncation guard, asserted at the write path rather than a proxy: reviews.rating is a
 * cross-user SMALLINT, so a half star reaching useUpsertReview must fail LOUDLY before any
 * request is made — never reach Postgres to be silently rounded. The mock would resolve happily;
 * only the guard can refuse.
 */
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    from: vi.fn(() => ({ upsert: vi.fn().mockResolvedValue({ error: null }) })),
  },
}))

import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { useUpsertReview } from './reviews'
import { supabase } from '../lib/supabase'

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client: new QueryClient() }, children)

describe('useUpsertReview — the smallint truncation guard', () => {
  it('refuses a half-star rating loudly, issuing NO write', async () => {
    const { result } = renderHook(() => useUpsertReview('wk1'), { wrapper })
    result.current.mutate({ rating: 4.5, body: 'x', reviewerName: 'R' })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toMatch(/whole stars/)
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('accepts a whole-star rating and writes it', async () => {
    const { result } = renderHook(() => useUpsertReview('wk1'), { wrapper })
    result.current.mutate({ rating: 4, body: 'x', reviewerName: 'R' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(supabase.from).toHaveBeenCalledWith('reviews')
  })
})
