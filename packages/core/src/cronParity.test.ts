import { describe, expect, it } from 'vitest'
import {
  computeSkinWeights,
  dominantSkin as coreDominant,
  isMaterialShift as coreShift,
  tasteInsight as coreInsight,
  weightDistance as coreDistance,
  type Book,
  type SkinId,
} from './index'
import { makeBook } from './book.fixture'
// Same file the Deno cron imports (it uses the './taste.ts' specifier; Vitest/tsc resolve the
// extensionless path here). If the hand-kept cron copy drifts from core, this test fails.
import {
  computeWeights as cronWeights,
  dominantSkin as cronDominant,
  isMaterialShift as cronShift,
  tasteInsight as cronInsight,
  weightDistance as cronDistance,
  type BookRow,
} from '../../../supabase/functions/evolve-skins/taste'

// Map a core Book to the row shape the cron reads from Postgres. Fixtures use the makeBook default
// reads:[] so core's engagement (reads.length || readStatus) matches the cron's read_status-only
// approximation exactly — the two are only guaranteed equal for the no-reads-join case the cron sees.
const toRow = (b: Book): BookRow => ({
  subgenre: b.subgenre,
  tags: b.tags,
  rating: b.rating,
  fave: b.fave,
  read_status: b.readStatus,
})

// Golden libraries spanning every skin affinity + engagement modifier (fave, high/low rating, DNF,
// unread). Each is fed through BOTH implementations; the resulting weight vectors must match.
const LIBRARIES: Record<string, Book[]> = {
  romanceHeavy: [
    makeBook({
      id: '1',
      title: 'A',
      subgenre: 'Romance',
      tags: ['Slow Burn', 'Small Town'],
      rating: 5,
      fave: true,
      readStatus: 'Read',
    }),
    makeBook({
      id: '2',
      title: 'B',
      subgenre: 'Contemporary',
      tags: ['Fake Dating'],
      rating: 4,
      readStatus: 'Read',
    }),
  ],
  fantasyHeavy: [
    makeBook({
      id: '3',
      title: 'C',
      subgenre: 'Romantasy',
      tags: ['Fae', 'Fated Mates'],
      rating: 5,
      fave: true,
      readStatus: 'Read',
    }),
    makeBook({
      id: '4',
      title: 'D',
      subgenre: 'Fantasy',
      tags: ['Magic Academy', 'Chosen One'],
      rating: 3,
      readStatus: 'Read',
    }),
  ],
  scifiAndDark: [
    makeBook({
      id: '5',
      title: 'E',
      subgenre: 'Science Fiction',
      tags: ['Space', 'AI'],
      rating: 4,
      readStatus: 'Read',
    }),
    makeBook({
      id: '6',
      title: 'F',
      subgenre: 'Dark Romance',
      tags: ['Mafia', 'Possessive'],
      rating: 2,
      readStatus: 'DNF',
    }),
  ],
  thinAndUnread: [
    makeBook({
      id: '7',
      title: 'G',
      subgenre: 'Romance',
      tags: [],
      rating: 0,
      readStatus: 'Unread',
    }),
  ],
  empty: [],
  mixedBag: [
    makeBook({
      id: '8',
      title: 'H',
      subgenre: 'Sports',
      tags: ['Grumpy/Sunshine'],
      rating: 4,
      readStatus: 'Read',
    }),
    makeBook({
      id: '9',
      title: 'I',
      subgenre: 'Horror',
      tags: ['Stalker', 'Obsessive'],
      rating: 5,
      fave: true,
      readStatus: 'Read',
    }),
    makeBook({
      id: '10',
      title: 'J',
      subgenre: 'Dystopian',
      tags: ['Cyberpunk'],
      rating: 1,
      readStatus: 'Read',
    }),
  ],
}

const KEYS: SkinId[] = ['tryst', 'grimoire', 'aphelion', 'marrow']

describe('cron ↔ core taste-math parity (golden fixtures)', () => {
  for (const [name, books] of Object.entries(LIBRARIES)) {
    it(`computeWeights matches computeSkinWeights for "${name}"`, () => {
      const core = computeSkinWeights(books)
      const cron = cronWeights(books.map(toRow))
      for (const k of KEYS) expect(cron[k]).toBeCloseTo(core[k], 12)
      // Dominant + insight are derived from the weights; they must agree too.
      expect(cronDominant(cron)).toBe(coreDominant(core))
      expect(cronInsight(cron)).toBe(coreInsight(core))
    })
  }

  it('weightDistance + isMaterialShift agree across every library pair', () => {
    const entries = Object.entries(LIBRARIES)
    const weights = entries.map(([, books]) => ({
      core: computeSkinWeights(books),
      cron: cronWeights(books.map(toRow)),
    }))
    for (let i = 0; i < weights.length; i++) {
      for (let j = 0; j < weights.length; j++) {
        const a = weights[i]!
        const b = weights[j]!
        expect(cronDistance(a.cron, b.cron)).toBeCloseTo(coreDistance(a.core, b.core), 12)
        expect(cronShift(a.cron, b.cron)).toBe(coreShift(a.core, b.core))
      }
    }
  })
})
