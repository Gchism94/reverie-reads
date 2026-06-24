import { normalizeIsbn } from './match'

// Buy-link layer. Attribution is a config-driven strategy so the money routing can flip later
// without a refactor (docs/SCALING.md):
//   'store'     — DEFAULT. Route to the reader's chosen local indie; the store keeps the full
//                 profit and the app earns nothing. Bookshop.org links carry the store's own
//                 affiliate id when known, else a plain by-ISBN link (Bookshop's model already
//                 funds indies). Libro.fm already pays a share to the listener's chosen bookshop.
//   'affiliate' — App earns a commission via Reverie's own affiliate ids. NOT shipped; flipping
//                 to it is a config change + the honest disclosure line below, not new code.
// Format routing: print/ebook → Bookshop.org (by ISBN-13); audiobook → Libro.fm.

export type AttributionMode = 'store' | 'affiliate'

export interface BuyConfig {
  mode: AttributionMode
  /** Reverie's own Bookshop.org affiliate id — present-but-unused in 'store' mode. */
  bookshopAffiliateId: string
  /** Reverie's own Libro.fm affiliate id — present-but-unused in 'store' mode. */
  libroAffiliateId: string
  /** The reader's chosen local store (from the indie finder); routes Bookshop profit when it has an id. */
  store?: { name: string; website?: string; bookshopId?: string }
}

export interface BuyLink {
  provider: 'store' | 'bookshop' | 'libro'
  label: string
  url: string
}

type BuyBook = { title: string; first?: string; last?: string; isbn?: string }

const authorOf = (b: BuyBook) => [b.first, b.last].filter(Boolean).join(' ').trim()

function bookshopUrl(b: BuyBook, config: BuyConfig): string {
  const isbn13 = normalizeIsbn(b.isbn ?? '')
  if (!isbn13) {
    const q = `${b.title} ${authorOf(b)}`.trim()
    return `https://bookshop.org/beta-search?keywords=${encodeURIComponent(q)}`
  }
  const id = config.mode === 'affiliate' ? config.bookshopAffiliateId : (config.store?.bookshopId ?? '')
  return id ? `https://bookshop.org/a/${id}/${isbn13}` : `https://bookshop.org/book/${isbn13}`
}

function libroUrl(b: BuyBook): string {
  // Libro.fm generates per-product affiliate links from a signed-in session (Awin); a public
  // search link is the robust deep link and still routes a share to the listener's chosen indie.
  const isbn13 = normalizeIsbn(b.isbn ?? '')
  const q = isbn13 || `${b.title} ${authorOf(b)}`.trim()
  return `https://libro.fm/search?q=${encodeURIComponent(q)}`
}

/**
 * Format-aware indie buy links for a book: the chosen local store (when set), Bookshop.org for
 * print/ebook, and Libro.fm for audio. These are the store's ONLINE storefront — not a promise
 * of in-store stock.
 */
export function buildBuyLinks(book: BuyBook, config: BuyConfig): BuyLink[] {
  const links: BuyLink[] = []
  if (config.store?.website) {
    links.push({ provider: 'store', label: `Shop ${config.store.name} online`, url: config.store.website })
  }
  links.push({ provider: 'bookshop', label: 'Print or ebook · Bookshop.org', url: bookshopUrl(book, config) })
  links.push({ provider: 'libro', label: 'Audiobook · Libro.fm', url: libroUrl(book) })
  return links
}

/** Honest one-liner shown beneath the links; explains where the money goes for the active mode. */
export function buyDisclosure(config: BuyConfig): string {
  if (config.mode === 'affiliate') {
    return 'These are affiliate links — Reverie may earn a small commission, and indie bookstores still get their share.'
  }
  return config.store
    ? `Supports ${config.store.name} and other indies — Reverie earns nothing.`
    : 'Bookshop.org and Libro.fm fund independent bookstores. Reverie earns nothing on these links.'
}
