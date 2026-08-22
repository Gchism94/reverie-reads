import { describe, expect, it } from 'vitest'
import { CORE_GENRES, isCoreGenreValue } from '@reverie/core'
import {
  GENRE_SUBGENRES,
  NEUTRAL_SUBGENRE,
  subgenresForGenre,
  otherGenreSubgenres,
} from './constants'
import { toBookRow } from '../data/mappers'

/**
 * The web half of the subgenre-never-a-genre ruling. The core half (the inference map, the import
 * path) is packages/core/src/subgenreNeverGenre.test.ts; GENRE_SUBGENRES and the write boundary
 * live here, so this is where they can be read.
 *
 * Keyed off CORE_GENRES, never a copied list.
 */
describe('the offered taxonomy contains no genre', () => {
  it('sees the registry it is asserting over', () => {
    expect(Object.keys(GENRE_SUBGENRES).length).toBeGreaterThan(0)
    expect(CORE_GENRES.length).toBeGreaterThan(0)
  })

  it('no GENRE_SUBGENRES entry, under any genre, is a core genre', () => {
    // 'Romance' was listed under romance. Offering it is what put it in the data — every book the
    // audit finds got there through a picker that presented it as a valid choice.
    const offenders: string[] = []
    for (const [genre, subs] of Object.entries(GENRE_SUBGENRES))
      for (const s of subs) if (isCoreGenreValue(s)) offenders.push(`${genre} :: ${s}`)
    expect(offenders).toEqual([])
  })

  it('no genre is offered as a subgenre by either picker surface', () => {
    // subgenresForGenre/otherGenreSubgenres are what a reader actually sees; asserting the raw map alone
    // would leave a genre reachable if either of these ever added one back.
    for (const genre of Object.keys(GENRE_SUBGENRES)) {
      for (const s of subgenresForGenre(genre))
        expect(isCoreGenreValue(s), `${genre}: ${s}`).toBe(false)
      for (const s of otherGenreSubgenres(genre))
        expect(isCoreGenreValue(s), `${genre}: ${s}`).toBe(false)
    }
    expect(isCoreGenreValue(NEUTRAL_SUBGENRE)).toBe(false)
  })
})

describe('the write boundary refuses a genre in the subgenre field', () => {
  // Every write goes through toBookRow, which is why the rule is enforced here rather than in a
  // form: a check in one form is one form's check.
  it('drops a core genre sent as `subgenre`, and stores nothing in its place', () => {
    const row = toBookRow({ subgenre: 'Romance' })
    expect(row.subgenre).toBeNull()
    expect(row.subgenres).toEqual([])
  })

  it('drops it whatever the casing', () => {
    for (const v of ['romance', 'ROMANCE', '  Romance  '])
      expect(toBookRow({ subgenre: v }).subgenre, v).toBeNull()
  })

  it('strips genres out of `subgenres[]` while keeping the real subgenres, in order', () => {
    const row = toBookRow({ subgenres: ['Dark Romance', 'Romance', 'Romantasy'] })
    expect(row.subgenres).toEqual(['Dark Romance', 'Romantasy'])
    // The denormalized single follows the surviving list, not the original first element.
    expect(row.subgenre).toBe('Dark Romance')
  })

  it('leaves a legitimate subgenre completely alone', () => {
    const row = toBookRow({ subgenre: 'Dark Romance' })
    expect(row.subgenre).toBe('Dark Romance')
    expect(row.subgenres).toEqual(['Dark Romance'])
  })

  it('does not strip a subgenre that merely RESOLVES to a genre', () => {
    // 'Thriller' is collapsed into Mystery by the import aliases but is a genuine subgenre of it.
    expect(toBookRow({ subgenre: 'Thriller' }).subgenre).toBe('Thriller')
    expect(toBookRow({ subgenre: 'Historical' }).subgenre).toBe('Historical')
  })

  it('a write that sends ONLY a genre for subgenre clears the field rather than half-writing it', () => {
    // subgenre and subgenres[] must stay consistent — a null single beside a populated array is the
    // shape that makes bookSubgenres disagree with itself.
    const row = toBookRow({ subgenres: ['Romance', 'Fantasy'] })
    expect(row.subgenres).toEqual([])
    expect(row.subgenre).toBeNull()
  })
})
