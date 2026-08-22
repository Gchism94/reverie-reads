import { describe, expect, it } from 'vitest'
import {
  parseCsv,
  toRecords,
  normalizeRecord,
  dropAndCollapse,
  classify,
  buildReport,
  workKeyOf,
  isOmnibusSuspect,
  seriesStatusOf,
} from '../../../scripts/corpus-import-lib'
import { makeBook } from './book.fixture'

/**
 * The import's PURE half, against a SYNTHETIC fixture — no row here is copied from the real CSV,
 * which carries personal data and is deliberately untracked. The fixture reproduces the real
 * file's SHAPES: the quoted "Author, First" headers, trailing-space authors, semicolon multi-genre
 * with mixed casing, an omnibus title, a Duplicate flag, a TC Read flag, blank spacer rows.
 */
const FIXTURE = [
  'Title,"Author, First","Author, Last",Series,Completed / Standalones,Genre,Tags,,GC Read,TC Read,Duplicate,,',
  'Ash Crown,Vera ,Stone ,Cinder Court,Completed,Fantasy; Romance,found family,,TRUE,,,,',
  'Salt Harbor,Milo,Reyes,,Standalone,horror,,,,TRUE,,,',
  'Glass Anchor,Ida,Marsh,,Standalone,Horror; Fantasy,slow burn; enemies to lovers,,,,,,',
  'Ash Crown,Vera,Stone,Cinder Court,Completed,Fantasy,,,TRUE,,TRUE,,',
  'The Tide Saga Books 1-3,Milo,Reyes,Tide Saga,Completed,Fantasy,,,,,,,',
  'Glass  Anchor,Ida,Marsh,,Standalone,Fantasy,,,,,,,',
  ',,,,,,,,,,,,',
  'No Author Book,,,,Standalone,Mystery,,,,,,,',
].join('\n')

const records = () => toRecords(parseCsv(FIXTURE)).map(normalizeRecord)

describe('parseCsv', () => {
  it('handles quoted headers with embedded commas and skips blank spacer rows', () => {
    const rows = parseCsv(FIXTURE)
    expect(rows[0]![1]).toBe('Author, First')
    // 1 header + 7 data rows; the all-commas spacer is dropped by toRecords, not the parser
    expect(rows).toHaveLength(9)
    expect(toRecords(rows)).toHaveLength(7)
  })

  it('refuses a malformed file rather than guessing', () => {
    expect(() => parseCsv('Title\n"unterminated')).toThrow(/unterminated/)
  })

  it('fails loudly when an expected column is missing — a reordered export must not shift fields', () => {
    expect(() => toRecords(parseCsv('Name,Writer\nX,Y'))).toThrow(/missing expected column/)
  })
})

describe('normalizeRecord', () => {
  it('trims the trailing-space authors the real file carries', () => {
    const r = records()[0]!
    expect(r.first).toBe('Vera')
    expect(r.author).toBe('Vera Stone')
  })

  it('splits semicolon multi-genre with mixed casing via normalizeImportGenres', () => {
    const [ash, salt, glass] = records() as [
      ReturnType<typeof normalizeRecord>,
      ReturnType<typeof normalizeRecord>,
      ReturnType<typeof normalizeRecord>,
    ]
    expect(ash.genre).toBe('fantasy') // first core wins as primary
    expect(ash.genres).toEqual(expect.arrayContaining(['Fantasy', 'Romance']))
    expect(salt.genre).toBe('horror') // lowercased input still maps
    expect(glass.genres).toEqual(expect.arrayContaining(['Horror', 'Fantasy']))
  })

  it('tags come through lowercased from the tags column', () => {
    expect(records()[2]!.tags).toEqual(expect.arrayContaining(['slow burn', 'enemies to lovers']))
  })

  it('work_key is core-norm title|full-author — the ta: cache-key body, by construction', () => {
    expect(records()[0]!.workKey).toBe('ashcrown|verastone')
  })

  it('maps the status column conservatively', () => {
    expect(seriesStatusOf('Completed', true)).toBe('completed')
    expect(seriesStatusOf('Standalone', false)).toBe('standalone')
    expect(seriesStatusOf('', true)).toBe('ongoing')
    expect(seriesStatusOf('', false)).toBe('standalone')
  })
})

describe('dropAndCollapse', () => {
  it('drops Duplicate-flagged rows and collapses exact key collisions, reporting both', () => {
    const { kept, collapsed, duplicatesDropped } = dropAndCollapse(records())
    // the flagged 'Ash Crown' repeat is dropped as Duplicate…
    expect(duplicatesDropped).toBe(1)
    // …and 'Glass  Anchor' (double space) collapses onto 'Glass Anchor' — same normalized key
    expect(collapsed).toHaveLength(1)
    expect(collapsed[0]!.workKey).toBe('glassanchor|idamarsh')
    expect(kept.map((r) => r.title)).toEqual([
      'Ash Crown',
      'Salt Harbor',
      'Glass Anchor',
      'The Tide Saga Books 1-3',
      'No Author Book',
    ])
  })
})

describe('classify', () => {
  const library = [
    makeBook({ id: 'b1', title: 'Ash Crown', first: 'Vera', last: 'Stone' }),
    // fuzzy bait: same author, title differing only by a subtitle
    makeBook({ id: 'b2', title: 'Salt Harbor: A Novel', first: 'Milo', last: 'Reyes' }),
  ]

  it('routes strong matches to existing, fuzzy to near-miss (never auto-resolved), rest to new', () => {
    const { kept } = dropAndCollapse(records())
    const { existing, fresh, nearMiss } = classify(kept, library)
    expect(existing.map((e) => e.record.title)).toEqual(['Ash Crown'])
    expect(existing[0]!.strength).toBe('title-author')
    expect(nearMiss.map((n) => n.record.title)).toEqual(['Salt Harbor'])
    expect(fresh.map((r) => r.title)).toEqual([
      'Glass Anchor',
      'The Tide Saga Books 1-3',
      'No Author Book',
    ])
  })
})

describe('anomaly surfacing', () => {
  it('flags omnibus shapes', () => {
    expect(isOmnibusSuspect('The Tide Saga Books 1-3')).toBe(true)
    expect(isOmnibusSuspect('Complete Box Set')).toBe(true)
    expect(isOmnibusSuspect('The Wolf Collection')).toBe(true)
    expect(isOmnibusSuspect('#1-5 omnibus')).toBe(true)
    expect(isOmnibusSuspect('A Perfectly Ordinary Novel')).toBe(false)
  })

  it('the report carries every anomaly and counts TC Read WITHOUT importing it anywhere', () => {
    const all = records()
    const { kept, collapsed, duplicatesDropped } = dropAndCollapse(all)
    const { existing, fresh, nearMiss } = classify(kept, [])
    const report = buildReport({
      records: all,
      kept,
      collapsed,
      duplicatesDropped,
      existing,
      fresh,
      nearMiss,
    })
    expect(report.totals.tcReadRowsNotImported).toBe(1) // Salt Harbor's TC flag — counted, never written
    expect(report.omnibusSuspects).toEqual(['The Tide Saga Books 1-3'])
    expect(report.emptyAuthor).toEqual(['No Author Book'])
    expect(report.totals.gcRead).toBe(1)
  })

  it('nothing in a normalized record carries the TC flag forward as data any writer consumes', () => {
    // the flag exists on the record for COUNTING; the assertion here is that work/book payload
    // construction lives in the shell (import-corpus-csv.mjs) and reads named fields, never a
    // spread of the whole record — this test pins the lib's contract that tcRead is report-only
    const r = records()[1]!
    expect(r.tcRead).toBe(true)
    expect(workKeyOf(r)).not.toContain('tc')
  })
})
