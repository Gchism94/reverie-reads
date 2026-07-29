import { describe, expect, it } from 'vitest'
import { CsvImportError, importCsv, parseCSV, parseCsvIncoming, parseCsvRows } from './csv'
import { makeBook } from './book.fixture'
import { possessionPatch, possessionState } from './ownership'
import type { Book } from './types'

describe('parseCSV', () => {
  it('handles quoted fields, escaped quotes, and CRLF', () => {
    const rows = parseCSV('Title,Author\r\n"Iron, Flame","Yarros, Rebecca"\r\n"He said ""hi""",X')
    expect(rows[0]).toEqual(['Title', 'Author'])
    expect(rows[1]).toEqual(['Iron, Flame', 'Yarros, Rebecca'])
    expect(rows[2]).toEqual(['He said "hi"', 'X'])
  })

  it('skips blank lines', () => {
    expect(parseCSV('a,b\n\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })
})

describe('importCsv', () => {
  it('adds new rows with rating, shelf→status, and real read dates', () => {
    const csv = [
      'Title,Author,My Rating,Exclusive Shelf,Date Read',
      'Fourth Wing,Rebecca Yarros,5,read,2025/03/04',
      'Powerless,Lauren Roberts,0,to-read,',
    ].join('\n')

    const { books, added, updated } = importCsv([], csv)
    expect(added).toBe(2)
    expect(updated).toBe(0)

    const fourthWing = books.find((b) => b.title === 'Fourth Wing')
    if (!fourthWing) throw new Error('Fourth Wing not imported')
    expect(fourthWing.first).toBe('Rebecca')
    expect(fourthWing.last).toBe('Yarros')
    expect(fourthWing.rating).toBe(5)
    expect(fourthWing.readStatus).toBe('Read')
    // absent source data imports as absent — the read's format is unknown, not 'Paperback'
    expect(fourthWing.reads).toEqual([{ date: '2025-03-04', format: '', rating: 0, notes: '' }])

    const powerless = books.find((b) => b.title === 'Powerless')
    expect(powerless?.readStatus).toBe('Unread') // to-read shelf
  })

  it('merges onto an existing book by title+author (rating + real read date)', () => {
    const existing = makeBook({
      id: 'x',
      title: 'Fourth Wing',
      first: 'Rebecca',
      last: 'Yarros',
      readStatus: 'Unread',
    })
    const csv = 'Title,Author,My Rating,Date Read\nFourth Wing,Rebecca Yarros,5,2025/03/04'

    const { books, added, updated } = importCsv([existing], csv)
    expect(added).toBe(0)
    expect(updated).toBe(1)

    const x = books.find((b) => b.id === 'x')
    if (!x) throw new Error('existing book lost')
    expect(x.rating).toBe(5)
    expect(x.readStatus).toBe('Read')
    expect(x.reads.some((r) => r.date === '2025-03-04')).toBe(true)
  })

  it('throws on empty or unrecognized CSV', () => {
    expect(() => importCsv([], '')).toThrow(CsvImportError)
    expect(() => importCsv([], 'Foo,Bar\n1,2')).toThrow(/Title column/)
  })
})

describe('possession from Goodreads shelves (legacy CSV path)', () => {
  it('to-read → wishlist; borrowed shelf → borrowed; read/currently-reading → owned', () => {
    const text = [
      'Title,Author,Exclusive Shelf,My Rating',
      'Done,Ana Huang,read,4',
      'Someday,Ana Huang,to-read,0',
      'Loaned,Ana Huang,borrowed,3',
    ].join('\n')
    const rows = parseCsvIncoming(text)
    // The WORD each shelf yields, then the flags behind the two non-owned ones: a `borrowed` shelf
    // must set borrowed=true rather than claiming ownership (docs/task-shelf-model.md).
    const word = (r: Partial<Book>) => possessionState({ ...possessionPatch('unset'), ...r })
    expect(rows.map(word)).toEqual(['owned', 'wishlist', 'borrowed'])
    expect(rows[1]).toMatchObject({ ownership: 'unowned', wishlist: true })
    expect(rows[2]).toMatchObject({ ownership: 'unowned', borrowed: true })
  })
})

describe('parseCsvRows (Goodreads field fidelity)', () => {
  const HEAD =
    'Title,Author,Author l-f,Additional Authors,ISBN,ISBN13,My Rating,Average Rating,Publisher,Binding,Number of Pages,Year Published,Original Publication Year,Date Read,Date Added,Bookshelves,Exclusive Shelf,My Review,Private Notes,Read Count'
  const row = (cells: string[]) =>
    `${HEAD}\n${cells.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')}`
  const parse1 = (cells: string[]) => {
    const [r] = parseCsvRows(row(cells))
    if (!r) throw new Error('no row parsed')
    return r
  }

  it('parses series out of the title, splits Author l-f, honors bindings and the ="" ISBN wrapper', () => {
    const r = parse1([
      'A Court of Thorns and Roses (ACOTAR, #1)',
      'Sarah J Maas',
      'Maas, Sarah J.',
      '',
      '="0316580791"',
      '="9780316580792"',
      '4',
      '4.21',
      'Bloomsbury',
      'Hardcover',
      '448',
      '2015',
      '2015',
      '2025/01/24',
      '2024/05/08',
      '',
      'read',
      '',
      '',
      '1',
    ])
    expect(r.incoming.title).toBe('A Court of Thorns and Roses')
    expect(r.incoming.series).toBe('ACOTAR')
    expect(r.incoming.position).toBe(1)
    expect(r.incoming.first).toBe('Sarah J.')
    expect(r.incoming.last).toBe('Maas')
    expect(r.incoming.isbn).toBe('9780316580792') // wrapper stripped, leading zero preserved
    expect(r.incoming.format).toBe('Hardcover')
    expect(r.incoming.pub).toEqual({ y: 2015, m: null, d: null })
    expect(r.incoming.reads?.[0]).toMatchObject({ date: '2025-01-24', format: 'Hardcover' })
  })

  it('never fabricates: blank binding/pages/year import as absent', () => {
    const r = parse1([
      'Powerless',
      'Lauren Roberts',
      'Roberts, Lauren',
      '',
      '',
      '',
      '0',
      '3.9',
      '',
      '',
      '',
      '',
      '',
      '',
      '2024/02/02',
      '',
      'to-read',
      '',
      '',
      '0',
    ])
    expect(r.incoming.format).toBeUndefined() // no Binding → no format (not 'Paperback')
    expect(r.incoming.pub).toEqual({ y: null, m: null, d: null })
    expect(r.incoming.rating).toBe(0) // My Rating 0 = unrated
    // to-read → a want, not a possession claim
    expect(r.incoming).toMatchObject({ ownership: 'unowned', wishlist: true })
    expect(r.incoming.readStatus).toBe('Unread')
    expect(r.incoming.reads).toEqual([]) // no dated read, not read → no fabricated read
    expect(r.incoming.series).toBeUndefined()
  })

  it('tops the read log up to Read Count with undated entries, and carries review + notes', () => {
    const r = parse1([
      'Book',
      'A Author',
      'Author, A',
      '',
      '',
      '',
      '5',
      '4',
      '',
      'Paperback',
      '',
      '',
      '',
      '2025/03/04',
      '',
      '',
      'read',
      'Loved it',
      'from Kate',
      '3',
    ])
    expect(r.incoming.reads).toHaveLength(3) // 1 dated + 2 undated top-up to Read Count 3
    expect(r.incoming.reads?.filter((x) => x.date).length).toBe(1)
    // review + private notes land on the most recent read entry
    expect(r.incoming.reads?.[r.incoming.reads.length - 1]?.notes).toBe('Loved it\n\nfrom Kate')
  })

  it('records Date Added as addedTs (noon UTC, timezone-proof)', () => {
    const r = parse1([
      'B',
      'X Y',
      'Y, X',
      '',
      '',
      '',
      '0',
      '4',
      '',
      '',
      '',
      '',
      '',
      '',
      '2024/07/09',
      '',
      'read',
      '',
      '',
      '0',
    ])
    expect(r.incoming.addedTs).toBe(Date.UTC(2024, 6, 9, 12))
  })

  it('maps Additional Authors to co-author contributors', () => {
    const r = parse1([
      'B',
      'A Main',
      'Main, A',
      'Cowriter One, Cowriter Two',
      '',
      '',
      '0',
      '4',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'read',
      '',
      '',
      '0',
    ])
    const roles = r.incoming.contributors?.map((c) => c.role)
    expect(roles).toEqual(['author', 'co_author', 'co_author'])
    expect(r.incoming.contributors?.map((c) => c.name)).toEqual([
      'A Main',
      'Cowriter One',
      'Cowriter Two',
    ])
  })

  it('routes custom Bookshelves to shelves, skipping exclusive-shelf leakage; flags unplaced notes', () => {
    const r = parse1([
      'B',
      'A B',
      'B, A',
      '',
      '',
      '',
      '0',
      '4',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'dark-romance, read, fae',
      'to-read',
      'a note',
      '',
      '0',
    ])
    expect(r.shelves).toEqual(['dark-romance', 'fae']) // 'read' (exclusive) removed
    expect(r.unplacedNotes).toBe(true) // to-read row has a review but no read to carry it
  })

  it('never reads Average Rating (anti-consensus)', () => {
    const r = parse1([
      'B',
      'A B',
      'B, A',
      '',
      '',
      '',
      '2',
      '4.9',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'read',
      '',
      '',
      '0',
    ])
    expect(r.incoming.rating).toBe(2) // My Rating, never the 4.9 crowd average
  })
})
