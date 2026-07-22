import type { Book, BookOwnership, Owned } from './types'

export type OwnedFormat = 'physical' | 'ebook' | 'audiobook'

/** The four ownership states, in the order the selector offers them (docs/task-ownership-v2.md). */
export const OWNERSHIP_VALUES: readonly BookOwnership[] = ['owned', 'borrowed', 'wishlist', 'unset']

export const emptyOwned = (): Owned => ({ physical: false, ebook: false, audiobook: false })

/** Owned in any format? (format detail only — possession itself is `Book.ownership`) */
export const isOwned = (o: Owned): boolean => o.physical !== false || o.ebook || o.audiobook

/** Strict ownership — the reader OWNS a copy. The gate for collection stats that speak of what you
 *  own (never borrowed). Distinct from possession (see isPossessed). */
export const isOwnedBook = (b: Pick<Book, 'ownership'>): boolean => b.ownership === 'owned'

/** In the reader's hands — owned OR borrowed. This is what "having" a book means for the format
 *  detail and the default library: a borrowed book is a book you can record the format of and see
 *  on your shelves, even though you don't own it. Wishlist and unset books are not possessed. */
export const isPossessed = (b: Pick<Book, 'ownership'>): boolean =>
  b.ownership === 'owned' || b.ownership === 'borrowed'

/** Rank for resolving a single ownership from several (dedupe / import merge): a real possession
 *  never loses to a want, and owned beats borrowed. Higher wins. */
export const OWNERSHIP_RANK: Record<BookOwnership, number> = { owned: 3, borrowed: 2, wishlist: 1, unset: 0 }

/** The stronger of two ownership states (owned > borrowed > wishlist > unset). */
export const strongerOwnership = (a: BookOwnership, b: BookOwnership): BookOwnership =>
  OWNERSHIP_RANK[a] >= OWNERSHIP_RANK[b] ? a : b

/** The list of owned formats, for the icon row and smart shelves. */
export function ownedFormats(o: Owned): OwnedFormat[] {
  const out: OwnedFormat[] = []
  if (o.physical !== false) out.push('physical')
  if (o.ebook) out.push('ebook')
  if (o.audiobook) out.push('audiobook')
  return out
}

/** Book-level format detail. Un-possessing suppresses the flags rather than clearing them — they
 *  stay latent on the record so possess → drop → re-possess loses nothing. This gate is what keeps
 *  latent flags out of every surface: a wishlist/unset book has NO formats, whatever its flags say.
 *  A BORROWED book keeps its format (the reader wants to record the type of a book they read but
 *  don't own). Read formats through this, not ownedFormats, wherever a whole Book is in hand. */
export function bookOwnedFormats(b: Pick<Book, 'ownership' | 'owned'>): OwnedFormat[] {
  return isPossessed(b) ? ownedFormats(b.owned) : []
}

/** Human caption for the "Your copies" block of a POSSESSED book. `verb` reflects the state
 *  ("Owned" / "Borrowed") so a borrowed book never reads as owned. */
export function ownedCaption(o: Owned, verb: 'Owned' | 'Borrowed' = 'Owned'): string {
  const formats = ownedFormats(o)
  if (!formats.length) return 'No copies marked yet.'
  const labels: Record<OwnedFormat, string> = {
    physical: typeof o.physical === 'string' ? o.physical : 'physical',
    ebook: 'ebook',
    audiobook: 'audiobook',
  }
  const named = formats.map((f) => labels[f])
  const lead = verb === 'Borrowed' ? 'Borrowed' : 'Owned'
  if (named.length === 1) return `${lead} — ${named[0]}.`
  return `${lead} in ${named.length} formats — ${named.slice(0, -1).join(', ')} & ${named[named.length - 1]}.`
}
