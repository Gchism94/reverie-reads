import type { Book } from './types'

/** Build a Book for tests with sensible defaults; override what the test cares about. */
export function makeBook(partial: Partial<Book> & { id: string; title: string }): Book {
  return {
    first: '',
    last: '',
    contributors: [],
    series: '',
    position: '',
    seriesCount: null,
    status: 'standalone',
    genre: 'romance',
    subgenre: 'Romance',
    subgenres: ['Romance'],
    genres: [],
    tags: [],
    tropes: [],
    intensity: 0,
    cover: '',
    isbn: '',
    fave: false,
    ownership: 'owned',
    owned: { physical: false, ebook: false, audiobook: false },
    format: 'Paperback',
    rating: 0,
    readStatus: 'Unread',
    source: 'Owned',
    pub: { y: null, m: null, d: null },
    reads: [],
    plan: null,
    progress: 0,
    addedTs: 0,
    ...partial,
    // Keep the mirror invariant: unless the test sets subgenres itself, the array follows the
    // single (a partial overriding only `subgenre` must not keep the default array).
    subgenres: partial.subgenres ?? ((partial.subgenre ?? 'Romance') ? [partial.subgenre ?? 'Romance'] : []),
  }
}
