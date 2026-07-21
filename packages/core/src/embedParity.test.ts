import { describe, expect, it } from 'vitest'
import { embeddingSig as coreSig, embeddingText as coreText, type EmbedSource } from './embedding'
// The same file the Deno embed function imports — if the hand-mirrored copy drifts, this fails.
import { embeddingSig as fnSig, embeddingText as fnText } from '../../../supabase/functions/embed/signature'

const FIXTURES: EmbedSource[] = [
  {
    title: 'A Court of Thorns and Roses',
    author: 'Sarah J. Maas',
    series: 'ACOTAR',
    genre: 'romance',
    subgenre: 'Romantasy',
    tags: ['Fae', 'Enemies to Lovers', 'Slow Burn'],
    spice: 4,
  },
  { title: 'Carnage' },
  { title: 'Mile High', author: 'Liz Tomforde', genre: 'romance', subgenre: 'Sports', tags: ['Hockey', 'grumpy/sunshine'], spice: 3 },
  { title: 'The Works of Vermin', author: 'Hiron Ennes', genre: 'horror', tags: [] },
]

describe('embed mirror ↔ core parity', () => {
  it('embeddingText and embeddingSig are identical on the fixtures', () => {
    for (const f of FIXTURES) {
      expect(fnText(f)).toBe(coreText(f))
      expect(fnSig(f)).toBe(coreSig(f))
    }
  })
})
