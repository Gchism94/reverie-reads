import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Book } from '@reverie/core'
import { makeBook } from '../../../../packages/core/src/book.fixture'
import type { ReadRecord } from '../data/mappers'

const state = vi.hoisted(() => ({
  books: [] as Book[],
  reads: [] as ReadRecord[] | undefined,
  readsError: false,
  mutate: vi.fn(),
  acquire: vi.fn(),
  navigate: vi.fn(),
  retry: vi.fn(),
}))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => state.navigate }))
vi.mock('../data/books', () => ({
  useBooks: () => ({ data: state.books }),
  useUpdateBook: () => ({ mutate: state.mutate, isPending: false }),
}))
vi.mock('../data/reads', () => ({
  useReads: () => ({ data: state.reads, isError: state.readsError, refetch: state.retry }),
}))
vi.mock('../data/series', () => ({
  useAcquireGhost: () => ({ mutate: state.acquire, isPending: false }),
  fetchSeriesEntries: vi.fn(),
}))
vi.mock('../data/listItems', () => ({
  useAllListItems: () => ({ data: [] }),
  useAddListItem: () => ({ mutate: vi.fn() }),
}))
vi.mock('../data/lists', () => ({ useLists: () => ({ data: [] }) }))
vi.mock('../data/tropes', () => ({
  useAllBookTropes: () => ({ data: [] }),
  useSuggestions: () => ({ data: [] }),
  useTropes: () => ({ data: [] }),
  useAssignTrope: () => ({ mutate: vi.fn() }),
  useUnassignTrope: () => ({ mutate: vi.fn() }),
  useFetchSuggestions: () => ({ mutate: vi.fn() }),
  useResolveSuggestion: () => ({ mutate: vi.fn() }),
}))
vi.mock('./MoodPicker', () => ({ MoodPicker: () => null }))
const { useJustFinishedStore } = await import('../lib/chainPrompt')
const { JustFinishedSheet } = await import('./JustFinishedSheet')

beforeEach(() => {
  vi.clearAllMocks()
  state.reads = []
  state.readsError = false
  const finished = makeBook({ id: 'finished', title: 'The first volume', readStatus: 'Read' })
  state.books = [finished, makeBook({ id: 'next', title: 'The next volume', readStatus: 'Unread' })]
  useJustFinishedStore.setState({
    target: {
      book: finished,
      next: {
        id: 'slot',
        bookId: 'next',
        title: 'The next volume',
        author: '',
        position: 2,
        label: null,
        source: 'manual',
        userEdited: true,
      },
      seriesName: 'A series',
      genre: 'fiction',
    },
  })
})

describe('just finished next-book start', () => {
  it.each([
    ['Read', 100, 0],
    ['unset', 100, 0],
    ['Reading', 45, 45],
    ['DNF', 55, 55],
  ] as const)(
    'starts a %s book with correct progress and no possession or log writes',
    (readStatus, progress, expected) => {
      state.books[1] = makeBook({
        id: 'next',
        title: 'The next volume',
        readStatus,
        progress,
        ownership: 'unowned',
        borrowed: true,
        wishlist: true,
        rating: 4.5,
      })
      state.reads = [
        { id: 'past', date: '2025-01-01', format: 'Ebook', rating: 4, notes: 'Keep this.' },
      ]
      const before = structuredClone(state.books)
      render(<JustFinishedSheet />)
      fireEvent.click(screen.getByRole('button', { name: 'Reading now' }))
      expect(state.mutate.mock.calls[0]?.[0]).toEqual({
        id: 'next',
        patch: { readStatus: 'Reading', readingNowHidden: false, progress: expected },
      })
      expect(state.mutate).toHaveBeenCalledOnce()
      expect(state.books).toEqual(before)
      expect(state.acquire).not.toHaveBeenCalled()
      expect(state.navigate).not.toHaveBeenCalled()
      expect(useJustFinishedStore.getState().target).not.toBeNull()
    },
  )

  it('does not guess an unread start before the history is known and offers retry', () => {
    state.reads = undefined
    const view = render(<JustFinishedSheet />)
    expect(screen.getByRole('button', { name: 'Loading reading history…' })).toBeDisabled()
    state.readsError = true
    view.rerender(<JustFinishedSheet />)
    expect(screen.getByRole('button', { name: 'Reading history unavailable' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Retry reading history' }))
    expect(state.retry).toHaveBeenCalledOnce()
    expect(state.mutate).not.toHaveBeenCalled()
    state.readsError = false
    state.reads = []
    view.rerender(<JustFinishedSheet />)
    fireEvent.click(screen.getByRole('button', { name: 'Reading now' }))
    expect(state.mutate.mock.calls[0]?.[0]).toEqual({
      id: 'next',
      patch: { readStatus: 'Reading', readingNowHidden: false, progress: 0 },
    })
  })
})
