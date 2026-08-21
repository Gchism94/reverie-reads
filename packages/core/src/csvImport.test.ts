import { describe, expect, it } from 'vitest'
import { matchBook, mergeImport, type Incoming } from './match'
import { parseCsvRows } from './csv'
import type { Book } from './types'
import { makeBook } from './book.fixture'

// Mirrors apps/web data/intake.applyIncoming, but in-memory (no DB) so the matching + merge
// policy can be tested directly, including re-import idempotency.
function runImport(library: Book[], csv: string) {
  const result = { added: 0, merged: 0, review: 0 }
  for (const inc of parseCsvRows(csv).map((r) => r.incoming)) {
    const m = matchBook(inc, library)
    if (m.strength === 'none') {
      library.push(toBook(inc))
      result.added++
    } else if (m.strength === 'fuzzy') {
      result.review++
    } else {
      const { patch, newReads, changed } = mergeImport(m.book, inc)
      if (changed) {
        Object.assign(m.book, patch)
        m.book.reads = [...m.book.reads, ...newReads]
        result.merged++
      }
    }
  }
  return result
}

const toBook = (inc: Incoming): Book =>
  makeBook({
    id: `new-${inc.title}`,
    title: inc.title,
    first: inc.first ?? '',
    last: inc.last ?? '',
    contributors: inc.contributors ?? [], // real intake persists these; keep re-import idempotent
    format: inc.format ?? '',
    isbn: inc.isbn ?? '',
    rating: inc.rating ?? 0,
    readStatus: inc.readStatus ?? 'Unread',
    reads: inc.reads ?? [],
    genres: inc.genres ?? [],
    source: inc.source ?? 'Owned',
    owned: inc.owned ?? { physical: false, ebook: false, audiobook: false },
    pub: inc.pub ?? { y: null, m: null, d: null },
  })

const CSV = `Title,Author,ISBN13,My Rating,Exclusive Shelf,Date Read
Fourth Wing,Rebecca Yarros,9780306406157,4,read,2025/03/03
Fourth Wing: The Empyrean,Rebecca Yarros,,5,read,2024/05/05
A Brand New Book,New Author,,5,read,2024/01/01`

describe('CSV import against the library', () => {
  it('merges strong matches, routes fuzzy to review, adds new — preserving user fields', () => {
    const existing = makeBook({
      id: 'x',
      title: 'Fourth Wing',
      first: 'Rebecca',
      last: 'Yarros',
      isbn: '0306406152', // ISBN-10 of the same book the CSV lists as ISBN-13
      rating: 5, // user rating — must survive the import (CSV says 4)
      readStatus: 'Read',
      reads: [{ date: '2025-01-01', format: 'paperback', rating: 5, notes: 'mine' }],
    })
    const library = [existing]

    const run1 = runImport(library, CSV)
    expect(run1).toEqual({ added: 1, merged: 1, review: 1 })
    expect(existing.rating).toBe(5) // not clobbered by the CSV's 4
    expect(existing.reads.map((r) => r.date).sort()).toEqual(['2025-01-01', '2025-03-03']) // read added

    // Re-import the SAME CSV — no new books, no new reads, no field changes.
    const run2 = runImport(library, CSV)
    expect(run2.added).toBe(0)
    expect(run2.merged).toBe(0)
    expect(library).toHaveLength(2) // existing + the one brand-new book; fuzzy stayed in review
  })
})
