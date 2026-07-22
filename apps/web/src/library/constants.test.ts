import { describe, expect, it } from 'vitest'
import { CORE_GENRES, genreKey, SKINS } from '@reverie/core'
import {
  GENRE_SUBGENRES,
  NEUTRAL_SUBGENRE,
  subgenresForGenre,
  TROPE_GROUPS,
  TROPE_GROUPS_BY_GENRE,
  tropeGroupsForGenre,
  UNIVERSAL_TROPES,
} from './constants'

// The genre-pipeline alignment guard: every pipe that writes a genre (import canon, enrichment's
// mapGenre, the add flow's skin genre) and every consumer that reads one (subgenre picker, trope
// picker) must meet on ONE vocabulary — the nine core genres, lowercased. These tests fail if a
// key drifts on either side.

describe('genre taxonomy alignment', () => {
  const canonicalKeys = CORE_GENRES.map((g) => g.toLowerCase()).sort()

  it('the subgenre and trope taxonomies key exactly the nine core genres', () => {
    expect(Object.keys(GENRE_SUBGENRES).sort()).toEqual(canonicalKeys)
    expect(Object.keys(TROPE_GROUPS_BY_GENRE).sort()).toEqual(canonicalKeys)
  })

  it("every skin's genre reaches its own taxonomy", () => {
    for (const skin of Object.values(SKINS)) {
      const key = genreKey(skin.genre)
      expect(GENRE_SUBGENRES[key], skin.genre).toBeDefined()
      expect(TROPE_GROUPS_BY_GENRE[key], skin.genre).toBeDefined()
    }
  })

  it('legacy stored spellings still land in their genre (not on the fallback)', () => {
    // pre-alignment import canon, legacy enrichment tokens, collapsed genres
    const legacy: Record<string, string> = {
      'Sci-Fi': 'science fiction',
      'science-fiction': 'science fiction',
      YA: 'young adult',
      'young-adult': 'young adult',
      Thriller: 'mystery',
      historical: 'literary',
    }
    for (const [raw, key] of Object.entries(legacy)) {
      const subs = GENRE_SUBGENRES[key]
      expect(subs, key).toBeDefined()
      expect(subgenresForGenre(raw), raw).toEqual([...(subs ?? []), NEUTRAL_SUBGENRE])
      expect(Object.keys(tropeGroupsForGenre(raw)), raw).toEqual(
        Object.keys(tropeGroupsForGenre(key)),
      )
    }
  })

  it('an unknown genre gets the neutral catch-all and the Universal tropes ALONE (never romance)', () => {
    expect(subgenresForGenre('gardening')).toEqual([NEUTRAL_SUBGENRE])
    expect(tropeGroupsForGenre('gardening')).toEqual({ Universal: UNIVERSAL_TROPES })
    expect(tropeGroupsForGenre('')).toEqual({ Universal: UNIVERSAL_TROPES })
  })

  it('romance keeps its founding trope groups verbatim', () => {
    const romance = tropeGroupsForGenre('romance')
    for (const [group, tropes] of Object.entries(TROPE_GROUPS)) {
      expect(romance[group]).toEqual(tropes)
    }
  })
})
