import { describe, expect, it } from 'vitest'
import { toBookRow } from './mappers'

describe('genre write normalization', () => {
  it('stores each core genre once using its canonical key', () => {
    expect(
      toBookRow({ genres: [' Romance ', 'romance', 'Fantasy', 'fantasy', ''] }).genres,
    ).toEqual(['romance', 'fantasy'])
  })

  it('keeps distinct provider labels in the same room', () => {
    expect(toBookRow({ genres: ['Thriller', 'Mystery'] }).genres).toEqual([
      'Thriller',
      'mystery',
    ])
  })
})
