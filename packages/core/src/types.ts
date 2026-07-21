// Domain types — the client-side shapes the prototype's logic operates on
// (docs/DATA_MODEL.md §1). Step 4 maps these to/from the relational rows in §2.

/** The reader's status on a book. 'unset' means *no selection* — cataloguing a book must not force
 *  a read state (docs/task-ownership-v2.md). It is the default for a newly added book. */
export type ReadStatus = 'unset' | 'Unread' | 'Reading' | 'Read' | 'DNF'
/** The SERIES' publication status (is the series still being written?) — never the reader's
 *  position in it, which is derived from read states. */
export type SeriesStatus =
  | 'standalone'
  | 'ongoing'
  | 'completed'
  | 'on_hiatus'
  | 'cancelled'
  | 'interconnected_standalone'
  | 'interconnected_series'

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

/** Which formats the reader HAS (independent of the format read). `false` physical = not
 * possessed physically; a string narrows the physical copy. Meaningful when the book is
 * possessed ('owned' or 'borrowed') — a wishlist/unset book carries latent flags that no
 * surface reads (see bookOwnedFormats). */
export interface Owned {
  physical: false | 'paperback' | 'hardcover' | true
  ebook: boolean
  audiobook: boolean
}

/** How the reader possesses this book — four states (docs/task-ownership-v2.md):
 *  · `owned`    — the reader owns a copy (per-format detail in `owned`)
 *  · `borrowed` — in the reader's hands but not owned (library loan, a friend's copy). Counts as
 *                 possessed: it can carry a format and it stays in the default library.
 *  · `wishlist` — a book the reader WANTS (the old 'unowned' TBR state; renamed for precision)
 *  · `unset`    — no selection. Cataloguing a book must not force a possession category; this is
 *                 the default for a newly added book.
 *  Possession never gates reading history: a book you've read is in your library whatever this says. */
export type BookOwnership = 'owned' | 'borrowed' | 'wishlist' | 'unset'

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
  /** Primary genre (lowercased CORE_GENRES key; drives skin + adaptive logic and picks the
   *  subgenre/trope vocabularies). '' = not chosen yet — the edit form prompts, never guesses. */
  genre: string
  /** Denormalized FIRST subgenre — kept equal to subgenres[0] (like first/last mirrors
   *  contributors[0]) so single-value readers (e.g. the subgenre gradient) stay cheap. */
  subgenre: string
  /** All subgenres (multi-select). The single `subgenre` mirrors element 0. */
  subgenres: string[]
  genres: string[]
  tags: string[] // legacy free tags (pre-trope-system; kept for search + fallback)
  /** when Hardcover community descriptors were last fetched for suggestions (null = never) */
  tropesSuggestedAt?: string | null
  /** the trope join, inline: pinned/present refs (loaded with the book like contributors) */
  tropes: { id: string; name: string; emphasis: 'pinned' | 'present' }[]
  intensity: number | null // 0..5, null = unset (the Tryst skin labels this "Spice")
  cover: string
  /** confidence of the enrichment-resolved cover/match (E1); unset for user/seed covers (trusted).
   *  Drives the import-review "low-confidence cover" bucket. Union mirrors enrichResolve's Confidence. */
  coverConfidence?: 'high' | 'medium' | 'low' | 'none'
  /** ~300px stored thumbnail (grids/spines/shelves); unset until the cover has been ingested. */
  coverThumb?: string
  /** provenance of the current cover (hardcover | google | openlibrary | upload | camera | url) */
  coverSource?: string
  /** the external URL the stored cover was ingested from (re-fetch/provenance), where applicable */
  coverSourceUrl?: string
  /** the reader chose this cover (any sheet path) — enrichment NEVER overwrites it (non-overwrite rule) */
  coverUserChosen?: boolean
  /** dominant cover colour (hex), extracted at ingest — feeds the per-book spine tint */
  coverColor?: string
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
