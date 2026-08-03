import { describe, expect, it } from 'vitest'
import {
  bookOwnedFormats,
  isOwned,
  isOwnedBook,
  isPossessed,
  isWanted,
  mergePossession,
  ownedCaption,
  ownedFormats,
  possessionPatch,
  possessionState,
} from './ownership'
import type { Book } from './types'

/** The five possession flags, as the shelf model stores them. Every case below is written as flags
 *  first and checked through the derived word second — the point of the model is that storage is
 *  the flags, and the four-state word is only a view. */
const flags = (
  over: Partial<Pick<Book, 'ownership' | 'borrowed' | 'wishlist' | 'owned'>> = {},
): Pick<Book, 'ownership' | 'borrowed' | 'wishlist' | 'owned'> => ({
  ownership: 'unowned',
  borrowed: false,
  wishlist: false,
  owned: { physical: false, ebook: false, audiobook: false },
  ...over,
})

describe('ownership — format detail', () => {
  it('isOwned is true when any format flag is set', () => {
    expect(isOwned({ physical: false, ebook: false, audiobook: false })).toBe(false)
    expect(isOwned({ physical: 'paperback', ebook: false, audiobook: false })).toBe(true)
    expect(isOwned({ physical: false, ebook: true, audiobook: false })).toBe(true)
  })

  it('lists owned formats and writes a state-aware caption', () => {
    expect(ownedFormats({ physical: false, ebook: true, audiobook: true })).toEqual([
      'ebook',
      'audiobook',
    ])
    expect(ownedCaption({ physical: false, ebook: false, audiobook: false })).toBe(
      'No copies marked yet.',
    )
    expect(ownedCaption({ physical: false, ebook: true, audiobook: true })).toBe(
      'Owned in 2 formats — ebook & audiobook.',
    )
    expect(ownedCaption({ physical: 'hardcover', ebook: false, audiobook: false })).toBe(
      'Owned — hardcover.',
    )
    // a borrowed book records its format without ever reading as "owned"
    expect(
      ownedCaption({ physical: 'paperback', ebook: false, audiobook: false }, 'Borrowed'),
    ).toBe('Borrowed — paperback.')
  })
})

describe('ownership — the five independent flags', () => {
  it('isOwnedBook is strict (owns a copy); isPossessed adds borrowed; isWanted is separate', () => {
    const owned = flags({ ownership: 'owned' })
    const borrowed = flags({ borrowed: true })
    const wanted = flags({ wishlist: true })
    const bare = flags()

    expect([owned, borrowed, wanted, bare].map(isOwnedBook)).toEqual([true, false, false, false])
    expect([owned, borrowed, wanted, bare].map(isPossessed)).toEqual([true, true, false, false])
    expect([owned, borrowed, wanted, bare].map(isWanted)).toEqual([false, false, true, false])
  })

  it('the flags genuinely co-occur — every combination is representable', () => {
    // The whole reason possession left the enum: these three books had NO representation before,
    // because one slot cannot hold two answers.
    const ownedAndBorrowed = flags({ ownership: 'owned', borrowed: true })
    const ownedAndWanted = flags({ ownership: 'owned', wishlist: true })
    const all = flags({ ownership: 'owned', borrowed: true, wishlist: true })

    expect(isOwnedBook(ownedAndBorrowed) && isPossessed(ownedAndBorrowed)).toBe(true)
    expect(isOwnedBook(ownedAndWanted) && isWanted(ownedAndWanted)).toBe(true)
    expect([isOwnedBook(all), isPossessed(all), isWanted(all)]).toEqual([true, true, true])
  })
})

describe('ownership — the derived four-state word', () => {
  it('reads one word per book, owned > borrowed > wishlist > unset', () => {
    expect(possessionState(flags({ ownership: 'owned' }))).toBe('owned')
    expect(possessionState(flags({ borrowed: true }))).toBe('borrowed')
    expect(possessionState(flags({ wishlist: true }))).toBe('wishlist')
    expect(possessionState(flags())).toBe('unset')
  })

  it('a book carrying several signals reads as the strongest — the word is lossy, storage is not', () => {
    const ownedAndWanted = flags({ ownership: 'owned', wishlist: true })
    expect(possessionState(ownedAndWanted)).toBe('owned')
    // the want is still there for anything that asks the flag directly
    expect(isWanted(ownedAndWanted)).toBe(true)

    const borrowedAndWanted = flags({ borrowed: true, wishlist: true })
    expect(possessionState(borrowedAndWanted)).toBe('borrowed')
    expect(isWanted(borrowedAndWanted)).toBe(true)
  })

  it('possessionPatch round-trips every word, and picking one word clears the others', () => {
    for (const s of ['owned', 'borrowed', 'wishlist', 'unset'] as const) {
      expect(possessionState(possessionPatch(s))).toBe(s)
    }
    // exclusive by construction: writing 'borrowed' over an owned+wanted book drops both signals,
    // which is what a radio control has always done.
    expect(possessionPatch('borrowed')).toEqual({
      ownership: 'unowned',
      borrowed: true,
      wishlist: false,
    })
    expect(possessionPatch('unset')).toEqual({
      ownership: 'unowned',
      borrowed: false,
      wishlist: false,
    })
  })
})

describe('ownership — suppress, never clear', () => {
  it('a BORROWED book keeps its format — the type of a read-but-not-owned book is recordable', () => {
    const borrowed = flags({
      borrowed: true,
      owned: { physical: 'paperback', ebook: false, audiobook: false },
    })
    expect(bookOwnedFormats(borrowed)).toEqual(['physical'])
    // but it is NOT counted as owned by the strict collection scope
    expect(isOwnedBook(borrowed)).toBe(false)
    expect(isPossessed(borrowed)).toBe(true)
  })

  it('latent flags on a book not in hand reach no format shelf', () => {
    const wanted = flags({
      wishlist: true,
      owned: { physical: 'hardcover', ebook: true, audiobook: true },
    })
    const bare = flags({ owned: { physical: 'paperback', ebook: true, audiobook: false } })
    const owned = flags({
      ownership: 'owned',
      owned: { physical: 'paperback', ebook: false, audiobook: false },
    })

    // every Owned·format shelf filters through bookOwnedFormats — latent flags stay suppressed
    expect(bookOwnedFormats(wanted)).toEqual([])
    expect(bookOwnedFormats(bare)).toEqual([])
    for (const fmt of ['physical', 'ebook', 'audiobook'] as const) {
      const carriers = [owned, wanted, bare]
        .filter((b) => bookOwnedFormats(b).includes(fmt))
        .map(possessionState)
      expect(carriers).not.toContain('wishlist')
      expect(carriers).not.toContain('unset')
    }
    // an owned book still reads its flags straight through the gate
    expect(bookOwnedFormats(owned)).toEqual(['physical'])
  })

  it('dropping possession SUPPRESSES the formats; re-acquiring restores them untouched', () => {
    // The property the model promises and no test asserted before: the round trip is lossless.
    const marked = { physical: 'hardcover' as const, ebook: true, audiobook: false }
    const held = flags({ ownership: 'owned', owned: marked })
    expect(bookOwnedFormats(held)).toEqual(['physical', 'ebook'])

    const dropped = { ...held, ...possessionPatch('unset') }
    expect(bookOwnedFormats(dropped)).toEqual([])
    expect(dropped.owned).toEqual(marked) // still on the record, just unreadable

    const reacquired = { ...dropped, ...possessionPatch('owned') }
    expect(bookOwnedFormats(reacquired)).toEqual(['physical', 'ebook'])
  })
})

describe('ownership — merging possession across duplicate copies', () => {
  /** Every representable possession combination: 2 ownership values x borrowed x wishlist. */
  const COMBOS: Pick<Book, 'ownership' | 'borrowed' | 'wishlist'>[] = (
    ['owned', 'unowned'] as const
  ).flatMap((ownership) =>
    [false, true].flatMap((borrowed) =>
      [false, true].map((wishlist) => ({ ownership, borrowed, wishlist })),
    ),
  )

  it('carries every signal either side asserted, and invents none', () => {
    // The union rule stated as a property, over all 64 ordered pairs: a merge may only ADD. It is
    // deduplication — it decides that two rows describe one book, which is not evidence about what
    // the reader has or wants, so it has no standing to clear anything.
    for (const a of COMBOS) {
      for (const b of COMBOS) {
        const m = mergePossession([a, b])
        const label = `${JSON.stringify(a)} + ${JSON.stringify(b)}`

        // preserved
        if (a.ownership === 'owned' || b.ownership === 'owned')
          expect(m.ownership, label).toBe('owned')
        if (a.borrowed || b.borrowed) expect(m.borrowed, label).toBe(true)
        if (a.wishlist || b.wishlist) expect(m.wishlist, label).toBe(true)

        // not invented
        if (a.ownership !== 'owned' && b.ownership !== 'owned')
          expect(m.ownership, label).toBe('unowned')
        if (!a.borrowed && !b.borrowed) expect(m.borrowed, label).toBe(false)
        if (!a.wishlist && !b.wishlist) expect(m.wishlist, label).toBe(false)
      }
    }
  })

  it('owned + wishlist keeps BOTH — a want is not cancelled by the copy it merged with', () => {
    // The case where this rule departs from the four-state model, which resolved the pair to a
    // single 'owned' and dropped the want. Clearing a reader-authored flag on the inference that
    // the merge satisfied it is a silent loss; a stale want is the reader's to clear.
    const merged = mergePossession([possessionPatch('owned'), possessionPatch('wishlist')])
    expect(merged).toEqual({ ownership: 'owned', borrowed: false, wishlist: true })
    // it reads as 'owned' — precedence decides the WORD, and the want survives underneath it
    expect(possessionState(merged)).toBe('owned')
    expect(isWanted(merged)).toBe(true)
  })

  it('owned + borrowed keeps both, the same way', () => {
    const merged = mergePossession([possessionPatch('owned'), possessionPatch('borrowed')])
    expect(merged).toEqual({ ownership: 'owned', borrowed: true, wishlist: false })
    expect(possessionState(merged)).toBe('owned')
  })

  it('a want with nothing to merge against survives untouched', () => {
    expect(mergePossession([possessionPatch('wishlist'), possessionPatch('unset')])).toEqual({
      ownership: 'unowned',
      borrowed: false,
      wishlist: true,
    })
  })

  it('merging duplicates that claim nothing still claims nothing', () => {
    expect(mergePossession([possessionPatch('unset'), possessionPatch('unset')])).toEqual({
      ownership: 'unowned',
      borrowed: false,
      wishlist: false,
    })
  })
})
