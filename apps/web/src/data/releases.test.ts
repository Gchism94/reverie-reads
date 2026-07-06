import { describe, expect, it } from 'vitest'
import type { Book } from '@reverie/core'
import { releaseWindow, yourAuthors } from './releases'
import type { DiscoverHit } from '../lib/discover'

const book = (b: { title: string; author: string; rating?: number; fave?: boolean; isbn?: string }): Book =>
  ({
    title: b.title,
    isbn: b.isbn ?? '',
    rating: b.rating ?? 0,
    fave: b.fave ?? false,
    contributors: [{ name: b.author, role: 'author' }],
  }) as unknown as Book

const hit = (h: Partial<DiscoverHit>): DiscoverHit => ({ title: '', authors: [], cover: '', isbn: '', pub: '', ...h })

describe('yourAuthors — the derived follow list', () => {
  const books = [
    book({ title: 'ACOTAR', author: 'Sarah J. Maas', rating: 5 }),
    book({ title: 'One Meh Book', author: 'One Timer', rating: 3 }),
    book({ title: 'First', author: 'Two Timer', rating: 3 }),
    book({ title: 'Second', author: 'Two Timer' }),
    book({ title: 'Faved', author: 'Fave Author', fave: true }),
  ]

  it('derives loved authors and multi-book authors; single lukewarm books do not qualify', () => {
    expect(yourAuthors(books, {})).toEqual(['Fave Author', 'Sarah J. Maas', 'Two Timer'])
  })

  it('muted authors drop out; followed names pin in even without qualifying books', () => {
    expect(yourAuthors(books, { 'Two Timer': 'muted', 'Penn Cole': 'followed' })).toEqual([
      'Fave Author',
      'Penn Cole',
      'Sarah J. Maas',
    ])
  })

  it('caps the list', () => {
    const many = Array.from({ length: 30 }, (_, i) => book({ title: `B${i}`, author: `Author ${String(i).padStart(2, '0')}`, rating: 5 }))
    expect(yourAuthors(many, {}, 20)).toHaveLength(20)
  })
})

describe('releaseWindow — upcoming/recent, owned and stale excluded', () => {
  const now = Date.parse('2026-07-06')
  const books = [book({ title: 'Owned Already', author: 'Sarah J. Maas', isbn: '9781111111111' })]
  const shelves = {
    'Sarah J. Maas': [
      hit({ title: 'Future Book', authors: ['Sarah J. Maas'], pub: '2026-09-01' }),
      hit({ title: 'Recent Book', authors: ['Sarah J. Maas'], pub: '2026-05-01' }),
      hit({ title: 'Owned Already', authors: ['Sarah J. Maas'], isbn: '9781111111111', pub: '2026-06-01' }),
      hit({ title: 'Old Backlist', authors: ['Sarah J. Maas'], pub: '2015-05-05' }),
      hit({ title: 'Undated', authors: ['Sarah J. Maas'], pub: '' }),
    ],
    'Penn Cole': [
      hit({ title: 'Sooner Future', authors: ['Penn Cole'], pub: '2026-08-01' }),
      hit({ title: 'Year Only', authors: ['Penn Cole'], pub: '2026' }), // year-only future-dated
    ],
  }

  it('windows, owner-filters, and sorts (upcoming soonest-first, recent newest-first)', () => {
    const { upcoming, recent } = releaseWindow(shelves, books, now)
    expect(upcoming.map((r) => r.title)).toEqual(['Sooner Future', 'Future Book', 'Year Only'])
    expect(recent.map((r) => r.title)).toEqual(['Recent Book'])
  })

  it('dedupes the same title across author shelves', () => {
    const dup = { A: [hit({ title: 'Co-Written', authors: ['A'], pub: '2026-08-02' })], B: [hit({ title: 'Co-Written', authors: ['A'], pub: '2026-08-02' })] }
    const { upcoming } = releaseWindow(dup, [], now)
    expect(upcoming).toHaveLength(1)
  })
})
