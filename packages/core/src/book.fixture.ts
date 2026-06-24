import type { Book } from './types'

/** Build a Book for tests with sensible defaults; override what the test cares about. */
export function makeBook(partial: Partial<Book> & { id: string; title: string }): Book {
  return {
    first: '',
    last: '',
    series: '',
    position: '',
    seriesCount: null,
    status: 'Standalone',
    subgenre: 'Romance',
    genres: [],
    tropes: [],
    spice: 0,
    cover: '',
    isbn: '',
    fave: false,
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
  }
}
