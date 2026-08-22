import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * usePerformMerge's p_fields payload, asserted at the RPC boundary — the picker renders in
 * MergePreview, but what decides the merge is the row this hook sends. Two properties:
 *   · NO picks -> the payload is the engine's own row (the bulk-merge path in SettingsRoute
 *     passes none, so this is its regression guarantee)
 *   · a pick   -> exactly the picked field differs, carrying the OTHER book's value
 */
vi.mock('../lib/supabase', () => ({
  supabase: { rpc: vi.fn().mockResolvedValue({ error: null }) },
}))

import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { applyBookMergePicks, type Book } from '@reverie/core'
import { usePerformMerge } from './mergeBooks'
import { toBookRow } from './mappers'
import { supabase } from '../lib/supabase'

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client: new QueryClient() }, children)

const book = (partial: Partial<Book> & { id: string; title: string }): Book => ({
  first: '',
  last: '',
  contributors: [],
  series: '',
  position: '',
  seriesCount: null,
  status: 'standalone',
  genre: 'romance',
  subgenre: '',
  subgenres: [],
  genres: [],
  tags: [],
  tropes: [],
  moods: [],
  intensity: null,
  darkness: null,
  cover: '',
  pages: null,
  isbn: '',
  fave: false,
  ownership: 'unowned',
  borrowed: false,
  wishlist: false,
  owned: { physical: false, ebook: false, audiobook: false },
  format: '',
  rating: 0,
  readStatus: 'unset',
  source: '',
  pub: { y: null, m: null, d: null },
  reads: [],
  plan: { y: null, m: null, d: null },
  progress: 0,
  addedTs: 0,
  ...partial,
})

const primary = () => book({ id: 'p', title: 'Ember and Ash: A Novel', rating: 4.5 })
const loser = () => book({ id: 'l', title: 'Ember and Ash', rating: 5 })

const sentFields = () =>
  (vi.mocked(supabase.rpc).mock.calls.at(-1)?.[1] as { p_fields: Record<string, unknown> })
    .p_fields

beforeEach(() => vi.mocked(supabase.rpc).mockClear())

describe('usePerformMerge p_fields', () => {
  it('with no picks sends the engine row, verbatim', async () => {
    const { result } = renderHook(() => usePerformMerge(), { wrapper })
    result.current.mutate({ primary: primary(), loser: loser() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(supabase.rpc).toHaveBeenCalledWith('merge_books', {
      p_primary: 'p',
      p_loser: 'l',
      p_fields: toBookRow(applyBookMergePicks(primary(), loser())),
    })
    expect(sentFields().rating).toBe(4.5) // the engine keeps the primary's set rating
    expect(sentFields().title).toBe('Ember and Ash: A Novel')
  })

  it('an override sends the picked field with the OTHER value — everything else engine', async () => {
    const { result } = renderHook(() => usePerformMerge(), { wrapper })
    result.current.mutate({ primary: primary(), loser: loser(), picks: { rating: true } })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const fields = sentFields()
    expect(fields.rating).toBe(5) // the override
    expect(fields.title).toBe('Ember and Ash: A Novel') // untouched: engine (primary wins)
  })
})
