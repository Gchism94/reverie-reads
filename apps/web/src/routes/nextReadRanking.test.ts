import { describe, expect, it } from 'vitest'
import { makeBook } from '../../../../packages/core/src/book.fixture'
import { rankMoodPicks, rankNextReads, validateMood } from './MatchRoute'
import { emptyAnswers } from '../library/quiz'

describe('Next read uses the whole personal library as context', () => {
  it('learns series momentum from a finished book outside the available candidates', () => {
    const predecessor = makeBook({
      id: 'finished',
      title: 'Earlier',
      series: 'A journey',
      position: 1,
      readStatus: 'Read',
      rating: 5,
      ownership: 'unowned',
    })
    const next = makeBook({ id: 'next', title: 'Next', series: 'A journey', position: 2 })
    const other = makeBook({ id: 'other', title: 'Other' })
    const result = rankNextReads([other, next, predecessor], emptyAnswers(), { tasteOnly: true })
    expect(result.picks.map((p) => p.b.id)).toEqual(['next', 'other'])
    expect(result.picks[0]?.why).toBe('Next in A journey — a series you love')
  })
  it('offers an honest cold start without withholding low-scoring candidates', () => {
    const result = rankNextReads(
      [makeBook({ id: 'a', title: 'A', genre: '', subgenre: '' })],
      emptyAnswers(),
      { tasteOnly: true },
    )
    expect(result.headline).toBe('A place to start')
    expect(result.picks[0]?.why).toBe('From your personal library')
  })
})

describe('mood shortlist boundaries', () => {
  it('filters global results and applies the persistent feedback penalty to semantic order', () => {
    const a = makeBook({ id: 'a', title: 'A' })
    const b = makeBook({ id: 'b', title: 'B' })
    const outside = makeBook({ id: 'outside', title: 'Not available', ownership: 'unowned' })
    const hits = [
      { book_id: 'outside', similarity: 0.99 },
      { book_id: 'a', similarity: 0.9 },
      { book_id: 'b', similarity: 0.85 },
    ]
    expect(rankMoodPicks([a, b, outside], [a, b], hits, {}).map((p) => p.b.id)).toEqual(['a', 'b'])
    expect(
      rankMoodPicks([a, b, outside], [a, b], hits, { a: Date.now() }).map((p) => p.b.id),
    ).toEqual(['b', 'a'])
    expect(
      rankMoodPicks([a, b, outside], [a, b], hits, { a: Date.now() - 61 * 86400000 }).map(
        (p) => p.b.id,
      ),
    ).toEqual(['a', 'b'])
  })
})

it('restores only complete, valid mood choices from a URL', () => {
  expect(validateMood('0.0.0.0.0')).toBe('0.0.0.0.0')
  for (const bad of [null, {}, '0.0', '0.0.9.0.0', '0.0.0.0.0.0', '0.0.0.0.-1'])
    expect(validateMood(bad)).toBeUndefined()
})
