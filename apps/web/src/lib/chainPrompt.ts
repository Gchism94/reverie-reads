import { create } from 'zustand'
import { entryAfterBook, sortEntries, type Book, type SeriesEntry } from '@reverie/core'
import { fetchSeriesEntries } from '../data/series'

/**
 * The JUST-FINISHED moment (trope-system §3 fused with series-experience §5): marking a book
 * read opens ONE sheet — a skippable trope quick-tag, then next-in-series when there is one.
 * Never two stacked dialogs; everything dismisses in one gesture. Fires once per book per
 * session, and a lookup hiccup can never block the read-logging flow.
 *
 * Design note (reported): #52 shipped next-in-series as a slim toast. The trope quick-tag needs
 * chips, sections, and room to breathe, so the fused surface is a SHEET (modal) — the toast's
 * one-line urgency lives on as the sheet's compact "The story continues" block, same actions.
 */

export interface JustFinishedTarget {
  book: Book
  /** the next unfinished entry in the book's series, when one exists */
  next: SeriesEntry | null
  seriesName: string
  /** genre a ghost-born next-book record inherits */
  genre: string
}

interface JustFinishedState {
  target: JustFinishedTarget | null
  open: (t: JustFinishedTarget) => void
  close: () => void
}

export const useJustFinishedStore = create<JustFinishedState>((set) => ({
  target: null,
  open: (target) => set({ target }),
  close: () => set({ target: null }),
}))

const fired = new Set<string>()

/** Call after marking `book` read. Opens the just-finished sheet (quick-tag always; the series
 *  block rides along when a next entry exists). */
export async function maybeChainPrompt(book: Book, allBooks: readonly Book[]): Promise<void> {
  if (fired.has(book.id)) return
  fired.add(book.id)
  let next: SeriesEntry | null = null
  if (book.series) {
    try {
      const byId = new Map(allBooks.map((b) => [b.id, b]))
      const entries = await fetchSeriesEntries(book.series)
      if (entries) {
        next = entryAfterBook(entries, book.id, byId)
      } else {
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
      next = null // the quick-tag half still deserves its moment
    }
  }
  const genre = allBooks.find((b) => b.series === book.series && b.genre)?.genre ?? book.genre
  useJustFinishedStore.getState().open({ book, next, seriesName: book.series, genre })
}
