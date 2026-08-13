import { describe, expect, it } from 'vitest'
import {
  blendCuratedPool as coreBlend,
  CURATED_DISCOVER as coreData,
  tierDiscoverShelf as coreTier,
  type BlendableHit,
} from './discoverCurated'
// Same file the Deno releases function imports. If the hand-mirrored copy drifts from core, this
// test fails — the enrichParity.test.ts pattern, applied to the curated Discover module.
import {
  blendCuratedPool as fnBlend,
  CURATED_DISCOVER as fnData,
  tierDiscoverShelf as fnTier,
} from '../../../supabase/functions/releases/curated'

describe('discoverCurated core ↔ releases-fn mirror parity', () => {
  it('the curated data is identical', () => {
    expect(fnData).toEqual(coreData)
  })

  it('blend + tier produce identical output on a mixed fixture pool', () => {
    const live: BlendableHit[] = [
      {
        title: 'Fresh Live',
        authors: ['A'],
        cover: 'https://x/c.jpg',
        isbn: '9780000000010',
        pub: '2026-01-01',
      },
      {
        title: 'Old Live',
        authors: ['B'],
        cover: 'https://x/c.jpg',
        isbn: '9780000000011',
        pub: '2003',
      },
      // curated twin by ISBN — the dedupe path must agree between the two implementations
      {
        title: 'Fourth Wing (live)',
        authors: ['Rebecca Yarros'],
        cover: 'https://x/c.jpg',
        isbn: '9781649374080',
        pub: '2023-05-02',
      },
      { title: 'Undated', authors: ['C'], cover: 'https://x/c.jpg', isbn: '', pub: '' },
    ]
    for (const genre of ['romance', 'fantasy', 'science fiction', 'mystery', 'horror', 'cozy']) {
      expect(fnTier(fnBlend(genre, live), 2026), genre).toEqual(
        coreTier(coreBlend(genre, live), 2026),
      )
    }
  })
})
