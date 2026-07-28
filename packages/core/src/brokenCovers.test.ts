import { describe, expect, it } from 'vitest'
import { summarizeBrokenCovers } from './brokenCovers'

describe('summarizeBrokenCovers', () => {
  it('aggregates into one summary with a count (never one event per cover)', () => {
    const r = summarizeBrokenCovers([
      { ref: '1', title: 'A' },
      { ref: '2', title: 'B' },
      { ref: '3', title: 'C' },
      { ref: '4', title: 'D' },
    ])
    expect(r.count).toBe(4)
    expect(r.message).toBe('4 book covers failed to load (e.g. A, B, C, +1 more)')
  })
  it('dedups by ref (same cover erroring twice counts once)', () => {
    const r = summarizeBrokenCovers([
      { ref: '1', title: 'A' },
      { ref: '1', title: 'A' },
    ])
    expect(r.count).toBe(1)
    expect(r.message).toBe('1 book cover failed to load (e.g. A)')
  })
  it('falls back to the ref when a title is missing, and handles empty', () => {
    expect(summarizeBrokenCovers([{ ref: 'abc' }]).message).toBe(
      '1 book cover failed to load (e.g. abc)',
    )
    expect(summarizeBrokenCovers([]).message).toBe('0 book covers failed to load')
  })
})
