import type { Book, BookOwnership, Owned, PossessionState } from './types'

export type OwnedFormat = 'physical' | 'ebook' | 'audiobook'

/** The four-state possession WORD, in the order the selector offers it. A view over five flags. */
export const POSSESSION_STATES: readonly PossessionState[] = [
  'owned',
  'borrowed',
  'wishlist',
  'unset',
]

export const emptyOwned = (): Owned => ({ physical: false, ebook: false, audiobook: false })

/** Owned in any format? (format detail only — possession itself is the flags below) */
export const isOwned = (o: Owned): boolean => o.physical !== false || o.ebook || o.audiobook

/** Strict ownership — the reader OWNS a copy. The gate for collection stats that speak of what you
 *  own (never borrowed). Distinct from possession (see isPossessed). */
export const isOwnedBook = (b: Pick<Book, 'ownership'>): boolean => b.ownership === 'owned'

/** In the reader's hands — owns a copy OR has one borrowed. This is what "having" a book means for
 *  the format detail and the default library: a borrowed book is a book you can record the format
 *  of and see on your shelves, even though you don't own it.
 *
 *  Rekeyed by the shelf model: the question used to be "which enum value", and is now "does either
 *  in-hand signal hold". Same set of books, derived from independent flags instead of one slot —
 *  which is what lets a book be owned AND borrowed at once. */
export const isPossessed = (b: Pick<Book, 'ownership' | 'borrowed'>): boolean =>
  b.ownership === 'owned' || b.borrowed

/** Wants a copy. Independent of possession — an owned book can still be wanted in another edition. */
export const isWanted = (b: Pick<Book, 'wishlist'>): boolean => b.wishlist

/** The list of owned formats, for the icon row and smart shelves. */
export function ownedFormats(o: Owned): OwnedFormat[] {
  const out: OwnedFormat[] = []
  if (o.physical !== false) out.push('physical')
  if (o.ebook) out.push('ebook')
  if (o.audiobook) out.push('audiobook')
  return out
}

/** Book-level format detail. Losing possession SUPPRESSES the flags rather than clearing them —
 *  they stay latent on the record so possess → drop → re-possess loses nothing. This gate is what
 *  keeps latent flags out of every surface: a book that is neither owned nor borrowed has NO
 *  formats, whatever its flags say. A BORROWED book keeps its format (the reader wants to record
 *  the type of a book they read but don't own). Read formats through this, not ownedFormats,
 *  wherever a whole Book is in hand. */
export function bookOwnedFormats(b: Pick<Book, 'ownership' | 'borrowed' | 'owned'>): OwnedFormat[] {
  return isPossessed(b) ? ownedFormats(b.owned) : []
}

/** The one possession word for a book, for controls and badges that must show a single answer.
 *  Precedence owned > borrowed > wishlist > unset — the order the four-state enum ranked in, so
 *  every surface that used to read the enum reads the same word for the same book. Lossy BY DESIGN
 *  (a book both owned and wanted reads as 'owned'); storage keeps both, this is only the label. */
export function possessionState(
  b: Pick<Book, 'ownership' | 'borrowed' | 'wishlist'>,
): PossessionState {
  if (b.ownership === 'owned') return 'owned'
  if (b.borrowed) return 'borrowed'
  if (b.wishlist) return 'wishlist'
  return 'unset'
}

/** The canonical flag combination a four-state control writes when the reader picks one word. The
 *  inverse of possessionState for the states it can express: choosing a word is an exclusive
 *  statement ("this book is borrowed"), so it clears the others. Code that means to ADD a signal
 *  without disturbing the rest sets the flag directly instead of going through this. */
export function possessionPatch(
  s: PossessionState,
): Pick<Book, 'ownership' | 'borrowed' | 'wishlist'> {
  switch (s) {
    case 'owned':
      return { ownership: 'owned', borrowed: false, wishlist: false }
    case 'borrowed':
      return { ownership: 'unowned', borrowed: true, wishlist: false }
    case 'wishlist':
      return { ownership: 'unowned', borrowed: false, wishlist: true }
    case 'unset':
      return { ownership: 'unowned', borrowed: false, wishlist: false }
  }
}

/** Union the possession signals of records being merged into one. Every flag ORs, uniformly:
 *
 *   · ownership — 'owned' if ANY side owns a copy. A real copy never loses to a non-copy.
 *   · borrowed  — true if either side has one on loan.
 *   · wishlist  — true if either side wants one. Kept even when the merged record is owned or
 *                 borrowed, exactly like borrowed is kept beside owned.
 *
 *  No rule subtracts. Merging catalogue records is DEDUPLICATION, not acquisition: it resolves
 *  "these two rows are the same book", which is not evidence about what the reader has or wants.
 *  An earlier draft cleared `wishlist` when the merge produced a real copy, on the theory that the
 *  want was satisfied — but that silently discards a reader-authored flag on the strength of an
 *  inference, and a stale want is the reader's to clear. `owned + wishlist` keeps both, the same
 *  way `owned + borrowed` does. */
export function mergePossession(
  sides: readonly Pick<Book, 'ownership' | 'borrowed' | 'wishlist'>[],
): Pick<Book, 'ownership' | 'borrowed' | 'wishlist'> {
  const ownership: BookOwnership = sides.some((s) => s.ownership === 'owned') ? 'owned' : 'unowned'
  return {
    ownership,
    borrowed: sides.some((s) => s.borrowed),
    wishlist: sides.some((s) => s.wishlist),
  }
}

/** Human caption for the "Your copies" block of a book IN HAND. `verb` reflects the state
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
