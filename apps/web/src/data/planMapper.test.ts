import { describe, expect, it } from 'vitest'
import { emptyDate, type Book, type PlanDate } from '@reverie/core'
import { toBook, toBookRow } from './mappers'
import type { BookRow } from './types'

/** A books row with only what `toBook` needs, plus whatever plan shape the case is about. */
function row(plan: Partial<Pick<BookRow, 'plan_y' | 'plan_m' | 'plan_d' | 'plan_date'>>): BookRow {
  return {
    id: 'b1',
    owner_id: 'o1',
    title: 'A Book',
    author_first: null,
    author_last: null,
    authors_display: null,
    series: null,
    position: null,
    series_count: null,
    status: null,
    genre: 'Fantasy',
    subgenre: null,
    subgenres: [],
    genres: [],
    tags: [],
    intensity: null,
    cover_url: null,
    cover_thumb_url: null,
    cover_source: null,
    cover_source_url: null,
    cover_confidence: null,
    cover_user_chosen: false,
    cover_color: null,
    isbn: null,
    fave: false,
    ownership: 'unowned',
    owned_physical: null,
    owned_ebook: false,
    owned_audiobook: false,
    borrowed: false,
    wishlist: false,
    format: null,
    rating: null,
    read_status: 'Unread',
    source: null,
    pages: null,
    pub_y: null,
    pub_m: null,
    pub_d: null,
    plan_date: null,
    plan_y: null,
    plan_m: null,
    plan_d: null,
    progress: null,
    reading_position: null,
    reading_now_hidden: false,
    added_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...plan,
  } as BookRow
}

/** One full turn of the loop a real edit makes: domain → columns → domain. */
function roundTrip(plan: PlanDate): { back: PlanDate; planDate: string | null | undefined } {
  const written = toBookRow({ plan })
  const back = toBook(
    row({
      plan_y: written.plan_y ?? null,
      plan_m: written.plan_m ?? null,
      plan_d: written.plan_d ?? null,
      plan_date: written.plan_date ?? null,
    }),
  ).plan
  return { back, planDate: written.plan_date }
}

describe('plan round-trip through the mapper, at every precision', () => {
  it('a full day-precision plan survives write → read unchanged', () => {
    const { back } = roundTrip({ y: 2026, m: 3, d: 14 })
    expect(back).toEqual({ y: 2026, m: 3, d: 14 })
  })

  it('a month-only plan survives, and is NOT completed with a day on the way back', () => {
    const { back } = roundTrip({ y: 2026, m: 3, d: null })
    expect(back).toEqual({ y: 2026, m: 3, d: null })
  })

  it('a year-only plan survives, with month and day still null', () => {
    const { back } = roundTrip({ y: 2026, m: null, d: null })
    expect(back).toEqual({ y: 2026, m: null, d: null })
  })

  it('no plan round-trips as no plan', () => {
    const { back } = roundTrip(emptyDate())
    expect(back).toEqual(emptyDate())
  })
})

describe('lossless-only dual-write of plan_date', () => {
  it('a complete plan writes the equivalent plan_date, zero-padded', () => {
    expect(roundTrip({ y: 2026, m: 3, d: 14 }).planDate).toBe('2026-03-14')
  })

  // The rule the feature exists for. A fabricating implementation writes '2026-03-01' here.
  it('a month-only plan writes NULL to plan_date, never a fabricated first-of-month', () => {
    expect(roundTrip({ y: 2026, m: 3, d: null }).planDate).toBeNull()
  })

  it('a year-only plan writes NULL to plan_date', () => {
    expect(roundTrip({ y: 2026, m: null, d: null }).planDate).toBeNull()
  })

  it('clearing the plan clears plan_date too, so the two representations cannot disagree', () => {
    expect(roundTrip(emptyDate()).planDate).toBeNull()
  })

  it('writes the trio and plan_date in ONE patch — a partial write would let them diverge', () => {
    const written = toBookRow({ plan: { y: 2026, m: 3, d: 14 } })
    expect(Object.keys(written).sort()).toEqual(['plan_d', 'plan_date', 'plan_m', 'plan_y'])
  })

  it('leaves every plan column alone when the patch does not mention the plan', () => {
    const written = toBookRow({ title: 'Renamed' })
    expect('plan_y' in written).toBe(false)
    expect('plan_date' in written).toBe(false)
  })
})

describe('reading a row written before the app moved to the trio', () => {
  // The transition window runs in both directions: this app writes both, but rows already in the
  // database from the previous version carry ONLY plan_date. Reading those as "no plan" would make
  // every pre-existing plan vanish from the library the moment this deploys.
  it('a legacy plan_date row with an empty trio still reads as a plan', () => {
    expect(toBook(row({ plan_date: '2026-03-14' })).plan).toEqual({ y: 2026, m: 3, d: 14 })
  })

  it('the trio wins when both are present — it is the one that can hold a partial plan', () => {
    const b: Book = toBook(row({ plan_y: 2027, plan_m: 6, plan_d: null, plan_date: '2026-03-14' }))
    expect(b.plan).toEqual({ y: 2027, m: 6, d: null })
  })

  it('a row with neither reads as no plan', () => {
    expect(toBook(row({})).plan).toEqual(emptyDate())
  })
})
