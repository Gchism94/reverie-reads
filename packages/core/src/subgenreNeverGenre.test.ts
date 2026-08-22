import { describe, expect, it } from 'vitest'
import {
  CORE_GENRES,
  SUBGENRE_PRIMARY_GENRE,
  inferGenreFromSubgenre,
  isCoreGenreValue,
  normalizeImportGenres,
  withoutGenres,
} from './genreNormalize'

/**
 * OWNER RULING: a subgenre is exactly one layer below genre, so a core genre is never a subgenre.
 *
 * Keyed off CORE_GENRES itself, not a hand-copied list — the taxonomy is data, and a guard that
 * restates it drifts the first time a genre is added or renamed. A tenth genre makes these
 * assertions cover it immediately, with nothing to remember.
 */
describe('no core genre appears as a subgenre', () => {
  it('CORE_GENRES is non-empty and is what these assertions read', () => {
    // Without this, every loop below passes vacuously if the registry ever came back empty.
    expect(CORE_GENRES.length).toBeGreaterThan(0)
    expect(CORE_GENRES).toContain('Romance')
  })

  it('no SUBGENRE_PRIMARY_GENRE key is a core genre', () => {
    // The inference map: a genre has no parent to infer, so its presence here is the mis-filing.
    // `romance: 'romance'` was here, and it is why books carry subgenre='romance'.
    const offenders = Object.keys(SUBGENRE_PRIMARY_GENRE).filter((k) => isCoreGenreValue(k))
    expect(offenders).toEqual([])
  })

  it('no core genre can be inferred from itself', () => {
    for (const g of CORE_GENRES) expect(inferGenreFromSubgenre(g), g).toBeNull()
  })
})

describe('isCoreGenreValue matches identity, not resolution', () => {
  it('accepts every core genre in any casing, with surrounding space', () => {
    for (const g of CORE_GENRES) {
      expect(isCoreGenreValue(g), g).toBe(true)
      expect(isCoreGenreValue(g.toUpperCase()), g).toBe(true)
      expect(isCoreGenreValue(`  ${g.toLowerCase()}  `), g).toBe(true)
    }
  })

  it('does NOT flag a genuine subgenre that merely RESOLVES to a core genre', () => {
    // The distinction this whole guard turns on, and the reason it does not use `genreKey`:
    // 'Thriller' is collapsed into Mystery for want of a Thriller skin, and 'Historical' maps to
    // Literary while staying a descriptive tag. Both are one layer BELOW their parent — subgenres,
    // exactly as the ruling requires. A genreKey-based check would call all of these violations.
    for (const v of [
      'Thriller',
      'Crime',
      'Historical',
      'Short Stories',
      'Dark Romance',
      'Romantasy',
    ])
      expect(isCoreGenreValue(v), v).toBe(false)
  })

  it('is not fooled by the empty string', () => {
    expect(isCoreGenreValue('')).toBe(false)
    expect(isCoreGenreValue('   ')).toBe(false)
  })

  it('withoutGenres strips genres and keeps real subgenres, in order', () => {
    expect(withoutGenres(['Dark Romance', 'Romance', 'Romantasy'])).toEqual([
      'Dark Romance',
      'Romantasy',
    ])
    expect(withoutGenres(CORE_GENRES.map(String))).toEqual([])
  })
})

describe('the import path names the genre instead of demoting the subgenre to a tag', () => {
  it('"Dark Romance" in the genre column sets Romance + the subgenre, not just a tag', () => {
    const r = normalizeImportGenres('Dark Romance')
    expect(r.genre).toBe('Romance')
    expect(r.genres).toEqual(['Romance'])
    expect(r.subgenre).toBe('Dark Romance')
    // The tag is KEPT — see the LITERARY_DESCRIPTIVE precedent this follows. Tags feed search and
    // bookTropeNames' fallback, so dropping it would silently change what the book matches.
    expect(r.tags).toContain('dark romance')
  })

  it('no longer reports a known subgenre as an unmapped genre', () => {
    // Before, "Dark Romance" mapped to no core genre and was flagged for import review. It maps now.
    expect(normalizeImportGenres('Dark Romance').unmappedGenre).toBeNull()
    // …while something genuinely unrecognized still is.
    expect(normalizeImportGenres('Gaslamp Whimsy').unmappedGenre).toBe('Gaslamp Whimsy')
  })

  it('a core genre in the genre column is still a GENRE, never a subgenre', () => {
    const r = normalizeImportGenres('Romance')
    expect(r.genres).toEqual(['Romance'])
    expect(r.subgenre).toBeNull()
    expect(r.subgenres).toEqual([])
  })

  it('carries several subgenres, first as the primary, deduped case-insensitively', () => {
    const r = normalizeImportGenres('Dark Romance; Space Opera; dark romance')
    expect(r.subgenre).toBe('Dark Romance')
    expect(r.subgenres).toEqual(['Dark Romance', 'Space Opera'])
    expect(r.genres).toEqual(['Romance', 'Science fiction'])
  })

  it('a shared subgenre stays a tag — the taxonomy refuses to guess, and so does this', () => {
    // Romantasy is under both Romance and Fantasy, so SUBGENRE_PRIMARY_GENRE deliberately omits it.
    // Nothing here may invent a parent it declined to name.
    const r = normalizeImportGenres('Romantasy')
    expect(r.genres).toEqual([])
    expect(r.subgenre).toBeNull()
    expect(r.tags).toContain('romantasy')
  })

  it('the tags column is unchanged — a subgenre there is still just a tag', () => {
    // Only the GENRE column names a genre. A subgenre in the tags column stays descriptive, or
    // every tag would start rewriting the book's genre.
    const r = normalizeImportGenres('', 'Dark Romance')
    expect(r.genres).toEqual([])
    expect(r.subgenre).toBeNull()
    expect(r.tags).toContain('dark romance')
  })
})
