import { describe, expect, it } from 'vitest'
import { normalizeImportGenres, SPICE_INTENSITY } from './genreNormalize'

// Real distinct genre strings from Chism_Books.xlsx (the "Library" sheet), as extracted.
const CHISM_GENRE_VOCAB = [
  'Horror', 'Fantasy; Romance', 'Romance', 'Fantasy', 'Horror; Fantasy', 'Nonfiction',
  'Romance; Fantasy', 'Fantasy; Horror', 'romance', 'horror', 'Horror; SciFi', 'SciFi',
  'fantasy; romance', 'Fantasy; SciFi', 'Fiction', 'romance; fantasy', 'SciFi; Fantasy',
  'Mystery', 'Poetry', 'SciFi; Horror', 'Thriller', 'Historical Fiction', 'Mystery; Horror',
  'Romance; fantasy', 'fiction', 'historical fiction', 'Scifi', 'Horror; Romance', 'fantasy', 'scifi',
]

const g = (genre: string, tags = '') => normalizeImportGenres(genre, tags)

describe('normalizeImportGenres — primary genre + cores', () => {
  it('maps the canonical genres (case-insensitive)', () => {
    expect(g('Romance').genre).toBe('Romance')
    expect(g('romance').genre).toBe('Romance')
    expect(g('HORROR').genre).toBe('Horror')
    expect(g('Nonfiction').genre).toBe('Nonfiction')
    expect(g('Mystery').genre).toBe('Mystery')
  })
  it('normalizes the real typos/aliases', () => {
    expect(g('romace').genre).toBe('Romance') // Library typo
    expect(g('Fantays').genre).toBe('Fantasy') // Library typo
    expect(g('Fantast').genre).toBe('Fantasy') // Library typo
    expect(g('SciFi').genre).toBe('Sci-Fi')
    expect(g('Scifi').genre).toBe('Sci-Fi')
    expect(g('scifi').genre).toBe('Sci-Fi')
    expect(g('Thriller').genre).toBe('Mystery') // collapsed
  })
  it('keeps the human-stated priority order for multi-genre cells', () => {
    expect(g('Fantasy; Romance').genres).toEqual(['Fantasy', 'Romance'])
    expect(g('Fantasy; Romance').genre).toBe('Fantasy')
    expect(g('Romance; Fantasy').genre).toBe('Romance')
    expect(g('SciFi; Horror').genres).toEqual(['Sci-Fi', 'Horror'])
  })
  it('maps Fiction/Poetry/Historical Fiction → Literary + a descriptive tag', () => {
    expect(g('Fiction')).toMatchObject({ genre: 'Literary', genres: ['Literary'], tags: ['fiction'] })
    expect(g('Poetry')).toMatchObject({ genre: 'Literary', tags: ['poetry'] })
    expect(g('Historical Fiction')).toMatchObject({ genre: 'Literary', tags: ['historical fiction'] })
  })
  it('blank genre stays null with empty arrays', () => {
    expect(g('')).toEqual({ genre: null, genres: [], tags: [], intensity: null })
    expect(g('   ')).toEqual({ genre: null, genres: [], tags: [], intensity: null })
  })
  it('drops non-genre markers like "standalone"', () => {
    expect(g('Romance; standalone').genres).toEqual(['Romance'])
    expect(g('standalone').genre).toBeNull()
  })
})

describe('normalizeImportGenres — the confirmed Chism tally', () => {
  it('the genre column resolves to exactly the expected core set', () => {
    const cores = new Set<string>()
    for (const v of CHISM_GENRE_VOCAB) for (const c of normalizeImportGenres(v).genres) cores.add(c)
    expect([...cores].sort()).toEqual(['Fantasy', 'Horror', 'Literary', 'Mystery', 'Nonfiction', 'Romance', 'Sci-Fi'])
    // No Cozy or YA come from the Chism genre column (they live in tags, if at all).
    expect(cores.has('Cozy')).toBe(false)
    expect(cores.has('YA')).toBe(false)
  })
  it('every real genre string resolves to a primary core (none dropped to null)', () => {
    for (const v of CHISM_GENRE_VOCAB) expect(normalizeImportGenres(v).genre, v).not.toBeNull()
  })
})

describe('normalizeImportGenres — tags + intensity', () => {
  it('tags column: lowercase, split, dedupe; never promoted to a genre', () => {
    expect(g('', 'Dark').tags).toEqual(['dark'])
    expect(g('', 'YA').genre).toBeNull() // YA in the tags column stays a tag, not a genre
    expect(g('', 'YA').tags).toEqual(['ya'])
    expect(g('', 'Dark; Dark Academia; Dark').tags).toEqual(['dark', 'dark academia'])
  })
  it('fixes the stray "dark: spicy" colon and lifts spicy to the intensity signal', () => {
    const r = g('', 'dark: spicy')
    expect(r.tags).toEqual(['dark', 'spicy'])
    expect(r.intensity).toBe(SPICE_INTENSITY)
  })
  it('spice in the genre column also sets intensity + stays a tag', () => {
    const r = g('Romance; spicy')
    expect(r.genre).toBe('Romance')
    expect(r.intensity).toBe(SPICE_INTENSITY)
    expect(r.tags).toContain('spicy')
  })
  it('non-core genre tokens spill into tags', () => {
    expect(g('Romance; Western').tags).toContain('western')
    expect(g('Romance; Western').genres).toEqual(['Romance'])
  })
})

describe('normalizeImportGenres — Library shape vocab', () => {
  it('the Library genre column is overwhelmingly Romance with a little Fantasy', () => {
    // Representative of Library_App_list (Romance 484 / Fantasy 5): aliases + typos all resolve.
    const sample = ['Romance', 'romance', 'romace', 'Romance; standalone', 'Fantasy', 'Fantays', 'Fantast']
    const primaries = new Set(sample.map((s) => normalizeImportGenres(s).genre))
    expect([...primaries].sort()).toEqual(['Fantasy', 'Romance'])
  })
})
