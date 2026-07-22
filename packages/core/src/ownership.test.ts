import { describe, expect, it } from 'vitest'
import {
  bookOwnedFormats,
  isOwned,
  isOwnedBook,
  isPossessed,
  ownedCaption,
  ownedFormats,
  strongerOwnership,
} from './ownership'

describe('ownership', () => {
  it('isOwned is true when any format flag is set', () => {
    expect(isOwned({ physical: false, ebook: false, audiobook: false })).toBe(false)
    expect(isOwned({ physical: 'paperback', ebook: false, audiobook: false })).toBe(true)
    expect(isOwned({ physical: false, ebook: true, audiobook: false })).toBe(true)
  })

  it('lists owned formats and writes a state-aware caption', () => {
    expect(ownedFormats({ physical: false, ebook: true, audiobook: true })).toEqual(['ebook', 'audiobook'])
    expect(ownedCaption({ physical: false, ebook: false, audiobook: false })).toBe('No copies marked yet.')
    expect(ownedCaption({ physical: false, ebook: true, audiobook: true })).toBe(
      'Owned in 2 formats — ebook & audiobook.',
    )
    expect(ownedCaption({ physical: 'hardcover', ebook: false, audiobook: false })).toBe('Owned — hardcover.')
    // a borrowed book records its format without ever reading as "owned"
    expect(ownedCaption({ physical: 'paperback', ebook: false, audiobook: false }, 'Borrowed')).toBe(
      'Borrowed — paperback.',
    )
  })

  it('isOwnedBook is strict (owned only); isPossessed adds borrowed', () => {
    expect(isOwnedBook({ ownership: 'owned' })).toBe(true)
    expect(isOwnedBook({ ownership: 'borrowed' })).toBe(false)
    expect(isOwnedBook({ ownership: 'wishlist' })).toBe(false)
    expect(isOwnedBook({ ownership: 'unset' })).toBe(false)
    expect(isPossessed({ ownership: 'owned' })).toBe(true)
    expect(isPossessed({ ownership: 'borrowed' })).toBe(true)
    expect(isPossessed({ ownership: 'wishlist' })).toBe(false)
    expect(isPossessed({ ownership: 'unset' })).toBe(false)
  })

  it('strongerOwnership resolves duplicates: owned > borrowed > wishlist > unset', () => {
    expect(strongerOwnership('owned', 'wishlist')).toBe('owned')
    expect(strongerOwnership('wishlist', 'owned')).toBe('owned')
    expect(strongerOwnership('borrowed', 'wishlist')).toBe('borrowed')
    expect(strongerOwnership('owned', 'borrowed')).toBe('owned')
    expect(strongerOwnership('unset', 'wishlist')).toBe('wishlist')
  })

  it('a BORROWED book keeps its format — the type of a read-but-not-owned book is recordable', () => {
    const borrowed = { ownership: 'borrowed' as const, owned: { physical: 'paperback' as const, ebook: false, audiobook: false } }
    expect(bookOwnedFormats(borrowed)).toEqual(['physical'])
    // but it is NOT counted as owned by the strict collection scope
    expect(isOwnedBook(borrowed)).toBe(false)
    expect(isPossessed(borrowed)).toBe(true)
  })

  it('latent flags on a wishlist/unset book reach no format shelf', () => {
    const wishlist = { ownership: 'wishlist' as const, owned: { physical: 'hardcover' as const, ebook: true, audiobook: true } }
    const unset = { ownership: 'unset' as const, owned: { physical: 'paperback' as const, ebook: true, audiobook: false } }
    const owned = { ownership: 'owned' as const, owned: { physical: 'paperback' as const, ebook: false, audiobook: false } }
    // every Owned·format shelf filters through bookOwnedFormats — latent flags stay suppressed
    expect(bookOwnedFormats(wishlist)).toEqual([])
    expect(bookOwnedFormats(unset)).toEqual([])
    for (const fmt of ['physical', 'ebook', 'audiobook'] as const) {
      const carriers = [owned, wishlist, unset].filter((b) => bookOwnedFormats(b).includes(fmt)).map((b) => b.ownership)
      expect(carriers).not.toContain('wishlist')
      expect(carriers).not.toContain('unset')
    }
    // an owned book still reads its flags straight through the gate
    expect(bookOwnedFormats(owned)).toEqual(['physical'])
  })
})
