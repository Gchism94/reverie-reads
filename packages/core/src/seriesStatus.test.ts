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
    expect(normalizeSeriesStatus('interconnected_standalone', true)).toBe(
      'interconnected_standalone',
    )
    expect(normalizeSeriesStatus('Interconnected Standalone', true)).toBe(
      'interconnected_standalone',
    )
    expect(normalizeSeriesStatus('interconnected standalones', true)).toBe(
      'interconnected_standalone',
    )
    expect(normalizeSeriesStatus('interconnected', true)).toBe('interconnected_standalone')
    expect(normalizeSeriesStatus('shared world', true)).toBe('interconnected_standalone')
    expect(normalizeSeriesStatus('companion series', true)).toBe('interconnected_standalone')
    expect(normalizeSeriesStatus('interconnected_series', true)).toBe('interconnected_series')
    expect(normalizeSeriesStatus('Interconnected Series', true)).toBe('interconnected_series')
    expect(normalizeSeriesStatus('interconnected universe', true)).toBe('interconnected_series')
  })

  it('badges the two interconnected statuses', () => {
    expect(
      seriesStatusBadge({ status: 'interconnected_standalone', seriesCount: null, series: '' }),
    ).toBe('Interconnected standalone')
    expect(
      seriesStatusBadge({
        status: 'interconnected_series',
        seriesCount: 6,
        series: 'Shared World',
      }),
    ).toBe('Interconnected series of 6')
    expect(
      seriesStatusBadge({
        status: 'interconnected_series',
        seriesCount: null,
        series: 'Shared World',
      }),
    ).toBe('Interconnected series')
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
    expect(seriesStatusBadge({ status: 'standalone', seriesCount: null, series: '' })).toBe(
      'Standalone',
    )
    expect(seriesStatusBadge({ status: 'ongoing', seriesCount: 5, series: 'Fourth Wing' })).toBe(
      'Series of 5',
    )
    expect(seriesStatusBadge({ status: 'ongoing', seriesCount: null, series: 'Fourth Wing' })).toBe(
      'Series · length not set',
    )
    expect(seriesStatusBadge({ status: 'completed', seriesCount: 3, series: 'Fourth Wing' })).toBe(
      'Series complete',
    )
    expect(
      seriesStatusBadge({ status: 'on_hiatus', seriesCount: null, series: 'Fourth Wing' }),
    ).toBe('Series on hiatus')
    expect(seriesStatusBadge({ status: 'cancelled', seriesCount: 2, series: 'Fourth Wing' })).toBe(
      'Series cancelled',
    )
  })
})

describe('seriesStatusBadge after a series removal', () => {
  // `status` and `series_count` SURVIVE a removal — nothing in remove_series_entry touches them,
  // and whether it should is a parked product question. So the row a removed book leaves behind is
  // exactly this: no series, but still `ongoing` and still counting. The badge used to answer
  // "Series of 5" for it.
  const removed = { status: 'ongoing', seriesCount: 5, series: '' } as const

  it('does not claim membership for a book that names no series', () => {
    expect(seriesStatusBadge(removed)).toBe('Standalone')
  })

  it('treats whitespace as no series, not as a name', () => {
    expect(seriesStatusBadge({ ...removed, series: '   ' })).toBe('Standalone')
  })

  it.each(['completed', 'on_hiatus', 'cancelled', 'interconnected_series'] as const)(
    'suppresses the membership claim for %s too, not just ongoing',
    (status) => {
      expect(seriesStatusBadge({ status, seriesCount: 5, series: '' })).toBe('Standalone')
    },
  )

  it('still reports the series once the book names one again', () => {
    expect(seriesStatusBadge({ ...removed, series: 'Fourth Wing' })).toBe('Series of 5')
  })

  it('leaves interconnected_standalone alone — it describes the book, not a series it sits in', () => {
    expect(
      seriesStatusBadge({ status: 'interconnected_standalone', seriesCount: null, series: '' }),
    ).toBe('Interconnected standalone')
  })
})
