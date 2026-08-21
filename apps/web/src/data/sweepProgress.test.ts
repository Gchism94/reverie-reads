import { describe, expect, it, vi } from 'vitest'
import type { Book } from '@reverie/core'
import { sweepCountText, type SweepCount } from './sweepProgress'

/** Swapped per test so the ordering assertion can see when a source call happens. */
let enrichCalls: () => void = () => {}

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => Promise.resolve({ data: [], error: null }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  },
}))
vi.mock('../lib/enrich', () => ({
  enrichBookOutcome: async () => {
    enrichCalls()
    return { status: 'empty' }
  },
}))
vi.mock('../lib/covers', () => ({ ingestCover: async () => ({ status: 'error', code: 'x' }) }))

/** A book `isIncomplete` accepts and `shouldCheck` clears — no cover, never enriched. */
const makeIncompleteBook = (id: string): Book => ({
  id, title: `Book ${id}`, first: 'Nell', last: 'Marrow', contributors: [],
  series: '', position: '', seriesCount: null, status: 'standalone',
  genre: 'fantasy', subgenre: '', subgenres: [], genres: [], tags: [], tropes: [], moods: [],
  intensity: null, cover: '', pages: null, isbn: '', fave: false,
  darkness: null,
  ownership: 'owned', borrowed: false, wishlist: false,
  owned: { physical: false, ebook: false, audiobook: false },
  format: '', rating: 0, readStatus: 'unset', source: '',
  pub: { y: null, m: null, d: null }, reads: [], plan: { y: null, m: null, d: null },
  progress: 0, addedTs: 0,
})

// THE PROPERTY: a sweep's on-screen count never carries a zero denominator.
//
// "⏹ Stop (0/0)" appeared at click time on a run that takes 20+ minutes — a Stop label, implying
// the sweep had started, beside a count saying it found nothing. It corrected once the first book
// resolved, which made it a lie rather than a visible bug.

/** Every string the display can produce, exhaustively enumerated over the reachable state space. */
const SCANNED = [0, 1, 2, 7, 399, 400]
const TOTALS: (number | null)[] = [null, 0, 1, 2, 7, 400]

describe('sweepCountText never renders a zero denominator', () => {
  it('produces no "/0" for any reachable (scanned, total) pair — nor a bare 0/0', () => {
    for (const scanned of SCANNED) {
      for (const total of TOTALS) {
        const text = sweepCountText({ scanned, total })
        expect(text, `scanned=${scanned} total=${String(total)}`).not.toContain('/0')
        expect(text, `scanned=${scanned} total=${String(total)}`).not.toBe('0/0')
      }
    }
  })

  it('says so in words while the total is still unknown, rather than guessing a number', () => {
    expect(sweepCountText({ scanned: 0, total: null })).toBe('starting…')
    // The state the reader actually sees at click: seeded, nothing counted, nothing scanned.
    expect(sweepCountText({ scanned: 0, total: null })).not.toMatch(/\d/)
  })

  it('renders nothing numeric-looking before a run starts at all', () => {
    expect(sweepCountText(null)).toBe('starting…')
  })

  it('shows a real ratio the moment the denominator is real', () => {
    expect(sweepCountText({ scanned: 0, total: 120 })).toBe('0/120')
    expect(sweepCountText({ scanned: 7, total: 120 })).toBe('7/120')
  })

  // A GENUINE zero total is a different thing from an unknown one: every candidate sits inside its
  // recheck window, so nothing is due. That is a real answer and must not be dressed as "starting…",
  // but it still must not divide by zero on screen.
  it('drops the denominator — not the count — when the total is genuinely zero', () => {
    expect(sweepCountText({ scanned: 0, total: 0 })).toBe('0')
    expect(sweepCountText({ scanned: 0, total: 0 })).not.toBe('starting…')
  })
})

describe('the real bulkComplete emits its total before the first request', () => {
  // The fix has two halves, and this is the one the enumeration above cannot see: a display that
  // handles null correctly is still useless if the producer withholds the number it already has.
  // So this runs the ACTUAL bulkComplete and records the interleaving of emissions and enrich calls.
  it('the first emission carries a real total and precedes any enrich call', async () => {
    const log: string[] = []
    const emitted: SweepCount[] = []
    enrichCalls = () => log.push('enrich')

    const { bulkComplete } = await import('./enrichLibrary')
    await bulkComplete(
      [makeIncompleteBook('b1'), makeIncompleteBook('b2'), makeIncompleteBook('b3')],
      (p) => {
        log.push('progress')
        emitted.push(p)
      },
      () => false,
    )

    expect(log[0], 'progress must be reported before the first source call').toBe('progress')
    expect(emitted[0], 'and that first report must carry the real count').toEqual({
      scanned: 0,
      total: 3,
      filled: 0,
    })
    expect(sweepCountText(emitted[0]!), 'which renders as a real ratio, never 0/0').toBe('0/3')
  })

  it('emits a real total even when it is zero, so the display never invents one', async () => {
    const emitted: SweepCount[] = []
    const { bulkComplete } = await import('./enrichLibrary')
    await bulkComplete([], (p) => emitted.push(p), () => false)

    expect(emitted[0]).toEqual({ scanned: 0, total: 0, filled: 0 })
    expect(sweepCountText(emitted[0]!)).toBe('0')
  })
})
