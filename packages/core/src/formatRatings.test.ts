import { describe, expect, it } from 'vitest'
import { latestRatingByFormat } from './formatRatings'

const read = (date: string, format: string, rating: number) => ({ date, format, rating, notes: '' })

describe('latestRatingByFormat — the audiobook-vs-print display rule', () => {
  it('returns [] when fewer than two formats carry rated reads — the surface stays absent', () => {
    expect(latestRatingByFormat([])).toEqual([])
    expect(latestRatingByFormat([read('2026-01-01', 'Audiobook', 4)])).toEqual([])
    expect(
      latestRatingByFormat([
        read('2026-01-01', 'Audiobook', 4),
        read('2026-02-01', 'Audiobook', 5),
      ]),
    ).toEqual([])
  })

  it('picks the MOST RECENT rated read per format — not the highest, not an average', () => {
    const out = latestRatingByFormat([
      read('2026-01-01', 'Audiobook', 5), // older, higher — must lose to the recent 3.5
      read('2026-03-01', 'Audiobook', 3.5),
      read('2026-02-01', 'Paperback', 4),
    ])
    expect(out).toEqual([
      { format: 'Audiobook', rating: 3.5, date: '2026-03-01' },
      { format: 'Paperback', rating: 4, date: '2026-02-01' },
    ])
  })

  it('unrated and format-less reads are invisible to it', () => {
    const out = latestRatingByFormat([
      read('2026-03-01', 'Audiobook', 0), // unrated reread must not shadow the rated one
      read('2026-01-01', 'Audiobook', 4.5),
      read('2026-02-01', '', 5),
      read('2026-02-15', 'Paperback', 3),
    ])
    expect(out).toEqual([
      { format: 'Paperback', rating: 3, date: '2026-02-15' },
      { format: 'Audiobook', rating: 4.5, date: '2026-01-01' },
    ])
  })

  it('sorts most-recent format first, so the current format leads the line', () => {
    const out = latestRatingByFormat([
      read('2026-01-01', 'Paperback', 4),
      read('2026-05-01', 'Audiobook', 3.5),
    ])
    expect(out.map((f) => f.format)).toEqual(['Audiobook', 'Paperback'])
  })
})
