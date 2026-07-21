import { describe, expect, it } from 'vitest'
import {
  normalizeSeriesStatus,
  seriesStatusBadge,
  SERIES_STATUS_LABELS,
  SERIES_STATUS_VALUES,
} from './seriesStatus'

describe('series status', () => {
  it('every enum value has display copy', () => {
    for (const v of SERIES_STATUS_VALUES) expect(SERIES_STATUS_LABELS[v]).toBeTruthy()
    expect(SERIES_STATUS_VALUES).toEqual([
      'standalone',
      'ongoing',
      'completed',
      'on_hiatus',
      'cancelled',
      'interconnected_standalone',
      'interconnected_series',
    ])
  })

  it('normalizes the two widened interconnected values + likely import spellings', () => {
    expect(normalizeSeriesStatus('interconnected_standalone', true)).toBe('interconnected_standalone')
    expect(normalizeSeriesStatus('Interconnected Standalone', true)).toBe('interconnected_standalone')
    expect(normalizeSeriesStatus('interconnected standalones', true)).toBe('interconnected_standalone')
    expect(normalizeSeriesStatus('interconnected', true)).toBe('interconnected_standalone')
    expect(normalizeSeriesStatus('shared world', true)).toBe('interconnected_standalone')
    expect(normalizeSeriesStatus('companion series', true)).toBe('interconnected_standalone')
    expect(normalizeSeriesStatus('interconnected_series', true)).toBe('interconnected_series')
    expect(normalizeSeriesStatus('Interconnected Series', true)).toBe('interconnected_series')
    expect(normalizeSeriesStatus('interconnected universe', true)).toBe('interconnected_series')
  })

  it('badges the two interconnected statuses', () => {
    expect(seriesStatusBadge({ status: 'interconnected_standalone', seriesCount: null })).toBe('Interconnected standalone')
    expect(seriesStatusBadge({ status: 'interconnected_series', seriesCount: 6 })).toBe('Interconnected series of 6')
    expect(seriesStatusBadge({ status: 'interconnected_series', seriesCount: null })).toBe('Interconnected series')
  })

  it('normalizes the pre-expansion spellings (the migration mapping)', () => {
    expect(normalizeSeriesStatus('Standalone', false)).toBe('standalone')
    expect(normalizeSeriesStatus('Series', true)).toBe('ongoing')
    expect(normalizeSeriesStatus('Complete', true)).toBe('completed')
  })

  it('accepts the new values and loose import spellings', () => {
    expect(normalizeSeriesStatus('on_hiatus', true)).toBe('on_hiatus')
    expect(normalizeSeriesStatus('On Hiatus', true)).toBe('on_hiatus')
    expect(normalizeSeriesStatus('canceled', true)).toBe('cancelled')
    expect(normalizeSeriesStatus('CANCELLED', true)).toBe('cancelled')
    expect(normalizeSeriesStatus('ongoing', true)).toBe('ongoing')
    expect(normalizeSeriesStatus('finished', true)).toBe('completed')
  })

  it('unknown values fall back on whether the book names a series', () => {
    expect(normalizeSeriesStatus(null, false)).toBe('standalone')
    expect(normalizeSeriesStatus(null, true)).toBe('ongoing')
    expect(normalizeSeriesStatus('???', false)).toBe('standalone')
    expect(normalizeSeriesStatus('???', true)).toBe('ongoing')
  })

  it('badges speak the series’ publication status', () => {
    expect(seriesStatusBadge({ status: 'standalone', seriesCount: null })).toBe('Standalone')
    expect(seriesStatusBadge({ status: 'ongoing', seriesCount: 5 })).toBe('Series of 5')
    expect(seriesStatusBadge({ status: 'ongoing', seriesCount: null })).toBe('Series · length not set')
    expect(seriesStatusBadge({ status: 'completed', seriesCount: 3 })).toBe('Series complete')
    expect(seriesStatusBadge({ status: 'on_hiatus', seriesCount: null })).toBe('Series on hiatus')
    expect(seriesStatusBadge({ status: 'cancelled', seriesCount: 2 })).toBe('Series cancelled')
  })
})
