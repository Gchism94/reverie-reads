import type { Book, ReadStatus } from './types'
import { norm } from './normalize'
import { uid } from './id'
import { deriveBoyfriend } from './boyfriend'
import { cleanIsbn, type Incoming } from './match'
import { emptyOwned } from './ownership'
import { fromFirstLast } from './contributors'

/** Quote-aware CSV parser (escaped quotes, CRLF, blank-line skipping). Ported verbatim. */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        cur += c
      }
    } else if (c === '"') {
      quoted = true
    } else if (c === ',') {
      row.push(cur)
      cur = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cur)
      if (row.length > 1 || row[0]?.trim() !== '') rows.push(row)
      row = []
      cur = ''
    } else {
      cur += c
    }
  }
  row.push(cur)
  if (row.length > 1 || row[0]?.trim() !== '') rows.push(row)
  return rows
}

/**
 * Parse a Goodreads/StoryGraph CSV into incoming book records (no matching/merging here —
 * the caller matches them against the library via match.ts). Reads ISBN-10/13 columns so
 * ISBN-based strong matching can fire.
 */
export function parseCsvIncoming(text: string): Incoming[] {
  const rows = parseCSV(text)
  if (rows.length < 2) return []
  const head = (rows[0] ?? []).map((h) => h.trim().toLowerCase())
  const col = (...names: string[]): number => {
    for (const n of names) {
      const i = head.indexOf(n)
      if (i >= 0) return i
    }
    return -1
  }
  const cT = col('title')
  const cA = col('author', 'authors')
  const cR = col('my rating', 'star rating', 'rating')
  const cD = col('date read', 'last date read', 'dates read', 'read dates')
  const cS = col('exclusive shelf', 'read status', 'bookshelves', 'shelves')
  const cY = col('original publication year', 'year published', 'publication year')
  const cI13 = col('isbn13', 'isbn-13')
  const cI10 = col('isbn', 'isbn-10')
  if (cT < 0) return []

  const cell = (r: string[], i: number): string => (i >= 0 ? (r[i] ?? '') : '')
  const out: Incoming[] = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] ?? []
    const title = cell(r, cT).trim()
    if (!title) continue
    const authorRaw = cA >= 0 ? (cell(r, cA).split(/[,;]/)[0]?.trim() ?? '') : ''
    const parts = authorRaw.split(/\s+/)
    const last = parts.length > 1 ? parts.slice(1).join(' ') : authorRaw
    const first = parts.length > 1 ? (parts[0] ?? '') : ''
    const rating = cR >= 0 ? Math.round(parseFloat(cell(r, cR)) || 0) : 0
    const shelf = cS >= 0 ? cell(r, cS).toLowerCase() : ''
    let readStatus: ReadStatus = 'Read'
    if (/to-read|to read/.test(shelf)) readStatus = 'Unread'
    else if (/currently/.test(shelf)) readStatus = 'Reading'
    else if (/dnf|did.not/.test(shelf)) readStatus = 'DNF'
    const dates =
      cD >= 0
        ? [...cell(r, cD).matchAll(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/g)].map((m) => {
            const y = m[1] ?? ''
            const mo = (m[2] ?? '').padStart(2, '0')
            const da = (m[3] ?? '').padStart(2, '0')
            return `${y}-${mo}-${da}`
          })
        : []
    const py = cY >= 0 ? parseInt(cell(r, cY)) || null : null
    const isbn = cleanIsbn(cell(r, cI13)) || cleanIsbn(cell(r, cI10))
    out.push({
      title,
      first,
      last,
      isbn,
      rating,
      readStatus,
      reads: dates.map((d) => ({ date: d, format: 'Paperback', rating: 0, notes: '' })),
      pub: { y: py, m: null, d: null },
      genres: ['Imported'],
      source: 'Imported',
      owned: emptyOwned(),
    })
  }
  return out
}

export interface CsvImportResult {
  books: Book[]
  added: number
  updated: number
}

/** Thrown when the CSV is empty or isn't a recognizable Goodreads/StoryGraph export. */
export class CsvImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CsvImportError'
  }
}

/**
 * Merge a Goodreads/StoryGraph CSV export into a library by title+author: brings ratings,
 * shelves→read status, real read dates, and publication year. Pure port of importCsv —
 * returns the new books array and counts; throws CsvImportError on empty/unrecognized input.
 */
export function importCsv(existing: readonly Book[], text: string): CsvImportResult {
  const rows = parseCSV(text)
  if (rows.length < 2) throw new CsvImportError('That CSV looks empty')

  const head = (rows[0] ?? []).map((h) => h.trim().toLowerCase())
  const col = (...names: string[]): number => {
    for (const n of names) {
      const i = head.indexOf(n)
      if (i >= 0) return i
    }
    return -1
  }
  const cT = col('title')
  const cA = col('author', 'authors')
  const cR = col('my rating', 'star rating', 'rating')
  const cD = col('date read', 'last date read', 'dates read', 'read dates')
  const cS = col('exclusive shelf', 'read status', 'bookshelves', 'shelves')
  const cY = col('original publication year', 'year published', 'publication year')
  if (cT < 0)
    throw new CsvImportError('No Title column found — is this a Goodreads/StoryGraph export?')

  // Index existing books by title+author and by title alone (the prototype's two keys).
  const books = existing.map((b) => ({ ...b }))
  const have = new Map<string, Book>()
  for (const b of books) {
    have.set(norm(b.title) + '|' + norm(b.last), b)
    const titleKey = 't:' + norm(b.title)
    if (!have.has(titleKey)) have.set(titleKey, b)
  }

  const cell = (r: string[], i: number): string => (i >= 0 ? (r[i] ?? '') : '')
  let added = 0
  let updated = 0

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] ?? []
    const title = cell(r, cT).trim()
    if (!title) continue

    const authorRaw = cA >= 0 ? (cell(r, cA).split(/[,;]/)[0]?.trim() ?? '') : ''
    const parts = authorRaw.split(/\s+/)
    const last = parts.length > 1 ? parts.slice(1).join(' ') : authorRaw
    const first = parts.length > 1 ? (parts[0] ?? '') : ''
    const rating = cR >= 0 ? Math.round(parseFloat(cell(r, cR)) || 0) : 0
    const shelf = cS >= 0 ? cell(r, cS).toLowerCase() : ''
    let rs: ReadStatus = 'Read'
    if (/to-read|to read/.test(shelf)) rs = 'Unread'
    else if (/currently/.test(shelf)) rs = 'Reading'
    else if (/dnf|did.not/.test(shelf)) rs = 'DNF'
    const dates =
      cD >= 0
        ? [...cell(r, cD).matchAll(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/g)].map((m) => {
            const y = m[1] ?? ''
            const mo = (m[2] ?? '').padStart(2, '0')
            const da = (m[3] ?? '').padStart(2, '0')
            return `${y}-${mo}-${da}`
          })
        : []
    const py = cY >= 0 ? parseInt(cell(r, cY)) || null : null

    const match = have.get(norm(title) + '|' + norm(last)) ?? have.get('t:' + norm(title))
    if (match) {
      let changed = false
      if (!match.rating && rating) {
        match.rating = rating
        changed = true
      }
      if (match.readStatus === 'Unread' && rs === 'Read') {
        match.readStatus = 'Read'
        changed = true
      }
      for (const d of dates) {
        if (!match.reads.some((x) => x.date === d)) {
          match.reads.push({ date: d, format: match.format, rating: 0, notes: '' })
          match.readStatus = 'Read'
          changed = true
        }
      }
      if ((!match.pub || !match.pub.y) && py) {
        match.pub = { y: py, m: null, d: null }
        changed = true
      }
      if (changed) updated++
    } else {
      const nb: Book = {
        id: uid(),
        title,
        first,
        last,
        contributors: fromFirstLast(first, last),
        series: '',
        position: '',
        seriesCount: null,
        status: 'Standalone',
        genre: 'romance',
        subgenre: 'Romance',
        genres: ['Imported'],
        tags: [],
        intensity: 0,
        cover: '',
        isbn: '',
        fave: false,
        owned: { physical: false, ebook: false, audiobook: false },
        format: 'Paperback',
        rating,
        readStatus: rs,
        source: 'Imported',
        pub: { y: py, m: null, d: null },
        reads: dates.map((d) => ({ date: d, format: 'Paperback', rating: 0, notes: '' })),
        plan: null,
        progress: 0,
        addedTs: Date.now(),
      }
      nb.boyfriend = deriveBoyfriend(nb)
      books.push(nb)
      have.set(norm(title) + '|' + norm(last), nb)
      have.set('t:' + norm(title), nb)
      added++
    }
  }

  return { books, added, updated }
}
