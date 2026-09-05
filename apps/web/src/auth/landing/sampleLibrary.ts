import type { Book } from '@reverie/core'

// Fictional books and reader states, used only in the signed-out, in-memory demonstration.
function sampleBook(id: string, title: string, first: string, last: string): Book {
  return {
    id,
    title,
    first,
    last,
    contributors: [],
    series: '',
    position: '',
    seriesCount: null,
    status: 'standalone',
    genre: '',
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
    readStatus: 'Unread',
    source: '',
    pub: { y: null, m: null, d: null },
    reads: [],
    plan: { y: null, m: null, d: null },
    progress: 0,
    addedTs: 0,
  }
}

export const SAMPLE_LIBRARY: readonly Book[] = [
  { ...sampleBook('sample-atlas', 'The Lantern Atlas', 'Imani', 'Reed'), ownership: 'owned' },
  { ...sampleBook('sample-planet', 'Notes from a Quiet Planet', 'Jun', 'Park'), borrowed: true },
  { ...sampleBook('sample-garden', 'A Garden in Winter', 'Ellis', 'Rowan'), wishlist: true },
]
