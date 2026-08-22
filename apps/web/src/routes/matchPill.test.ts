import { describe, expect, it } from 'vitest'
import type { Book } from '@reverie/core'
import { describeMatches, type Pick } from './MatchRoute'
import { emptyAnswers, HEAT, INTENSITY } from '../library/quiz'

/**
 * The result pill reads the axis it is about to NAME.
 *
 * Before the axis split (#330) there was one column, so this function sampled `intensity` and chose
 * its word from HEAT or INTENSITY by genre. After the split those are two different columns, and
 * sampling `intensity` while naming an INTENSITY (darkness) word describes a non-romance result by
 * the wrong axis — a bug invisible in any assertion that only checks "a pill appeared", because a
 * pill DOES appear, carrying a plausible word backed by the wrong number.
 *
 * So every case below sets the two columns to DIFFERENT values and asserts on which one reached the
 * screen. A book at spice 5 / darkness 1 must read "Gentle" in a horror result and "Blistering" in a
 * romance one; a single-column implementation cannot satisfy both.
 */

const book = (over: Partial<Book> & { id: string }): Book => ({
  title: `Book ${over.id}`,
  first: '',
  last: '',
  contributors: [],
  series: '',
  position: '',
  seriesCount: null,
  status: 'standalone',
  genre: 'horror',
  subgenre: '',
  subgenres: [],
  genres: [],
  tags: [],
  tropes: [],
  moods: [],
  intensity: null,
  darkness: null,
  cover: '',
  pages: null,
  isbn: '',
  fave: false,
  ownership: 'owned',
  borrowed: false,
  wishlist: false,
  owned: { physical: false, ebook: false, audiobook: false },
  format: '',
  rating: 0,
  readStatus: 'unset',
  source: '',
  pub: { y: null, m: null, d: null },
  reads: [],
  plan: { y: null, m: null, d: null },
  progress: 0,
  addedTs: 0,
  ...over,
})

const pick = (b: Book): Pick => ({ b, s: 80, isRead: false, why: '' })
const describe_ = (books: Book[]) => describeMatches(books.map(pick), emptyAnswers())

describe('the level pill samples the axis its vocabulary names', () => {
  it('a NON-romance result reads darkness, not spice', () => {
    // spice 5 / darkness 1 on every book: the two columns disagree as loudly as they can.
    const tags = describe_([
      book({ id: 'a', genre: 'horror', intensity: 5, darkness: 1 }),
      book({ id: 'b', genre: 'horror', intensity: 5, darkness: 1 }),
    ]).tags
    expect(tags).toContain(INTENSITY[1]) // 'Gentle' — from darkness
    expect(tags).not.toContain(INTENSITY[5]) // would be 'Harrowing', the spice value misread
    expect(tags.some((t) => t.includes('🌶️'))).toBe(false) // no spice glyph off the romance path
  })

  it('a ROMANCE result still reads spice — the previously-correct case stays correct', () => {
    const tags = describe_([
      book({ id: 'a', genre: 'romance', intensity: 5, darkness: 1 }),
      book({ id: 'b', genre: 'romance', intensity: 5, darkness: 1 }),
    ]).tags
    expect(tags.some((t) => t.includes(HEAT[5]!) && t.includes('🌶️'))).toBe(true)
    expect(tags).not.toContain(INTENSITY[1])
  })

  it('the genre mode is decided before the sample, not after — a mixed set follows the MAJORITY', () => {
    // 2 horror to 1 romance: the dominant genre is horror, so darkness must be the sampled axis
    // even though a romance book is present. This is the ordering bug specifically: reading the
    // field before domGenreKey exists would sample spice for the whole set.
    const tags = describe_([
      book({ id: 'a', genre: 'horror', intensity: 5, darkness: 2 }),
      book({ id: 'b', genre: 'horror', intensity: 5, darkness: 2 }),
      book({ id: 'c', genre: 'romance', intensity: 5, darkness: 2 }),
    ]).tags
    expect(tags).toContain(INTENSITY[2]) // 'Mild' — from darkness
    expect(tags.some((t) => t.includes('🌶️'))).toBe(false)
  })

  it('a non-romance result with darkness unassessed shows NO level pill', () => {
    // The expected consequence of the split: darkness starts NULL for every existing book, so a
    // non-romance result has nothing to say about this axis until a reader assesses it. Silence is
    // correct — the alternative is naming a darkness word over a spice number.
    const { tags } = describe_([
      book({ id: 'a', genre: 'horror', intensity: 4, darkness: null }),
      book({ id: 'b', genre: 'horror', intensity: 4, darkness: null }),
    ])
    for (const w of INTENSITY.filter(Boolean)) expect(tags).not.toContain(w)
    for (const w of HEAT.filter(Boolean)) expect(tags.some((t) => t.includes(w))).toBe(false)
  })

  it('level 0 shows no pill on either axis — assessed-as-none is not a word worth a chip', () => {
    expect(describe_([book({ id: 'a', genre: 'horror', darkness: 0 })]).tags).not.toContain(
      INTENSITY[0],
    )
  })
})
