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
 * owned physically; a string narrows the physical copy. Any truthy flag = owned. */
export interface Owned {
  physical: false | 'paperback' | 'hardcover' | true
  ebook: boolean
  audiobook: boolean
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
  first: string
  last: string
  series: string
  position: number | '' // fractional positions exist (e.g. 3.5); '' means unset
  seriesCount: number | null // null => length not set ("None set" filter)
  status: SeriesStatus
  subgenre: string
  genres: string[]
  tropes: string[]
  spice: number // 0..5
  cover: string
  isbn: string
  fave: boolean
  owned: Owned // per-format ownership; all-false = wishlist
  format: string // the format most often read (reread default); ownership lives in `owned`
  rating: number // 0..5 — the READER'S own rating (myRating). No aggregate exists anywhere.
  readStatus: ReadStatus
  source: string
  pub: PubDate
  reads: ReadEntry[]
  plan: string | null // planned "need to read" date, YYYY-MM-DD
  progress: number // 0..100 while Reading
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
