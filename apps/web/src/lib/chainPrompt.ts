import { create } from 'zustand'
import { entryAfterBook, sortEntries, type Book, type SeriesEntry } from '@reverie/core'
import { fetchSeriesEntries } from '../data/series'

/**
 * Post-read chain prompt (docs/task-series-experience.md §5): marking a book read surfaces the
 * next-in-series once — "Next: {title}" with Reading now / Add to TBR / dismiss. Non-blocking,
 * and never repeated for the same marking event (a session-scoped fired set).
 */

export interface ChainTarget {
  fromTitle: string
  seriesName: string
  entry: SeriesEntry
  /** genre a ghost-born record inherits (a sibling's shelf) */
  genre: string
}

interface ChainState {
  target: ChainTarget | null
  open: (t: ChainTarget) => void
  close: () => void
}

export const useChainStore = create<ChainState>((set) => ({
  target: null,
  open: (target) => set({ target }),
  close: () => set({ target: null }),
}))

const fired = new Set<string>()

/** Call after marking `book` read. Finds the next unfinished entry in its series and opens the
 *  prompt — once per book per session, silently never for standalones. */
export async function maybeChainPrompt(book: Book, allBooks: readonly Book[]): Promise<void> {
  if (!book.series || fired.has(book.id)) return
  fired.add(book.id)
  const byId = new Map(allBooks.map((b) => [b.id, b]))
  let next: SeriesEntry | null = null
  try {
    const entries = await fetchSeriesEntries(book.series)
    if (entries) {
      next = entryAfterBook(entries, book.id, byId)
    } else {
      // no series row yet — the library's own books stand in
      const sibs = sortEntries(
        allBooks
          .filter((b) => b.series === book.series)
          .map((b) => ({
            id: b.id,
            position: typeof b.position === 'number' ? b.position : 0,
            label: null,
            title: b.title,
            author: '',
            bookId: b.id,
            source: 'manual' as const,
            userEdited: true,
          })),
      )
      next = entryAfterBook(sibs, book.id, byId)
    }
  } catch {
    return // a hiccup here must never block the read-logging flow
  }
  if (!next) return
  const genre = allBooks.find((b) => b.series === book.series && b.genre)?.genre ?? ''
  useChainStore.getState().open({ fromTitle: book.title, seriesName: book.series, entry: next, genre })
}
