import { describe, expect, it } from 'vitest'
import type { Book } from '@reverie/core'
import type { HouseholdBook } from '../data/household'
import { sharedCorpusDetailsDiffer } from './sharedCorpusDetails'

const personal = {
  series: 'Shared Cycle',
  position: 2,
  seriesCount: 4,
  status: 'ongoing',
  genre: 'fantasy',
  subgenre: 'epic fantasy',
  genres: ['fantasy'],
  subgenres: ['epic fantasy'],
  cover: 'cover.webp',
  pub: { y: 2028, m: null, d: null },
} satisfies Pick<
  Book,
  | 'series'
  | 'position'
  | 'seriesCount'
  | 'status'
  | 'genre'
  | 'subgenre'
  | 'genres'
  | 'subgenres'
  | 'cover'
  | 'pub'
>

const shared = {
  series: 'Shared Cycle',
  position: 2,
  seriesCount: 4,
  seriesStatus: 'ongoing',
  primaryGenre: 'fantasy',
  subgenre: 'epic fantasy',
  genres: ['fantasy'],
  subgenres: ['epic fantasy'],
  cover: 'cover.webp',
  publicationYear: 2028,
  publicationMonth: null,
  publicationDay: null,
} as HouseholdBook

describe('shared corpus adoption comparison', () => {
  it('offers adoption when only the structured series length differs', () => {
    expect(sharedCorpusDetailsDiffer(personal, { ...shared, seriesCount: 5 })).toBe(true)
  })

  it('offers adoption when only the series publication status differs', () => {
    expect(sharedCorpusDetailsDiffer(personal, { ...shared, seriesStatus: 'completed' })).toBe(true)
  })

  it('does not offer a merge when all shared details already match', () => {
    expect(sharedCorpusDetailsDiffer(personal, shared)).toBe(false)
  })
})
