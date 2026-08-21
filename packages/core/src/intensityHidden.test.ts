import { describe, expect, it } from 'vitest'
import {
  activeFilterCount,
  defaultFilters,
  withIntensityHidden,
  withIntensityHiddenSort,
} from './filters'

// Hiding a field must neutralize the STATE it left behind, not just stop rendering its controls.
// The failure this guards is invisible by construction: a stale `intensity: [4,5]` keeps filtering
// a grid whose only clear-it control has been removed from the screen.

describe('withIntensityHidden', () => {
  it('clears a live intensity filter when spice is hidden', () => {
    const f = { ...defaultFilters(), intensity: [4, 5] }
    expect(withIntensityHidden(f, true).intensity).toEqual([])
  })

  it('and the filter count follows, so the badge cannot claim a filter the reader cannot see', () => {
    const f = { ...defaultFilters(), intensity: [4, 5] }
    expect(activeFilterCount(f)).toBe(1)
    expect(activeFilterCount(withIntensityHidden(f, true))).toBe(0)
  })

  it('leaves every OTHER filter untouched — hiding spice hides spice, nothing else', () => {
    const f = { ...defaultFilters(), intensity: [3], fave: true, format: 'Paperback', q: 'ash' }
    const out = withIntensityHidden(f, true)
    expect(out).toEqual({ ...f, intensity: [] })
  })

  it('returns the SAME object when nothing is hidden — the visible path is unchanged', () => {
    const f = { ...defaultFilters(), intensity: [2] }
    expect(withIntensityHidden(f, false)).toBe(f)
  })

  it('returns the same object when hidden with no intensity filter set — no needless churn', () => {
    const f = defaultFilters()
    expect(withIntensityHidden(f, true)).toBe(f)
  })

  it('never mutates its argument', () => {
    const f = { ...defaultFilters(), intensity: [1, 2] }
    withIntensityHidden(f, true)
    expect(f.intensity).toEqual([1, 2])
  })
})

describe('withIntensityHiddenSort', () => {
  it('demotes an intensity sort to recent when hidden — otherwise the grid reads as shuffled', () => {
    expect(withIntensityHiddenSort('intensity', true)).toBe('recent')
  })

  it('leaves intensity sort alone when visible, and every other sort alone always', () => {
    expect(withIntensityHiddenSort('intensity', false)).toBe('intensity')
    for (const s of ['az', 'author', 'rating', 'recent', 'series'] as const) {
      expect(withIntensityHiddenSort(s, true)).toBe(s)
      expect(withIntensityHiddenSort(s, false)).toBe(s)
    }
  })
})
