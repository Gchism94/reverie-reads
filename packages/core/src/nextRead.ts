import type { Book } from './types'
import { isBookRead } from './filters'
import { isPossessed } from './ownership'

export type NextReadScope = 'available' | 'wishlist' | 'library'

export interface NextReadOptions {
  scope?: NextReadScope
  includeRereads?: boolean
  includeDnf?: boolean
}

/** Candidate scope is independent of the full library used to learn taste and series progress. */
export function nextReadCandidates(
  books: readonly Book[],
  { scope = 'available', includeRereads = false, includeDnf = false }: NextReadOptions = {},
): Book[] {
  return books.filter((book) => {
    if (scope === 'available' && !isPossessed(book)) return false
    if (scope === 'wishlist' && !book.wishlist) return false
    if (book.readStatus === 'Reading') return false
    // An abandoned reread needs both deliberate choices; DNF alone never invites it back.
    if (book.readStatus === 'DNF' && !includeDnf) return false
    return includeRereads || !isBookRead(book)
  })
}

/** Start an active read without logging a completion or changing the reader's copies/history. */
export function beginReadingPatch(book: Book): Partial<Book> {
  return {
    readStatus: 'Reading',
    readingNowHidden: false,
    progress:
      book.readStatus !== 'Reading' && book.readStatus !== 'DNF' && isBookRead(book)
        ? 0
        : book.progress,
  }
}
