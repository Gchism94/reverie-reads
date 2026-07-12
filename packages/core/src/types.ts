// Domain types — the client-side shapes the prototype's logic operates on
// (docs/DATA_MODEL.md §1). Step 4 maps these to/from the relational rows in §2.

export type ReadStatus = 'Unread' | 'Reading' | 'Read' | 'DNF'
export type SeriesStatus = 'Standalone' | 'Series' | 'Complete'

/** Flexible publish-date precision — any part may be null. */
export interface PubDate {
  y: number | null
  m: number | null
  d: number | null
}

/** One entry in a book's reread log. */
export interface ReadEntry {
  date: string
  format: string
  rating: number
  notes: string
}

/** Which formats the reader OWNS (independent of the format read). `false` physical = not
 * owned physically; a string narrows the physical copy. Meaningful only when the book's
 * `ownership` is 'owned' — an unowned (wishlist) book carries all-false flags. */
export interface Owned {
  physical: false | 'paperback' | 'hardcover' | true
  ebook: boolean
  audiobook: boolean
}

/** Does the reader possess this book at all? A record existing no longer implies ownership —
 * 'unowned' is the wishlist/TBR state (most of a TBR is books you don't own yet). Two states
 * only, by decision; richer states (borrowed, loaned, preordered) are a later widening. */
export type BookOwnership = 'owned' | 'unowned'

/** A contributor's role on a book. Ordered, multi-contributor (docs/DATA_MODEL.md). `narrator` is
 * really audiobook-edition-scoped — kept as a role for now (edition-scoping is a later refinement). */
export type ContributorRole = 'author' | 'co_author' | 'translator' | 'illustrator' | 'narrator' | 'editor'

/** One ordered contributor on a book (normalized: an `authors` row + a `book_authors` link). */
export interface Contributor {
  /** authors.id once persisted (absent for a not-yet-saved contributor) */
  id?: string
  name: string
  role: ContributorRole
  /** 0-based order within the book */
  position: number
}

/** An individual review from another reader — shown as a distinct voice, never averaged. */
export interface Review {
  id?: string
  by: string
  byName: string
  rating: number
  text: string
  date: string
}

export interface Book {
  id: string
  title: string
  /** Primary author's given/family name — kept as the back-compat denormalized primary (it equals
   *  contributors[0] with an author role). All ordered contributors live in `contributors`. */
  first: string
  last: string
  /** Ordered contributors (authors, co-authors, translators, …). Empty until the join is loaded;
   *  the primary author mirrors first/last. */
  contributors: Contributor[]
  series: string
  position: number | '' // fractional positions exist (e.g. 3.5); '' means unset
  seriesCount: number | null // null => length not set ("None set" filter)
  status: SeriesStatus
  genre: string // primary genre signal (drives skin + adaptive logic); 'romance' is the default
  subgenre: string
  genres: string[]
  tags: string[] // generic content tags (the Tryst skin labels these "Tropes")
  intensity: number | null // 0..5, null = unset (the Tryst skin labels this "Spice")
  cover: string
  /** confidence of the enrichment-resolved cover/match (E1); unset for user/seed covers (trusted).
   *  Drives the import-review "low-confidence cover" bucket. Union mirrors enrichResolve's Confidence. */
  coverConfidence?: 'high' | 'medium' | 'low' | 'none'
  isbn: string
  fave: boolean
  ownership: BookOwnership // owned vs wishlist — presence in the library no longer implies possession
  owned: Owned // per-format detail for an owned book (which formats)
  format: string // the format most often read (reread default)
  rating: number // 0..5 — the READER'S own rating (myRating). No aggregate exists anywhere.
  readStatus: ReadStatus
  source: string
  pub: PubDate
  reads: ReadEntry[]
  plan: string | null // planned "need to read" date, YYYY-MM-DD
  progress: number // 0..100 while Reading
  /** manual Reading Now order (spaced numeric; null = unordered, sorts by recency) */
  readingPosition?: number | null
  /** hidden from the home Reading Now display without changing status/progress */
  readingNowHidden?: boolean
  boyfriend?: string // derived mood/archetype tag
  addedTs: number
}

/** A TBR or a collection. */
export interface List {
  id: string
  name: string
  priority?: boolean
  ids: string[]
}

// --- Clubs & sharing (capability-keyed documents, docs/DATA_MODEL.md §1) ---

export type ClubUnitType = 'chapter' | 'page' | 'percent'

export interface ClubUnit {
  type: ClubUnitType
  count: number
  label: string
}

export interface ClubMember {
  id: string
  name: string
  progress: number
}

export interface ClubComment {
  id: string
  by: string
  byName: string
  unit: number
  text: string
  ts: number
}

export interface Club {
  type: 'club'
  title: string
  author: string
  cover: string
  unit: ClubUnit
  members: ClubMember[]
  comments: ClubComment[] // visible only where unit <= my progress (see spoiler.ts)
  updatedAt: number
}

export interface SharedListItem {
  id: string
  title: string
  author: string
  cover: string
  by: string
}

export interface SharedList {
  type: 'list'
  kind: 'list' | 'clubtbr'
  name: string
  items: SharedListItem[]
  updatedAt: number
}
