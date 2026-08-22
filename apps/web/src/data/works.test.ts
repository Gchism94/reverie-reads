import { describe, expect, it } from 'vitest'
import { applyWorksFilters, workToHit, worksPageRange, type WorkRow } from './works'
import { DISCOVER_BATCH } from '../lib/discover'

/**
 * The corpus browse's pure parts. The recorder pattern below asserts the CALLS the filter
 * composition makes — a dropped branch or swapped operator is the rot this catches, and it needs
 * no database to catch it.
 */

class Recorder {
  calls: [string, unknown][] = []
  eq(col: string, v: string) {
    this.calls.push(['eq', `${col}=${v}`])
    return this
  }
  contains(col: string, v: string[]) {
    this.calls.push(['contains', `${col}⊇${JSON.stringify(v)}`])
    return this
  }
  or(expr: string) {
    this.calls.push(['or', expr])
    return this
  }
}

const filters = (over: Partial<{ genre: string; tag: string; q: string }> = {}) => ({
  genre: '',
  tag: '',
  q: '',
  ...over,
})

describe('applyWorksFilters', () => {
  it('no filters → no calls: the bare browse selects everything', () => {
    const r = new Recorder()
    applyWorksFilters(r, filters())
    expect(r.calls).toEqual([])
  })

  it('genre becomes an eq', () => {
    const r = new Recorder()
    applyWorksFilters(r, filters({ genre: 'fantasy' }))
    expect(r.calls).toEqual([['eq', 'genre=fantasy']])
  })

  it('tag becomes a contains, lowercased — works.tags is lowercased at import', () => {
    const r = new Recorder()
    applyWorksFilters(r, filters({ tag: 'Enemies To Lovers' }))
    expect(r.calls).toEqual([['contains', 'tags⊇["enemies to lovers"]']])
  })

  it('text search matches title OR author_text — the denormalized column, not the jsonb', () => {
    const r = new Recorder()
    applyWorksFilters(r, filters({ q: 'yarros' }))
    expect(r.calls).toEqual([['or', 'title.ilike.%yarros%,author_text.ilike.%yarros%']])
  })

  it('strips % and , from the term — commas are PostgREST or() separators', () => {
    const r = new Recorder()
    applyWorksFilters(r, filters({ q: '100%, guaranteed' }))
    expect(r.calls).toEqual([['or', 'title.ilike.%100 guaranteed%,author_text.ilike.%100 guaranteed%']])
  })

  it('a whitespace-only term is no filter at all', () => {
    const r = new Recorder()
    applyWorksFilters(r, filters({ q: '   ' }))
    expect(r.calls).toEqual([])
  })

  it('all three compose, in a stable order', () => {
    const r = new Recorder()
    applyWorksFilters(r, filters({ genre: 'horror', tag: 'gothic', q: 'castle' }))
    expect(r.calls.map((c) => c[0])).toEqual(['eq', 'contains', 'or'])
  })
})

describe('worksPageRange', () => {
  it('pages are DISCOVER_BATCH wide, inclusive, and disjoint', () => {
    expect(worksPageRange(0)).toEqual({ from: 0, to: DISCOVER_BATCH - 1 })
    expect(worksPageRange(1)).toEqual({ from: DISCOVER_BATCH, to: 2 * DISCOVER_BATCH - 1 })
    // disjointness is the no-duplicates-on-show-more claim, stated as arithmetic
    expect(worksPageRange(1).from).toBe(worksPageRange(0).to + 1)
  })
})

describe('workToHit — a corpus row IS an Add prefill', () => {
  const row = (over: Partial<WorkRow> = {}): WorkRow => ({
    work_key: 'k',
    title: 'Ash Crown',
    contributors: [{ name: 'Vera Stone', role: 'author', position: 0 }],
    series: null,
    position: null,
    cover_url: null,
    genre: 'fantasy',
    tags: [],
    pub_y: null,
    pub_m: null,
    pub_d: null,
    ...over,
  })

  it('maps authors from contributors and keeps the DiscoverHit contract', () => {
    const h = workToHit(row())
    expect(h.title).toBe('Ash Crown')
    expect(h.authors).toEqual(['Vera Stone'])
    expect(h.isbn).toBe('') // the corpus stores none yet; Add treats empty as absent
  })

  it('a coverless row maps to cover "" — the placeholder is the designed common case at launch', () => {
    expect(workToHit(row()).cover).toBe('')
    expect(workToHit(row({ cover_url: 'https://x/c.jpg' })).cover).toBe('https://x/c.jpg')
  })

  it('pub composes from whatever precision exists, year-only included', () => {
    expect(workToHit(row({ pub_y: 2024 })).pub).toBe('2024')
    expect(workToHit(row({ pub_y: 2024, pub_m: 3 })).pub).toBe('2024-03')
    expect(workToHit(row({ pub_y: 2024, pub_m: 3, pub_d: 7 })).pub).toBe('2024-03-07')
    expect(workToHit(row()).pub).toBe('')
  })

  it('empty contributors yield an empty authors list, not a crash or a ghost name', () => {
    expect(workToHit(row({ contributors: [] })).authors).toEqual([])
  })
})
