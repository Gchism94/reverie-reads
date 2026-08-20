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

// ── Order-independence — the actual claim of fix/format-rating-tiebreak ─────────────────────────
//
// The shipped comparison was strict (`r.date > cur.date`), so ties kept whichever row the fetch
// handed over first — the displayed rating could change between fetches. These cases each FAIL
// against that implementation by construction; the shuffle test is the general form (a fixture in
// one convenient order proves nothing about order-independence).

const readAt = (
  date: string,
  format: string,
  rating: number,
  createdAt?: string,
): Parameters<typeof latestRatingByFormat>[0][number] => ({
  date,
  format,
  rating,
  notes: '',
  ...(createdAt ? { createdAt } : {}),
})

/** Every permutation of a small array — 4 items = 24 orders, exhaustive beats sampled. */
function permutations<T>(arr: readonly T[]): T[][] {
  if (arr.length <= 1) return [[...arr]]
  return arr.flatMap((x, i) =>
    permutations([...arr.slice(0, i), ...arr.slice(i + 1)]).map((rest) => [x, ...rest]),
  )
}

describe('the pick is total — same answer for ANY input order', () => {
  it('every permutation (including reversed) of a tie-heavy read set yields the identical result', () => {
    const reads = [
      readAt('2026-03-01', 'Audiobook', 3, '2026-03-01T08:00:00Z'), // read_on tie, earlier logged
      readAt('2026-03-01', 'Audiobook', 4.5, '2026-03-02T09:00:00Z'), // read_on tie, later logged → wins
      readAt('', 'Paperback', 2, '2026-04-01T10:00:00Z'), // undated but logged latest of its format…
      readAt('2026-01-01', 'Paperback', 5, '2026-01-01T10:00:00Z'), // …still loses to ANY dated read
    ]
    const expected = latestRatingByFormat(reads)
    expect(expected).toEqual([
      { format: 'Audiobook', rating: 4.5, date: '2026-03-01' },
      { format: 'Paperback', rating: 5, date: '2026-01-01' },
    ])
    for (const p of permutations(reads)) {
      expect(latestRatingByFormat(p)).toEqual(expected)
    }
  })

  it('rule 3: same read_on, different createdAt — the later-LOGGED read wins, either input order', () => {
    const a = readAt('2026-05-01', 'Ebook', 2, '2026-05-01T08:00:00Z')
    const b = readAt('2026-05-01', 'Ebook', 4, '2026-05-01T20:00:00Z')
    const other = readAt('2026-05-02', 'Audiobook', 3)
    for (const order of [
      [a, b, other],
      [b, a, other],
    ]) {
      expect(latestRatingByFormat(order)).toContainEqual({
        format: 'Ebook',
        rating: 4,
        date: '2026-05-01',
      })
    }
  })

  it('rule 2: a dated read beats an undated one even when the undated arrives first', () => {
    const undatedFirst = [
      readAt('', 'Ebook', 1, '2026-06-09T08:00:00Z'),
      readAt('2026-06-01', 'Ebook', 4, '2026-01-01T08:00:00Z'),
      readAt('2026-06-02', 'Audiobook', 3),
    ]
    expect(latestRatingByFormat(undatedFirst)).toContainEqual({
      format: 'Ebook',
      rating: 4,
      date: '2026-06-01',
    })
  })

  it('both undated: the later-created read wins, either input order', () => {
    const older = readAt('', 'Ebook', 1, '2026-06-01T08:00:00Z')
    const newer = readAt('', 'Ebook', 4.5, '2026-06-02T08:00:00Z')
    const other = readAt('2026-06-02', 'Audiobook', 3)
    for (const order of [
      [older, newer, other],
      [newer, older, other],
    ]) {
      expect(latestRatingByFormat(order)).toContainEqual({
        format: 'Ebook',
        rating: 4.5,
        date: '',
      })
    }
  })

  it('the rendered ORDER is total too: two formats tied on date sort by name, not fetch order', () => {
    const reads = [readAt('2026-07-01', 'Paperback', 4), readAt('2026-07-01', 'Audiobook', 3)]
    const expected = latestRatingByFormat(reads)
    expect(expected.map((f) => f.format)).toEqual(['Audiobook', 'Paperback'])
    expect(latestRatingByFormat([...reads].reverse())).toEqual(expected)
  })

  it('#287 behaviour on unambiguous data is unchanged — most recent per format, no createdAt needed', () => {
    const out = latestRatingByFormat([
      read('2026-01-01', 'Audiobook', 5),
      read('2026-03-01', 'Audiobook', 3.5),
      read('2026-02-01', 'Paperback', 4),
    ])
    expect(out).toEqual([
      { format: 'Audiobook', rating: 3.5, date: '2026-03-01' },
      { format: 'Paperback', rating: 4, date: '2026-02-01' },
    ])
  })
})
