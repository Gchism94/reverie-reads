import { describe, expect, it } from 'vitest'
import {
  contributorsFromAuthors,
  formatAuthors,
  formatByline,
  fromFirstLast,
  normalizeName,
  primaryAuthor,
  reconcileContributors,
  renumber,
  splitName,
  toFirstLast,
} from './contributors'
import { bookHasAuthor } from './filters'
import { mergeImport } from './match'
import { makeBook } from './book.fixture'
import type { Contributor } from './types'

const c = (name: string, role: Contributor['role'], position: number): Contributor => ({
  name,
  role,
  position,
})

describe('name helpers', () => {
  it('normalizeName lowercases + collapses whitespace (dedupe key)', () => {
    expect(normalizeName('Ana  Huang')).toBe('ana huang')
    expect(normalizeName('  ANA huang ')).toBe('ana huang')
  })
  it('splitName / joinName / fromFirstLast round-trip the primary author', () => {
    expect(splitName('Sarah J. Maas')).toEqual({ first: 'Sarah J.', last: 'Maas' })
    expect(splitName('Plato')).toEqual({ first: '', last: 'Plato' }) // single token → last
    expect(fromFirstLast('Ana', 'Huang')).toEqual([
      { name: 'Ana Huang', role: 'author', position: 0 },
    ])
    expect(fromFirstLast('', '')).toEqual([])
    expect(toFirstLast([c('Ana Huang', 'author', 0)])).toEqual({ first: 'Ana', last: 'Huang' })
  })
})

describe('primaryAuthor', () => {
  it('is the first author/co-author by position, ignoring translators', () => {
    const list = [
      c('Tr Anslator', 'translator', 0),
      c('Real Author', 'author', 1),
      c('Co Writer', 'co_author', 2),
    ]
    expect(primaryAuthor(list)?.name).toBe('Real Author')
  })
  it('falls back to the first contributor when none are authors', () => {
    expect(primaryAuthor([c('Ed Itor', 'editor', 0)])?.name).toBe('Ed Itor')
    expect(primaryAuthor([])).toBeNull()
  })
})

describe('formatByline', () => {
  it('formats 1 / 2 / 3+ authors with an ampersand before the last', () => {
    expect(formatByline([c('A', 'author', 0)])).toBe('by A')
    expect(formatByline([c('A', 'author', 0), c('B', 'co_author', 1)])).toBe('by A & B')
    expect(
      formatByline([c('A', 'author', 0), c('B', 'co_author', 1), c('C', 'co_author', 2)]),
    ).toBe('by A, B & C')
  })
  it('appends non-author roles subtly and respects position order', () => {
    const list = [c('Tomasz', 'author', 1), c('Antonia Lloyd-Jones', 'translator', 0)]
    expect(formatByline(list)).toBe('by Tomasz, tr. Antonia Lloyd-Jones')
  })
  it('returns empty string for no contributors', () => {
    expect(formatByline([])).toBe('')
  })
})

describe('formatAuthors + contributorsFromAuthors', () => {
  it('formatAuthors shows only authors/co-authors (no roles, no "by")', () => {
    expect(
      formatAuthors([c('A', 'author', 0), c('Tr', 'translator', 1), c('B', 'co_author', 2)]),
    ).toBe('A & B')
  })
  it('contributorsFromAuthors makes the first an author and the rest co-authors', () => {
    expect(contributorsFromAuthors(['Ilona Andrews', 'Gordon Andrews'])).toEqual([
      { name: 'Ilona Andrews', role: 'author', position: 0 },
      { name: 'Gordon Andrews', role: 'co_author', position: 1 },
    ])
  })
  it('contributorsFromAuthors honors a role override by normalized name', () => {
    const out = contributorsFromAuthors(['Olga Tokarczuk', 'Jennifer Croft'], {
      'jennifer croft': 'translator',
    })
    expect(out[1]).toEqual({ name: 'Jennifer Croft', role: 'translator', position: 1 })
  })
})

describe('bookHasAuthor (filter)', () => {
  it('matches any contributor by normalized name', () => {
    const b = makeBook({
      id: '1',
      title: 'T',
      contributors: [c('Olga Tokarczuk', 'author', 0), c('Antonia Lloyd-Jones', 'translator', 1)],
    })
    expect(bookHasAuthor(b, 'antonia lloyd-jones')).toBe(true)
    expect(bookHasAuthor(b, 'Someone Else')).toBe(false)
    expect(bookHasAuthor(b, '')).toBe(true) // empty filter = no constraint
  })
  it('falls back to first/last for a not-yet-joined book', () => {
    const b = makeBook({ id: '2', title: 'T', first: 'Ana', last: 'Huang', contributors: [] })
    expect(bookHasAuthor(b, 'Ana Huang')).toBe(true)
  })
})

describe('reconcileContributors', () => {
  it('unions additively, dedupes by name+role, preserves order, renumbers', () => {
    const existing = [c('Ana Huang', 'author', 0)]
    const incoming = [c('ana huang', 'author', 0), c('A Translator', 'translator', 1)]
    const out = reconcileContributors(existing, incoming)
    expect(out.map((x) => `${x.name}/${x.role}/${x.position}`)).toEqual([
      'Ana Huang/author/0', // existing kept (case-insensitive dedupe)
      'A Translator/translator/1', // new appended
    ])
  })
  it('is idempotent', () => {
    const list = renumber([c('A', 'author', 0), c('B', 'co_author', 1)])
    expect(reconcileContributors(list, list)).toEqual(list)
  })
  it('treats the same name in a different role as distinct (e.g. author + narrator)', () => {
    const out = reconcileContributors(
      [c('Same Name', 'author', 0)],
      [c('Same Name', 'narrator', 0)],
    )
    expect(out).toHaveLength(2)
  })
})

describe('mergeImport — contributor reconciliation', () => {
  it('unions an incoming translator into an existing single-author book', () => {
    const existing = makeBook({
      id: '1',
      title: 'Drive Your Plow',
      first: 'Olga',
      last: 'Tokarczuk',
      contributors: [c('Olga Tokarczuk', 'author', 0)],
    })
    const { patch, changed } = mergeImport(existing, {
      title: 'Drive Your Plow',
      contributors: [c('Olga Tokarczuk', 'author', 0), c('Antonia Lloyd-Jones', 'translator', 1)],
    })
    expect(changed).toBe(true)
    expect(patch.contributors?.map((x) => x.role)).toEqual(['author', 'translator'])
  })
  it('is a no-op when the incoming contributors are already present', () => {
    const existing = makeBook({ id: '1', title: 'T', contributors: [c('A', 'author', 0)] })
    const { patch } = mergeImport(existing, { title: 'T', contributors: [c('A', 'author', 0)] })
    expect(patch.contributors).toBeUndefined()
  })
})
