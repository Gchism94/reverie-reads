import { act, renderHook, waitFor } from '@testing-library/react'
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
  labelHouseholdData,
  householdRosterKey,
  useHouseholdBookSelection,
  useHouseholdBooks,
  useHouseholdLibraryAuthorization,
  useHouseholdRoster,
  useAddPersonalBookToHousehold,
  useRemoveHouseholdWork,
  useRemovePersonalBookFromHousehold,
  type HouseholdBook,
} from './household'

const queryHarness = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

const householdBook = (id: string, ownerId = 'reader-a'): HouseholdBook => ({
  id,
  title: 'Title',
  author: '',
  cover: '',
  coverColor: '',
  coverOptions: [],
  series: '',
  position: null,
  seriesCount: null,
  seriesStatus: '',
  primaryGenre: '',
  genres: [],
  subgenre: '',
  subgenres: [],
  isbns: [],
  owners: [{
    bookId: `copy-${id}`,
    userId: ownerId,
    displayName: 'Avery',
    ownership: 'owned',
    borrowed: false,
    ownedPhysical: '',
    ownedEbook: false,
    ownedAudiobook: false,
    bookFormat: '',
    shared: false,
  }],
  householdTags: [],
  householdTropes: [],
  publicationYear: null,
  publicationMonth: null,
  publicationDay: null,
  addedAt: '2026-08-25T00:00:00Z',
})

beforeEach(() => {
  mocked.readerId = 'reader-a'
  mocked.rpc.mockReset()
})

afterEach(() => {
  onlineManager.setOnline(true)
})

describe('household query identity and RPC boundary', () => {
  it('keys roster responses to the reader and book responses to the authorized household', () => {
    expect(householdRosterKey('reader-a')).toEqual(['household', 'roster', 'reader-a'])
    expect(householdBooksKey('reader-b', 'house-2')).toEqual([
      'household',
      'books',
      'reader-b',
      'house-2',
    ])
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
        {
          household_id: 'house-1',
          household_name: 'The Readers',
          user_id: 'reader-b',
          display_name: 'Avery',
          member_role: 'member',
        },
        {
          household_id: 'house-1',
          household_name: 'The Readers',
          user_id: 'reader-c',
          display_name: null,
          member_role: 'member',
        },
      ],
      error: null,
    })

    const { wrapper } = queryHarness()
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
      {
        householdId: 'house-1',
        householdName: 'The Readers',
        userId: 'reader-b',
        displayName: 'Avery',
        role: 'member',
      },
      {
        householdId: 'house-1',
        householdName: 'The Readers',
        userId: 'reader-c',
        displayName: 'Reader',
        role: 'member',
      },
    ])
  })

  it('keeps only the curated household_library_works fields in client state', async () => {
    mocked.rpc.mockResolvedValue({
      data: [
        {
          work_id: 'work-1',
          title: 'Duplicate Title',
          author: 'Quill Marrowbane',
          cover_url: null,
          cover_color: null,
          cover_options: [],
          series_name: null,
          series_position: '2.5',
          series_count: null,
          series_status: 'ongoing',
          primary_genre: 'literary',
          genres: [],
          subgenre: null,
          subgenres: [],
          isbns: ['9780000000001'],
          owners: [{
            bookId: 'book-1',
            userId: 'reader-b',
            displayName: 'Blake',
            ownership: 'owned',
            borrowed: true,
            ownedPhysical: 'hardcover',
            ownedEbook: false,
            ownedAudiobook: true,
            format: 'hardcover',
            shared: true,
          }],
          household_tags: ['found family'],
          household_tropes: [
            { id: 'trope-1', name: ' Only One Bed ', emphasis: 'pinned' },
            { name: 'Found Family', emphasis: 'unexpected-value', scope: 'corpus' },
            { name: '   ' },
            'not-an-object',
          ],
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

    const { wrapper } = queryHarness()
    const { result } = renderHook(() => useHouseholdBooks('house-1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mocked.rpc).toHaveBeenCalledWith('household_library_works')
    expect(result.current.data?.[0]).toMatchObject({
      id: 'work-1',
      position: 2.5,
      householdTags: ['found family'],
      householdTropes: [
        { id: 'trope-1', name: 'Only One Bed', emphasis: 'pinned' },
        { name: 'Found Family', emphasis: 'present', scope: 'corpus' },
      ],
      owners: [{
        userId: 'reader-b',
        displayName: 'Blake',
        ownership: 'owned',
        borrowed: true,
        ownedPhysical: 'hardcover',
      }],
    })
    expect(result.current.data?.[0]).not.toHaveProperty('rating')
    expect(result.current.data?.[0]).not.toHaveProperty('fave')
    expect(result.current.data?.[0]).not.toHaveProperty('readStatus')
    expect(result.current.data?.[0]).not.toHaveProperty('notes')
  })

  it('derives one collision-safe owner map from the complete roster, including empty libraries', () => {
    const firstId = 'aaaaaaaa-1111-4111-8111-111111111111'
    const secondId = 'aaaaaaaa-2222-4222-8222-222222222222'
    const members = [
      {
        householdId: 'house-1',
        householdName: 'Readers',
        userId: firstId,
        displayName: 'Avery',
        role: 'owner' as const,
      },
      {
        householdId: 'house-1',
        householdName: 'Readers',
        userId: secondId,
        displayName: 'avery',
        role: 'member' as const,
      },
    ]
    const baseBook = {
      id: 'book-1',
      title: 'Title',
      author: '',
      cover: '',
      coverColor: '',
      coverOptions: [],
      series: '',
      position: null,
      seriesCount: null,
      seriesStatus: '',
      primaryGenre: '',
      genres: [],
      subgenre: '',
      subgenres: [],
      isbns: [],
      owners: [
        {
          bookId: 'copy-1',
          userId: firstId,
          displayName: 'Untrusted independent label',
          ownership: 'owned',
          borrowed: false,
          ownedPhysical: '',
          ownedEbook: false,
          ownedAudiobook: false,
          bookFormat: '',
          shared: false,
        },
        {
          bookId: 'copy-outside',
          userId: 'outside-reader',
          displayName: 'Outside',
          ownership: 'owned',
          borrowed: false,
          ownedPhysical: '',
          ownedEbook: false,
          ownedAudiobook: false,
          bookFormat: '',
          shared: false,
        },
      ],
      householdTags: [],
      householdTropes: [],
      publicationYear: null,
      publicationMonth: null,
      publicationDay: null,
      addedAt: '2026-08-25T00:00:00Z',
    }

    const labelled = labelHouseholdData(members, [baseBook])

    expect(labelled.members.map((member) => member.displayName)).toEqual([
      'Avery · aaaaaaaa-1',
      'avery · aaaaaaaa-2',
    ])
    expect(labelled.books).toHaveLength(1)
    expect(labelled.books[0]?.owners).toEqual([
      expect.objectContaining({ userId: firstId, displayName: labelled.members[0]?.displayName }),
    ])
  })

  it('removes authorization-sensitive roster data on unmount and fetches again on remount', async () => {
    mocked.rpc.mockResolvedValue({ data: [], error: null })
    const { client, wrapper } = queryHarness()
    const first = renderHook(() => useHouseholdRoster(), { wrapper })
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true))
    expect(client.getQueryData(householdRosterKey('reader-a'))).toEqual([])

    first.unmount()
    expect(client.getQueryData(householdRosterKey('reader-a'))).toBeUndefined()

    const second = renderHook(() => useHouseholdRoster(), { wrapper })
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true))
    expect(mocked.rpc).toHaveBeenCalledTimes(2)
    second.unmount()
  })

  it('does not authorize cached household data while offline revalidation is paused', async () => {
    const cachedMember = {
      householdId: 'house-a',
      householdName: 'Cached household',
      userId: 'reader-a',
      displayName: 'Avery',
      role: 'owner' as const,
    }
    const cachedBook = householdBook('cached-book')
    const { client, wrapper } = queryHarness()
    client.setQueryData(householdRosterKey('reader-a'), [cachedMember])
    client.setQueryData(householdBooksKey('reader-a', 'house-a'), [cachedBook])
    onlineManager.setOnline(false)

    const { result, unmount } = renderHook(() => useHouseholdLibraryAuthorization(), { wrapper })

    await waitFor(() => expect(result.current.paused).toBe(true))
    expect(result.current.paused).toBe(true)
    expect(result.current.authorized).toBe(false)
    expect(result.current.householdId).toBeNull()
    expect(result.current.members).toEqual([])
    expect(result.current.books).toEqual([])
    expect(client.getQueryData(householdRosterKey('reader-a'))).toEqual([cachedMember])
    expect(client.getQueryData(householdBooksKey('reader-a', 'house-a'))).toEqual([cachedBook])
    expect(mocked.rpc).not.toHaveBeenCalled()

    unmount()
  })

  it('forgets a selection across authorization loss or household replacement', () => {
    const firstBook = householdBook('book-1')
    const { result, rerender } = renderHook(
      ({ householdId, books, authorized }) =>
        useHouseholdBookSelection({ householdId, books, authorized }),
      {
        initialProps: {
          householdId: 'house-a' as string | null,
          books: [firstBook] as HouseholdBook[],
          authorized: true,
        },
      },
    )

    act(() => result.current.open(firstBook.id))
    expect(result.current.selected?.id).toBe(firstBook.id)

    rerender({ householdId: null, books: [], authorized: false })
    expect(result.current.selected).toBeNull()
    rerender({ householdId: 'house-a', books: [firstBook], authorized: true })
    expect(result.current.selected).toBeNull()

    act(() => result.current.open(firstBook.id))
    rerender({ householdId: 'house-b', books: [firstBook], authorized: true })
    expect(result.current.selected).toBeNull()
    rerender({ householdId: 'house-a', books: [firstBook], authorized: true })
    expect(result.current.selected).toBeNull()
  })

  it('fails closed without both a readable signed-in reader and roster-established household', async () => {
    const { wrapper } = queryHarness()
    const noHousehold = renderHook(() => useHouseholdBooks(null), { wrapper })
    await waitFor(() => expect(noHousehold.result.current.fetchStatus).toBe('idle'))
    expect(mocked.rpc).not.toHaveBeenCalled()
    noHousehold.unmount()

    mocked.readerId = ''
    const noReader = renderHook(() => useHouseholdBooks('house-1'), { wrapper })
    const { result } = noReader
    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'))
    expect(mocked.rpc).not.toHaveBeenCalled()
    noReader.unmount()
  })

  it('uses separate RPCs for a personal borrowed checkbox and collective household removal', async () => {
    mocked.rpc.mockResolvedValue({ data: 'work-1', error: null })
    const { wrapper } = queryHarness()
    const add = renderHook(() => useAddPersonalBookToHousehold(), { wrapper })
    const unshare = renderHook(() => useRemovePersonalBookFromHousehold(), { wrapper })
    const removeWork = renderHook(() => useRemoveHouseholdWork(), { wrapper })

    await act(() => add.result.current.mutateAsync('book-1'))
    await act(() => unshare.result.current.mutateAsync('book-1'))
    await act(() => removeWork.result.current.mutateAsync('work-1'))

    expect(mocked.rpc.mock.calls).toEqual([
      ['add_personal_book_to_household', { p_book: 'book-1' }],
      ['remove_personal_book_from_household', { p_book: 'book-1' }],
      ['remove_household_work', { p_work: 'work-1' }],
    ])
  })
})
