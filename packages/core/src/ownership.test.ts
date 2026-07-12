import { describe, expect, it } from 'vitest'
import { isOwned, ownedCaption, ownedFormats } from './ownership'

describe('ownership', () => {
  it('isOwned is true when any format flag is set', () => {
    expect(isOwned({ physical: false, ebook: false, audiobook: false })).toBe(false)
    expect(isOwned({ physical: 'paperback', ebook: false, audiobook: false })).toBe(true)
    expect(isOwned({ physical: false, ebook: true, audiobook: false })).toBe(true)
  })

  it('lists owned formats and writes a live caption', () => {
    expect(ownedFormats({ physical: false, ebook: true, audiobook: true })).toEqual(['ebook', 'audiobook'])
    expect(ownedCaption({ physical: false, ebook: false, audiobook: false })).toBe(
      'No copies marked yet.',
    )
    expect(ownedCaption({ physical: false, ebook: true, audiobook: true })).toBe(
      'Owned in 2 formats — ebook & audiobook.',
    )
    expect(ownedCaption({ physical: 'hardcover', ebook: false, audiobook: false })).toBe(
      'Owned — hardcover.',
    )
  })
})
