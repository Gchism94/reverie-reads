import { describe, expect, it } from 'vitest'
import rawSeed from '../../../data/personal_seed.json'
import { evaluateTasteHoldout } from './tasteEval'
import { makeBook } from './book.fixture'
import type { Book } from './types'

const NOW = Date.parse('2026-07-01')

// ── 1 · synthetic planted-preference library: the MODEL must recover a taste we know is there ──
function plantedLibrary(): Book[] {
  const books: Book[] = []
  // 8 loved locked-room noirs (the held-out set), 8 hated billionaires, filler + unread candidates
  for (let i = 0; i < 8; i++) {
    books.push(
      makeBook({
        id: `love-${i}`,
        title: `Love ${i}`,
        tags: ['Locked Room', 'Noir'],
        subgenre: 'Noir',
        readStatus: 'Read',
        rating: 5,
      }),
    )
    books.push(
      makeBook({
        id: `hate-${i}`,
        title: `Hate ${i}`,
        tags: ['Billionaire'],
        subgenre: 'Romance',
        readStatus: i % 2 ? 'DNF' : 'Read',
        rating: i % 2 ? 0 : 1,
      }),
    )
    books.push(
      makeBook({
        id: `mid-${i}`,
        title: `Mid ${i}`,
        tags: ['Small Town'],
        subgenre: 'Contemporary',
        readStatus: 'Read',
        rating: 3,
      }),
    )
  }
  for (let i = 0; i < 6; i++) {
    books.push(
      makeBook({
        id: `cand-love-${i}`,
        title: `CandL ${i}`,
        tags: ['Locked Room'],
        subgenre: 'Noir',
        readStatus: 'Unread',
      }),
    )
    books.push(
      makeBook({
        id: `cand-hate-${i}`,
        title: `CandH ${i}`,
        tags: ['Billionaire'],
        subgenre: 'Romance',
        readStatus: 'Unread',
      }),
    )
  }
  return books
}

// ── 2 · the real 290-book seed (prototype export shape: tropes/spice) ──
type SeedBook = {
  title: string
  series?: string
  position?: string | number
  subgenre?: string
  genres?: string[]
  tropes?: string[]
  spice?: number
  rating?: number
  readStatus?: string
  fave?: boolean
}
const seed: Book[] = (rawSeed as SeedBook[]).map((s, i) =>
  makeBook({
    id: `seed-${i}`,
    title: s.title,
    series: s.series ?? '',
    position: typeof s.position === 'string' ? Number(s.position) || '' : (s.position ?? ''),
    subgenre: s.subgenre ?? '',
    genres: s.genres ?? [],
    tags: s.tropes ?? [],
    intensity: s.spice ?? null,
    rating: s.rating ?? 0,
    readStatus: (s.readStatus as Book['readStatus']) ?? 'Unread',
    fave: s.fave ?? false,
  }),
)

describe('offline taste eval (tune against data, not vibes)', () => {
  it('recovers a planted preference decisively (synthetic library)', () => {
    const r = evaluateTasteHoldout(plantedLibrary(), { now: NOW })
    expect(r.evaluated).toBe(8)
    expect(r.evaluatedTagged).toBe(8)
    // held-out loved books must rank far above the pack when the signal is real
    expect(r.meanPercentile).toBeGreaterThan(0.75)
    expect(r.meanPercentileTagged).toBeGreaterThan(0.75)
  })

  it('beats random on the real 290-book seed, within what its data can support', () => {
    const r = evaluateTasteHoldout(seed, { now: NOW })
    expect(r.evaluated).toBe(24)
    // HONEST FLOOR, documented: only 1 of the 24 loved books in this export carries tropes, so
    // tag-level taste is nearly unevaluable here (the live DB is far better tagged). Content fit
    // still clears random on world evidence alone — measured 0.614 at adoption; floor set with
    // margin so a regression fails loudly without the test being brittle to seed edits.
    expect(r.meanPercentile).toBeGreaterThan(0.55)
    // the one tag-evidenced loved book ranks near the top (measured 0.976) — n=1, so this only
    // asserts the direction, not significance
    if (r.evaluatedTagged > 0) expect(r.meanPercentileTagged).toBeGreaterThan(0.7)
  })
})
