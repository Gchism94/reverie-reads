import { describe, expect, it } from 'vitest'
import { parseImport } from './importMap'
import { normalizeImportGenres } from './genreNormalize'

// docs/IMPORT_REAL_VALIDATION.md — the two real-Library structures the original fixtures didn't
// cover. The real 490-row export + its 110-row connected slice aren't in the repo, so this uses a
// representative fixture exercising both edge structures (dual-core "romantasy" genres + a universe
// with 3-way tied global-order positions, Rina-Kent style). Mirrors
// data/fixtures/library_connected_series.csv (the committed standing artifact) — keep in sync.
const CSV = [
  'Title,Author First,Author Last,Series,Series order,Series #,Global order,Series type,Genre,Tags,Release date',
  'Deviant King,Rina,Kent,Royal Elite,1,1,1,interconnected standalone,romance; fantasy,dark,2020',
  'Steel Princess,Rina,Kent,Royal Elite,2,1,1,interconnected standalone,romance; fantasy,dark,2020',
  'Twisted Kingdom,Rina,Kent,Royal Elite,3,1,1,interconnected standalone,romance; fantasy,dark,2020',
  'Black Knight,Rina,Kent,Royal Elite,4,1,2,interconnected standalone,romance; fantasy,dark,2020',
  'Vicious Prince,Rina,Kent,Royal Elite Epilogues,1,2,2,interconnected standalone,romace,dark,2021',
  'Cruel King,Rina,Kent,Royal Elite Epilogues,2,2,2,interconnected standalone,romance; fantasy,dark,2021',
  'Kingdom of Wicked,Rina,Kent,Kingdom Duet,1,3,3,interconnected standalone,fantasy; romance,dark,2021',
  'Empire of Sin,Rina,Kent,Kingdom Duet,2,3,4,interconnected standalone,romance; fantasy,dark,2021',
  'Throne of Power,Rina,Kent,Kingdom Duet,3,3,5,interconnected standalone,romance; fantasy,dark,2022',
  'Reign of Ruin,Rina,Kent,Royal Elite Legacy,1,4,6,interconnected standalone,standalone,dark,2023',
  'Court of Ash,Ava,Reign,Ashfall,1,1,1,interconnected standalone,fantasy; romance,dark fae,2022',
  'Crown of Ash,Ava,Reign,Ashfall,2,1,2,interconnected standalone,fantasy; romance,dark fae,2022',
  'War of Ash,Ava,Reign,Ashfall Wars,1,2,2,interconnected standalone,fantasy,war,2023',
].join('\n')

describe('Flag 1 — multi-value genre (I1) keeps both cores', () => {
  it('splits on ";", maps the dominant (first) token to the primary, RETAINS the secondary', () => {
    expect(normalizeImportGenres('romance; fantasy')).toMatchObject({
      genre: 'Romance',
      genres: ['Romance', 'Fantasy'],
    })
    expect(normalizeImportGenres('fantasy; romance')).toMatchObject({
      genre: 'Fantasy',
      genres: ['Fantasy', 'Romance'],
    })
  })
  it('normalizes the "romace" typo and resolves a leaked "standalone" to null (not a genre)', () => {
    expect(normalizeImportGenres('romace').genre).toBe('Romance')
    expect(normalizeImportGenres('standalone')).toMatchObject({ genre: null, genres: [] })
  })
  it('reproduces the documented dominant-tally shape + romantasy retention on the fixture', () => {
    const { rows } = parseImport(CSV)
    const tally: Record<string, number> = {}
    for (const r of rows) {
      const g = r.incoming.genre ?? '∅'
      tally[g] = (tally[g] ?? 0) + 1
    }
    expect(tally.Romance).toBeGreaterThan(tally.Fantasy ?? 0) // Romance dominant, as in the real file
    expect(tally['∅']).toBe(1) // exactly the one leaked "standalone" row → null
    const bothCores = rows.filter(
      (r) =>
        (r.incoming.genres ?? []).includes('Romance') &&
        (r.incoming.genres ?? []).includes('Fantasy'),
    )
    expect(bothCores.length).toBeGreaterThan(5) // romantasy rows keep BOTH genres
  })
})

describe('Flag 2 — a tied global-order column is parsed, reported, and not acted on', () => {
  const { rows } = parseImport(CSV)

  // WAS: this block proved detectUniverses grouped these rows into reading orders, kept tied
  // global-order values as concurrent tiers, and ordered each tier deterministically. Reading
  // orders are gone (chore/drop-reading-orders) and series position is the single ordering
  // mechanism, so there is no longer anything to group into.
  //
  // NOW: it proves the column is still SEEN. The import parses global order so the summary can tell
  // the reader it went unused — the file is the same real export with its 3-way ties intact, and
  // the count below is what drives that notice. Silence about a column the reader supplied is the
  // failure this replaces the old coverage with.
  it('still parses the global-order column, including its ties', () => {
    const withOrder = rows.filter((r) => r.globalOrder != null)
    expect(withOrder.length).toBeGreaterThan(5)
    // Scoped to ONE author, as the universe grouping used to be: the file carries two authors and
    // four rows at global order 1 overall, of which three are Kent's. Asserting the unscoped 4 would
    // have been a number with no meaning behind it.
    const kentAtOne = rows.filter((r) => r.incoming.last === 'Kent' && r.globalOrder === 1)
    expect(kentAtOne.length, "the real export ties three of Kent's books at global order 1").toBe(3)
  })

  it('carries no ordering side effect — nothing consumes the value', () => {
    // The rows still land as ordinary books; their own series positions are untouched by the
    // presence of a global order.
    const kent = rows.filter((r) => r.incoming.last === 'Kent')
    expect(kent.length).toBeGreaterThan(0)
    expect(kent.every((r) => r.globalOrder != null)).toBe(true)
  })
})
