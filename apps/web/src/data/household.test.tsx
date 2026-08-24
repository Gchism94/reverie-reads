import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocked = vi.hoisted(() => ({
  readerId: 'reader-a',
  rpc: vi.fn(),
}))

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({
    session: mocked.readerId ? { user: { id: mocked.readerId } } : null,
  }),
}))

vi.mock('../lib/supabase', () => ({
  supabase: { rpc: mocked.rpc },
}))

import {
  householdBooksKey,
  householdRosterKey,
  useHouseholdBooks,
  useHouseholdRoster,
} from './household'

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    {children}
  </QueryClientProvider>
)

beforeEach(() => {
  mocked.readerId = 'reader-a'
  mocked.rpc.mockReset()
})

describe('household query identity and RPC boundary', () => {
  it('keys both responses to the signed-in reader', () => {
    expect(householdRosterKey('reader-a')).toEqual(['household', 'roster', 'reader-a'])
    expect(householdBooksKey('reader-b')).toEqual(['household', 'books', 'reader-b'])
  })

  it('reads the roster only through household_roster', async () => {
    mocked.rpc.mockResolvedValue({
      data: [
        {
          household_id: 'house-1',
          household_name: 'The Readers',
          user_id: 'reader-a',
          display_name: 'Avery',
          member_role: 'owner',
        },
      ],
      error: null,
    })

    const { result } = renderHook(() => useHouseholdRoster(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mocked.rpc).toHaveBeenCalledWith('household_roster')
    expect(result.current.data).toEqual([
      {
        householdId: 'house-1',
        householdName: 'The Readers',
        userId: 'reader-a',
        displayName: 'Avery',
        role: 'owner',
      },
    ])
  })

  it('keeps only the curated household_library_books fields in client state', async () => {
    mocked.rpc.mockResolvedValue({
      data: [
        {
          book_id: 'book-1',
          owner_id: 'reader-b',
          owner_name: 'Blake',
          title: 'Duplicate Title',
          author: 'Quill Marrowbane',
          cover_url: null,
          cover_thumb_url: null,
          cover_color: null,
          series_name: null,
          series_position: '2.5',
          series_count: null,
          series_status: 'ongoing',
          primary_genre: 'literary',
          genres: [],
          subgenre: null,
          subgenres: [],
          isbn: '9780000000001',
          ownership: 'owned',
          borrowed: true,
          wishlist: false,
          owned_physical: 'hardcover',
          owned_ebook: false,
          owned_audiobook: true,
          book_format: 'hardcover',
          pub_y: 2026,
          pub_m: null,
          pub_d: null,
          added_at: '2026-08-24T00:00:00Z',
          // Deliberately hostile extras: an RPC expansion must not become client state by accident.
          rating: 5,
          fave: true,
          read_status: 'Read',
          notes: 'private',
        },
      ],
      error: null,
    })

    const { result } = renderHook(() => useHouseholdBooks(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mocked.rpc).toHaveBeenCalledWith('household_library_books')
    expect(result.current.data?.[0]).toMatchObject({
      id: 'book-1',
      ownerId: 'reader-b',
      ownerName: 'Blake',
      position: 2.5,
      ownership: 'owned',
      borrowed: true,
      ownedPhysical: 'hardcover',
    })
    expect(result.current.data?.[0]).not.toHaveProperty('rating')
    expect(result.current.data?.[0]).not.toHaveProperty('fave')
    expect(result.current.data?.[0]).not.toHaveProperty('readStatus')
    expect(result.current.data?.[0]).not.toHaveProperty('notes')
  })

  it('fails closed without a readable signed-in reader', async () => {
    mocked.readerId = ''
    const { result } = renderHook(() => useHouseholdBooks(), { wrapper })
    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'))
    expect(mocked.rpc).not.toHaveBeenCalled()
  })
})
