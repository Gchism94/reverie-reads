import { describe, expect, it } from 'vitest'
import { embeddingSig, embeddingText } from './embedding'

describe('embeddingText', () => {
  it('composes the full line with stable field order', () => {
    expect(
      embeddingText({
        title: 'A Court of Thorns and Roses',
        author: 'Sarah J. Maas',
        series: 'ACOTAR',
        genre: 'romance',
        subgenre: 'Romantasy',
        tags: ['Fae', 'Enemies to Lovers'],
        spice: 4,
      }),
    ).toBe(
      'A Court of Thorns and Roses by Sarah J. Maas. Series: ACOTAR. World: romance / Romantasy. ' +
        'Tropes: enemies to lovers, fae. Heat 4 of 5.',
    )
  })

  it('omits blank fields cleanly (a bare title is just the title)', () => {
    expect(embeddingText({ title: 'Carnage' })).toBe('Carnage.')
    expect(embeddingText({ title: 'Carnage', spice: 0, tags: [] })).toBe('Carnage.')
  })

  it('is order-insensitive and case-dedupes tags (chip reordering never re-embeds)', () => {
    const a = embeddingText({ title: 'X', tags: ['Slow Burn', 'fae', 'Fae'] })
    const b = embeddingText({ title: 'X', tags: ['Fae', 'Slow Burn'] })
    expect(a).toBe(b)
  })
})

describe('embeddingSig', () => {
  it('is stable for identical sources and moves when content moves', () => {
    const base = { title: 'X', tags: ['Fae'] }
    expect(embeddingSig(base)).toBe(embeddingSig({ ...base }))
    expect(embeddingSig(base)).not.toBe(embeddingSig({ ...base, tags: ['Fae', 'Slow Burn'] }))
    expect(embeddingSig(base)).toMatch(/^[0-9a-f]{8}$/)
  })
})
