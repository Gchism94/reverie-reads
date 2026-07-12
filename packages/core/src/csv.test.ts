import { describe, expect, it } from 'vitest'
import { CsvImportError, importCsv, parseCSV, parseCsvIncoming } from './csv'
import { makeBook } from './book.fixture'

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
    expect(fourthWing.reads).toEqual([
      { date: '2025-03-04', format: 'Paperback', rating: 0, notes: '' },
    ])

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

describe('ownership from Goodreads shelves (legacy CSV path)', () => {
  it('to-read → unowned; read/currently-reading → owned', () => {
    const text = [
      'Title,Author,Exclusive Shelf,My Rating',
      'Done,Ana Huang,read,4',
      'Someday,Ana Huang,to-read,0',
    ].join('\n')
    const rows = parseCsvIncoming(text)
    expect(rows.map((r) => r.ownership)).toEqual(['owned', 'unowned'])
  })
})
