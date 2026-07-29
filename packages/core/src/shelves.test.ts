import { describe, expect, it } from 'vitest'
import { makeBook } from './book.fixture'
import { isBookRead } from './filters'
import {
  deriveShelfSections,
  onReadShelfSplit,
  onUnmarkedShelf,
  visibleSections,
  type ShelfKey,
} from './shelves'
import type { Book } from './types'

const owned = (over: Partial<Book> = {}) =>
  makeBook({ id: 'o', title: 'Owned', ownership: 'owned', readStatus: 'unset', ...over })
const unowned = (over: Partial<Book> = {}) =>
  makeBook({ id: 'u', title: 'Unowned', ownership: 'unowned', readStatus: 'unset', ...over })

/** Flatten to `key -> titles`, which is what a reader would actually see. */
const layout = (books: Book[], format: boolean, dnf: boolean): Record<string, string[]> =>
  Object.fromEntries(
    visibleSections(deriveShelfSections(books, { format, dnf })).flatMap((s) =>
      s.shelves.map((sh) => [sh.key, sh.books.map((b) => b.title)]),
    ),
  )

const keysOf = (books: Book[], format: boolean, dnf: boolean): ShelfKey[] =>
  visibleSections(deriveShelfSections(books, { format, dnf })).flatMap((s) =>
    s.shelves.map((sh) => sh.key),
  )

describe('shelf order', () => {
  it('renders Owned, Borrowed, Read, Wishlist in that order', () => {
    const books = [
      owned({ id: 'a', title: 'A' }),
      unowned({ id: 'b', title: 'B', borrowed: true }),
      unowned({ id: 'c', title: 'C', readStatus: 'Read' }),
      unowned({ id: 'd', title: 'D', wishlist: true }),
    ]
    expect(keysOf(books, false, false)).toEqual(['owned', 'borrowed', 'read', 'wishlist'])
  })
})

describe('the format breakdown', () => {
  const physical = owned({
    id: 'p',
    title: 'Physical',
    owned: { physical: 'paperback', ebook: false, audiobook: false },
  })
  const ebook = owned({
    id: 'e',
    title: 'Ebook',
    owned: { physical: false, ebook: true, audiobook: false },
  })
  const unmarked = owned({ id: 'n', title: 'Unmarked' })

  it('off: one Owned shelf holding everything owned, however it is marked', () => {
    expect(layout([physical, ebook, unmarked], false, false).owned).toEqual([
      'Physical',
      'Ebook',
      'Unmarked',
    ])
  })

  it('on: an owned book with NO format flag lands in the unmarked bucket, not nowhere', () => {
    // The whole reason the bucket exists. On production data this path holds 528 of 536 owned
    // books; without it, turning the toggle on would drop them out of the view entirely.
    const l = layout([physical, ebook, unmarked], true, false)
    expect(l.ownedUnmarked).toEqual(['Unmarked'])
    expect(l.ownedPhysical).toEqual(['Physical'])
    expect(l.ownedEbook).toEqual(['Ebook'])
    expect(l.ownedAudiobook).toBeUndefined() // empty shelves do not render
  })

  it('on: every owned book lands on exactly one shelf of the split', () => {
    // The split must be a partition OF THE OWNED SET even though shelves overall are not.
    const books = [
      physical,
      ebook,
      unmarked,
      owned({
        id: 'm',
        title: 'Multi',
        owned: { physical: 'hardcover', ebook: true, audiobook: false },
      }),
    ]
    const l = layout(books, true, false)
    const appearances = books.map(
      (b) =>
        (['ownedPhysical', 'ownedEbook', 'ownedAudiobook', 'ownedUnmarked'] as const).filter((k) =>
          (l[k] ?? []).includes(b.title),
        ).length,
    )
    // Multi is owned in two formats, so it appears twice — by design. Everything appears at least once.
    expect(appearances.every((n) => n >= 1)).toBe(true)
    expect(appearances[3]).toBe(2)
    // and nothing owned is missing from the split entirely
    const shown = new Set(
      (['ownedPhysical', 'ownedEbook', 'ownedAudiobook', 'ownedUnmarked'] as const).flatMap(
        (k) => l[k] ?? [],
      ),
    )
    for (const b of books) expect(shown.has(b.title), `${b.title} vanished`).toBe(true)
  })

  it('is owned-only: a borrowed ebook is on Borrowed, never on Owned · Ebook', () => {
    const borrowedEbook = unowned({
      id: 'be',
      title: 'Borrowed Ebook',
      borrowed: true,
      owned: { physical: false, ebook: true, audiobook: false },
    })
    const l = layout([borrowedEbook], true, false)
    expect(l.borrowed).toEqual(['Borrowed Ebook'])
    expect(l.ownedEbook).toBeUndefined()
    expect(l.ownedUnmarked).toBeUndefined() // not owned at all, so not in the bucket either
  })

  it('the unmarked bucket never claims a book that is not owned', () => {
    expect(onUnmarkedShelf(unowned({ borrowed: true }))).toBe(false)
    expect(onUnmarkedShelf(unowned({ wishlist: true }))).toBe(false)
  })
})

describe('the DNF breakdown', () => {
  const finished = unowned({ id: 'f', title: 'Finished', readStatus: 'Read' })
  const abandoned = unowned({ id: 'a', title: 'Abandoned', readStatus: 'DNF' })
  /** The case that makes the !isDnf guard load-bearing: abandoned, but with a logged read. */
  const abandonedWithRead = unowned({
    id: 'awr',
    title: 'Abandoned With Read',
    readStatus: 'DNF',
    reads: [{ date: '2026-01-01', format: '', rating: 0, notes: '' }],
  })

  it('off: Read holds abandoned books too', () => {
    expect(layout([finished, abandoned], false, false).read).toEqual(['Finished', 'Abandoned'])
    expect(layout([finished, abandoned], false, false).dnf).toBeUndefined()
  })

  it('on: DNF splits out, and Read keeps only what was finished', () => {
    const l = layout([finished, abandoned], false, true)
    expect(l.read).toEqual(['Finished'])
    expect(l.dnf).toEqual(['Abandoned'])
  })

  it('on: a DNF book WITH a logged read is on DNF and NOT on Read', () => {
    // isBookRead counts a logged read as finishing, so without the !isDnf guard this book lands on
    // both shelves while its cover wears a DNF pill. Production has none of these; this is the
    // fixture that keeps the guard honest.
    expect(isBookRead(abandonedWithRead), 'precondition: isBookRead says true').toBe(true)
    const l = layout([abandonedWithRead], false, true)
    expect(l.dnf).toEqual(['Abandoned With Read'])
    expect(l.read).toBeUndefined()
    expect(onReadShelfSplit(abandonedWithRead)).toBe(false)
  })

  it('does not widen isBookRead — an abandoned book is still not read', () => {
    expect(isBookRead(abandoned)).toBe(false)
    // and the mixed shelf includes it WITHOUT that being a claim about reading
    expect(layout([abandoned], false, false).read).toEqual(['Abandoned'])
  })
})

describe('shelves overlap by design', () => {
  it('an owned + wanted book sits on both Owned and Wishlist', () => {
    const b = owned({ id: 'ow', title: 'Owned And Wanted', wishlist: true })
    const l = layout([b], false, false)
    expect(l.owned).toEqual(['Owned And Wanted'])
    expect(l.wishlist).toEqual(['Owned And Wanted'])
  })

  it('an owned + borrowed book sits on both Owned and Borrowed', () => {
    const b = owned({ id: 'ob', title: 'Owned And Borrowed', borrowed: true })
    const l = layout([b], false, false)
    expect(l.owned).toEqual(['Owned And Borrowed'])
    expect(l.borrowed).toEqual(['Owned And Borrowed'])
  })

  it('counts sum higher than the library, which is why no total is rendered', () => {
    const b = owned({ id: 'x', title: 'X', wishlist: true, readStatus: 'Read' })
    const total = visibleSections(deriveShelfSections([b], { format: false, dnf: false })).reduce(
      (n, s) => n + s.shelves.reduce((m, sh) => m + sh.books.length, 0),
      0,
    )
    expect(total).toBe(3) // one book, three shelves
  })
})

describe('a split section stays labelled even when it collapses to one shelf', () => {
  it('keeps split=true when the Read shelf is empty and only DNF survives', () => {
    // Caught by e2e, fixed here. Inferring "is this split?" from the SURVIVING shelf count says no,
    // which drops the shelf's own heading and files an abandoned book under a section reading
    // "Read". `split` is decided at derivation, so the label survives the collapse.
    const abandoned = unowned({ id: 'a', title: 'Abandoned', readStatus: 'DNF' })
    const [readSection] = visibleSections(
      deriveShelfSections([abandoned], { format: false, dnf: true }),
    ).filter((s) => s.key === 'read')
    expect(readSection).toBeDefined()
    expect(readSection!.shelves.map((sh) => sh.key)).toEqual(['dnf'])
    expect(readSection!.split, 'the section must still know it is split').toBe(true)
  })

  it('keeps split=true when only the unmarked bucket survives the format split', () => {
    const [ownedSection] = visibleSections(
      deriveShelfSections([owned({ id: 'n', title: 'Unmarked' })], { format: true, dnf: false }),
    ).filter((s) => s.key === 'owned')
    expect(ownedSection!.shelves.map((sh) => sh.key)).toEqual(['ownedUnmarked'])
    expect(ownedSection!.split).toBe(true)
  })

  it('an unsplit section reports split=false, so it shows its own count', () => {
    const [ownedSection] = visibleSections(
      deriveShelfSections([owned()], { format: false, dnf: false }),
    ).filter((s) => s.key === 'owned')
    expect(ownedSection!.split).toBe(false)
  })
})

describe('empty shelves collapse', () => {
  it('a shelf with no books does not render', () => {
    expect(keysOf([owned()], false, false)).toEqual(['owned'])
  })

  it('an empty library renders no sections at all, so the caller shows one empty state', () => {
    expect(visibleSections(deriveShelfSections([], { format: false, dnf: false }))).toEqual([])
    expect(visibleSections(deriveShelfSections([], { format: true, dnf: true }))).toEqual([])
  })

  it('a section whose every shelf is empty is dropped with them', () => {
    // Only wishlist books: no Owned, Borrowed or Read section should survive.
    expect(keysOf([unowned({ wishlist: true })], false, false)).toEqual(['wishlist'])
  })
})
