import { describe, expect, it } from 'vitest'
import { CORE_GENRES } from '@reverie/core'
import {
  GENRE_SUBGENRES,
  NEUTRAL_SUBGENRE,
  otherGenreSubgenres,
  subgenresForGenre,
} from './constants'

// The picker's vocabulary was the ONLY thing scoping subgenres to the primary genre — storage is a
// flat, unscoped text[] and both forms already preserve out-of-vocabulary picks across a genre
// switch. So a horror-romance could KEEP a cross-genre pair it already had but could never be given
// one. `otherGenreSubgenres` is the disclosure behind both pickers.

describe('otherGenreSubgenres', () => {
  for (const genre of CORE_GENRES) {
    const key = genre.toLowerCase()

    it(`${key}: the disclosure never repeats what the genre already offers`, () => {
      const own = new Set(subgenresForGenre(key))
      for (const sub of otherGenreSubgenres(key)) {
        expect(own.has(sub), `${sub} appears in both lists for ${key}`).toBe(false)
      }
    })

    it(`${key}: own + other covers the whole vocabulary`, () => {
      const union = new Set([...subgenresForGenre(key), ...otherGenreSubgenres(key)])
      const everything = new Set([...Object.values(GENRE_SUBGENRES).flat(), NEUTRAL_SUBGENRE])
      for (const sub of everything) {
        expect(union.has(sub), `${sub} is reachable from neither list under ${key}`).toBe(true)
      }
    })
  }

  it('is de-duplicated — a subgenre shared by several genres appears once', () => {
    // Romantasy is in both romance and fantasy; from horror it should surface exactly once.
    const other = otherGenreSubgenres('horror')
    expect(other.filter((s) => s === 'Romantasy')).toHaveLength(1)
  })

  it('is sorted, so the disclosure reads as a vocabulary not nine concatenated shelves', () => {
    const other = otherGenreSubgenres('romance')
    expect(other).toEqual([...other].sort((a, b) => a.localeCompare(b)))
  })

  it('offers the cross-genre pairing that motivated this — horror + Dark Romance', () => {
    expect(subgenresForGenre('horror')).not.toContain('Dark Romance')
    expect(otherGenreSubgenres('horror')).toContain('Dark Romance')
  })

  it('an unknown genre still gets the full vocabulary rather than nothing', () => {
    expect(otherGenreSubgenres('not-a-genre').length).toBeGreaterThan(0)
  })
})
