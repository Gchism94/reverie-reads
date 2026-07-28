import { describe, expect, it } from 'vitest'
import { detectUniverses, parseImport, universeInputFromRow } from './importMap'
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

describe('Flag 2 — tied (non-unique) global-order (I3) survives as concurrent tiers', () => {
  const { rows } = parseImport(CSV)
  const universes = detectUniverses(rows.map((r) => universeInputFromRow(r, r.incoming.title)))

  it('groups each author into one universe; a different author is its own universe', () => {
    expect(universes).toHaveLength(2) // Rina Kent + Ava Reign
    expect(universes.find((u) => u.name.startsWith('Royal Elite'))).toBeTruthy()
    expect(universes.find((u) => u.name.startsWith('Ashfall'))).toBeTruthy()
  })
  it('drops NO tied-position book — every connected row is materialized', () => {
    const rina = universes.find((u) => u.name.startsWith('Royal Elite'))!
    const rinaRows = rows.filter((r) => r.incoming.last === 'Kent')
    expect(rina.items).toHaveLength(rinaRows.length) // 10, incl. the two 3-way ties — none collapsed
  })
  it('keeps tied global-order values as repeated positions (no collision / last-write-wins)', () => {
    const rina = universes.find((u) => u.name.startsWith('Royal Elite'))!
    expect(rina.items.filter((i) => i.position === 1)).toHaveLength(3) // three books tied at go 1
    expect(rina.items.filter((i) => i.position === 2)).toHaveLength(3) // three tied at go 2
    const positions = rina.items.map((i) => i.position)
    expect(positions).toEqual([...positions].sort((a, b) => a - b)) // still in global order
  })
  it('orders a tied tier deterministically: series #, then series order, then title (E2)', () => {
    // refs are titles in this fixture (universeInputFromRow(r, r.incoming.title)).
    const rina = universes.find((u) => u.name.startsWith('Royal Elite'))!
    const at = (p: number) => rina.items.filter((i) => i.position === p).map((i) => i.ref)
    // go1: all Royal Elite (series #1) → intrinsic series order 1,2,3.
    expect(at(1)).toEqual(['Deviant King', 'Steel Princess', 'Twisted Kingdom'])
    // go2: Royal Elite #4 (series #1) sorts before the Epilogues (series #2), which then read 1→2.
    expect(at(2)).toEqual(['Black Knight', 'Vicious Prince', 'Cruel King'])
  })
  it('is order-independent — shuffling the input rows yields the identical sequence (E2)', () => {
    const shuffled = [...rows].reverse()
    const u = detectUniverses(shuffled.map((r) => universeInputFromRow(r, r.incoming.title)))
    const rina = u.find((x) => x.name.startsWith('Royal Elite'))!
    expect(rina.items.filter((i) => i.position === 1).map((i) => i.ref)).toEqual([
      'Deviant King',
      'Steel Princess',
      'Twisted Kingdom',
    ])
  })
})
