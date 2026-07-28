import { describe, expect, it } from 'vitest'
import { summaryHeadline, summaryNotices } from './importSummaryCopy'
import type { ImportExportResult } from '../data/importLibrary'

const base: ImportExportResult = {
  profile: 'generic',
  added: 40,
  merged: 3,
  review: [],
  ingested: [],
  readingOrders: 0,
  outcomes: [],
  truncatedIsbns: 0,
  bookIds: [],
  extras: {
    tbrPlaced: 0,
    shelvesCreated: [],
    shelved: 0,
    noCover: 0,
    noIsbn: 0,
    unplacedNotes: 0,
    tropeLikeShelves: [],
  },
}
const withExtras = (e: Partial<ImportExportResult['extras']>): ImportExportResult => ({
  ...base,
  extras: { ...base.extras, ...e },
})

describe('ImportSummary copy', () => {
  it('headline states what the import did', () => {
    expect(summaryHeadline(base)).toBe(
      'Detected your generic export — brought in 40 new, and folded 3 into what you had.',
    )
    expect(summaryHeadline({ ...base, readingOrders: 2 })).toContain('stitched 2 reading orders')
  })

  it('speaks to the TBR, shelves, missing covers, and unplaced notes — pluralized', () => {
    const lines = summaryNotices(
      withExtras({
        tbrPlaced: 12,
        shelvesCreated: ['Imported TBR', 'Dark Romance', 'Fae'],
        shelved: 60,
        noCover: 142,
        unplacedNotes: 1,
      }),
    )
    expect(lines[0]).toBe('12 to-read books placed on your Imported TBR.')
    expect(lines[1]).toContain('Created 2 shelves from your Goodreads shelves: Dark Romance, Fae.') // TBR excluded
    expect(lines.find((l) => l.includes('142 books came in without a cover'))).toBeTruthy()
    expect(lines.find((l) => l.includes("we'll fetch what we can"))).toBeTruthy()
    expect(lines.find((l) => l.includes('1 review or note couldn'))).toBeTruthy()
  })

  it('notes trope-like shelves without converting, and truncated ISBNs', () => {
    const lines = summaryNotices(withExtras({ tropeLikeShelves: ['Enemies To Lovers'] }))
    expect(
      lines.find((l) => l.includes('look like tropes') && l.includes('kept as shelves')),
    ).toBeTruthy()
    expect(
      summaryNotices({ ...base, truncatedIsbns: 3 }).find((l) =>
        l.includes('3 ISBNs may be missing'),
      ),
    ).toBeTruthy()
  })

  it('is silent when nothing needs saying', () => {
    expect(summaryNotices(base)).toEqual([])
  })

  it('uses singular forms for a single item', () => {
    const lines = summaryNotices(withExtras({ tbrPlaced: 1, noCover: 1 }))
    expect(lines[0]).toBe('1 to-read book placed on your Imported TBR.')
    expect(lines.find((l) => l.startsWith('1 book came in without a cover'))).toBeTruthy()
  })
})
