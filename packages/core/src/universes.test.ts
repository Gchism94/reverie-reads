import { describe, expect, it } from 'vitest'
import { detectUniverses, parseImport, universeInputFromRow } from './importMap'

// A real-shaped Library slice for Rina Kent's Royal Elite universe: the entry quartet (global 1),
// then the Kingdom Duet (global 8-10), then the Epilogues novella (global 11). The human order puts
// the epilogues LAST — after the duet — even though, by series position, an "Epilogues #1" would
// sort first. The reading order must preserve the global order exactly.
const ROYAL_ELITE_CSV = [
  'Title,Author First,Author Last,Series,Series order,Series #,Global order,Series type,Genre,Tags,Release date',
  'Deviant King,Rina,Kent,Royal Elite,1,1,1,interconnected standalone,Romance,dark,2020',
  'Kingdom of Wicked,Rina,Kent,Kingdom Duet,1,3,8,interconnected standalone,Romance,dark,2021',
  'Empire of Sin,Rina,Kent,Kingdom Duet,2,3,9,interconnected standalone,Romance,dark,2021',
  'Queen of Vengeance,Rina,Kent,Kingdom Duet,3,3,10,interconnected standalone,Romance,dark,2022',
  'Royal Elite Epilogues,Rina,Kent,Royal Elite Epilogues,1,4,11,interconnected standalone,Romance,dark,2022',
].join('\n')

function universe() {
  const { rows } = parseImport(ROYAL_ELITE_CSV)
  // ref = title, standing in for the post-ingest book id.
  const inputs = rows.map((r) => universeInputFromRow(r, r.incoming.title))
  return { rows, orders: detectUniverses(inputs) }
}

describe('detectUniverses — Royal Elite', () => {
  it('groups the universe into ONE reading order named from the entry series', () => {
    const { orders } = universe()
    expect(orders).toHaveLength(1)
    expect(orders[0]!.name).toBe('Royal Elite — reading order')
  })

  it('lays the books out in the EXACT global order — epilogues after the duet', () => {
    const { orders } = universe()
    const seq = orders[0]!.items.map((i) => i.ref)
    expect(seq).toEqual([
      'Deviant King', // global 1
      'Kingdom of Wicked', // 8
      'Empire of Sin', // 9
      'Queen of Vengeance', // 10
      'Royal Elite Epilogues', // 11 — LAST, not recomputed from its series position
    ])
    // positions are the verbatim global order
    expect(orders[0]!.items.map((i) => i.position)).toEqual([1, 8, 9, 10, 11])
    // the epilogue sits after the whole Kingdom Duet
    const epi = orders[0]!.items.findIndex((i) => i.ref === 'Royal Elite Epilogues')
    const lastDuet = orders[0]!.items.findIndex((i) => i.ref === 'Queen of Vengeance')
    expect(epi).toBeGreaterThan(lastDuet)
  })

  it('keeps each book in its OWN series + intrinsic position (overlay, not replacement)', () => {
    const { rows } = universe()
    const duet = rows.find((r) => r.incoming.title === 'Empire of Sin')!.incoming
    expect(duet.series).toBe('Kingdom Duet')
    expect(duet.position).toBe(2) // its series position, untouched by the universe order
    const epi = rows.find((r) => r.incoming.title === 'Royal Elite Epilogues')!.incoming
    expect(epi.series).toBe('Royal Elite Epilogues')
  })

  it('carries Series # as universe sub-series metadata', () => {
    const { orders } = universe()
    const item = orders[0]!.items.find((i) => i.ref === 'Empire of Sin')!
    expect(item.seriesNumber).toBe(3) // Kingdom Duet = sub-series 3
  })
})

describe('detectUniverses — non-universes', () => {
  it('ignores a lone global-ordered book and books with no global order', () => {
    const csv = [
      'Title,Author First,Author Last,Series,Series order,Series #,Global order,Series type,Genre',
      'Solo Connected,One,Author,World,1,1,1,interconnected standalone,Romance', // lone → not a universe
      'Plain Series,Two,Author,Trilogy,1,,,,Fantasy', // no global order → ignored
    ].join('\n')
    const { rows } = parseImport(csv)
    const orders = detectUniverses(rows.map((r) => universeInputFromRow(r, r.incoming.title)))
    expect(orders).toHaveLength(0)
  })
})
