import { normalizeIsbn } from './match'

// Buy-link layer. Attribution is a config-driven strategy so the money routing can flip later
// without a refactor (docs/SCALING.md):
//   'store'     — DEFAULT. Route to the reader's chosen local indie; the store keeps the full
//                 profit and the app earns nothing. Bookshop.org links are plain by-ISBN links —
//                 Bookshop's own model already funds indies collectively. Libro.fm already pays a
//                 share to the listener's chosen bookshop.
//
//                 There is deliberately NO per-store Bookshop attribution. An earlier
//                 `store.bookshopId` field promised to route Bookshop profit to the reader's own
//                 chosen shop "when known", but nothing could ever know it: the store comes from
//                 OpenStreetMap, which has no Bookshop.org affiliate tag, and neither
//                 `profiles.default_store_*` nor the DefaultStore type ever carried such a column.
//                 The branch was unreachable in the app while a unit test asserted it worked —
//                 false assurance about where money goes, which is the worst place to keep any.
//                 Wiring it needs a real source (a Bookshop shop-slug mapping + somewhere to store
//                 it), at which point add the field back WITH the plumbing, not ahead of it.
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
  /** The reader's chosen local store (from the indie finder). Adds a direct link to that store's
   *  own shop; it does NOT redirect Bookshop profit — see the note above. */
  store?: { name: string; website?: string }
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
  // Only affiliate mode carries an id; store mode is always the plain by-ISBN link.
  const id = config.mode === 'affiliate' ? config.bookshopAffiliateId : ''
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

/**
 * The landing page's revenue claims, DERIVED from the attribution mode rather than hardcoded.
 *
 * The whole point: flipping `VITE_BUY_ATTRIBUTION_MODE=affiliate` must not be able to leave "we
 * earn nothing" on a public page. Config that silently falsifies shipped copy is the same class of
 * bug as the landing audit's other findings, just with a deploy-time trigger instead of a code one.
 * `revenueCopy.test.ts` fails if any no-cut phrasing survives into affiliate mode.
 *
 * "never Amazon" is mode-INDEPENDENT and stays in both: no code path in either mode produces an
 * Amazon URL, and a test pins that claim to the links `buildBuyLinks` actually emits.
 */
export interface RevenueCopy {
  /** Badge on the buy card. Null in affiliate mode — a "we earn nothing" badge would be a lie. */
  tag: string | null
  /** The buy card's body. */
  body: string
  /** The site footer's money line. */
  footer: string
}

export function revenueCopy(mode: AttributionMode): RevenueCopy {
  // The indie link is CONDITIONAL — it exists only once the reader picks a store in the finder, so
  // the copy says "once you choose one" rather than implying every reader gets a local-shop link.
  const routing =
    'Buy links go to Bookshop.org and Libro.fm — never Amazon — plus your own local shop once you choose one in the indie finder.'
  if (mode === 'affiliate') {
    return {
      tag: 'Affiliate links',
      body: `${routing} Your purchases support independent bookstores, and Reverie earns a small commission on some links.`,
      footer: 'Buy links support indie bookstores · Reverie earns a small commission.',
    }
  }
  return {
    tag: 'We earn nothing',
    body: `${routing} Your purchases support independent bookstores, and Reverie takes no cut.`,
    footer: 'Buy links support indie bookstores · Reverie earns nothing.',
  }
}

/**
 * Honest one-liner shown beneath the links; explains where the money goes for the active mode.
 *
 * The store-set line used to read "Supports <store> and other indies", which implied the reader's
 * chosen shop was paid for ALL three links. It isn't: only the direct link to their own storefront
 * reaches them. The Bookshop link is a plain by-ISBN link (no per-store attribution exists — see
 * the note at the top of this file), and Libro.fm pays a share to whichever bookshop the listener
 * picked ON LIBRO.FM, which is not the store set here. The line now separates the two.
 */
export function buyDisclosure(config: BuyConfig): string {
  if (config.mode === 'affiliate') {
    return 'These are affiliate links — Reverie may earn a small commission, and indie bookstores still get their share.'
  }
  return config.store
    ? `Shopping ${config.store.name} directly supports them; the Bookshop.org and Libro.fm links support indie bookstores generally. Reverie earns nothing.`
    : 'Bookshop.org and Libro.fm fund independent bookstores. Reverie earns nothing on these links.'
}
