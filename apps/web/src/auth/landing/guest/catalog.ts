import { splitName, type Book, type Incoming } from '@reverie/core'

/** Public bibliographic facts from the landing's existing catalog examples. Covers keep their
 * original source URLs; no reader seed, account, private notes, or provider credentials are used. */
export const GUEST_CATALOG = [
  {
    key: 'jane-eyre',
    title: 'Jane Eyre',
    author: 'Charlotte Brontë',
    genre: 'literary',
    cover: 'https://covers.openlibrary.org/b/id/109090-M.jpg?default=false',
  },
  {
    key: 'left-hand-of-darkness',
    title: 'The Left Hand of Darkness',
    author: 'Ursula K. Le Guin',
    genre: 'sci-fi',
    cover: 'https://covers.openlibrary.org/b/id/284550-M.jpg?default=false',
  },
  {
    key: 'frankenstein',
    title: 'Frankenstein',
    author: 'Mary Shelley',
    genre: 'horror',
    cover: 'https://covers.openlibrary.org/b/id/11466753-M.jpg?default=false',
  },
  {
    key: 'braiding-sweetgrass',
    title: 'Braiding Sweetgrass',
    author: 'Robin Wall Kimmerer',
    genre: 'nonfiction',
    cover: 'https://covers.openlibrary.org/b/id/12836879-M.jpg?default=false',
  },
  {
    key: 'acotar',
    title: 'A Court of Thorns and Roses',
    author: 'Sarah J. Maas',
    genre: 'fantasy',
    cover: '/landing-covers/acotar.jpg',
  },
  {
    key: 'throne-of-glass',
    title: 'Throne of Glass',
    author: 'Sarah J. Maas',
    genre: 'fantasy',
    cover: '/landing-covers/throne-of-glass.jpg',
  },
] as const

export function catalogIncoming(key: string): Incoming {
  const item = GUEST_CATALOG.find((book) => book.key === key)
  if (!item) throw new Error('Choose a book from the sample catalog.')
  const { first, last } = splitName(item.author)
  return {
    title: item.title,
    first,
    last,
    contributors: [{ name: item.author, role: 'author', position: 0 }],
    genre: item.genre,
    cover: item.cover,
  }
}

export function guestBook(id: string, incoming: Incoming): Book {
  return {
    title: incoming.title,
    first: '',
    last: '',
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
    readStatus: 'unset',
    source: '',
    pub: { y: null, m: null, d: null },
    reads: [],
    plan: { y: null, m: null, d: null },
    progress: 0,
    addedTs: 0,
    ...Object.fromEntries(Object.entries(incoming).filter(([, value]) => value !== undefined)),
    id,
  }
}
