import { describe, expect, it } from 'vitest'
import {
  PUB_DAY,
  PUB_MONTH,
  PUB_YEAR,
  SERIES_COUNT,
  SERIES_POSITION,
  parseNumericField,
  parseNumericFields,
} from './numericField'

describe('parseNumericField', () => {
  it('treats blank (and whitespace) as an honest "not set"', () => {
    expect(parseNumericField('', PUB_YEAR)).toEqual({ ok: true, value: null })
    expect(parseNumericField('   ', PUB_YEAR)).toEqual({ ok: true, value: null })
  })

  it('keeps 0 — the old `Number(v) || null` swallowed it', () => {
    expect(parseNumericField('0', SERIES_POSITION)).toEqual({ ok: true, value: 0 })
  })

  it('keeps decimals where they mean something (#2.5 novella)', () => {
    expect(parseNumericField('2.5', SERIES_POSITION)).toEqual({ ok: true, value: 2.5 })
  })

  it('rejects a decimal where the column is whole-numbered', () => {
    expect(parseNumericField('6.5', PUB_MONTH)).toEqual({
      ok: false,
      error: 'Month must be a whole number.',
    })
  })

  // The three shapes from the audit that used to vanish into null without a word.
  it('rejects, rather than silently drops, the real-world bad inputs', () => {
    expect(parseNumericField('June', PUB_MONTH)).toEqual({
      ok: false,
      error: 'Month must be a number.',
    })
    expect(parseNumericField('2021-06-08', PUB_YEAR)).toEqual({
      ok: false,
      error: 'Pub year must be a number.',
    })
    expect(parseNumericField('2,021', PUB_YEAR)).toEqual({
      ok: false,
      error: 'Pub year must be a number.',
    })
  })

  it('is stricter than Number() about junk it would otherwise coerce', () => {
    for (const junk of ['0x1f', '1e3', '  12  x', '--4', '.', '1.2.3']) {
      expect(parseNumericField(junk, PUB_DAY).ok, junk).toBe(false)
    }
  })

  // These are the two that used to reach Postgres and take the whole PATCH down with them.
  it('catches out-of-range month and day before the CHECK constraint can', () => {
    expect(parseNumericField('13', PUB_MONTH)).toEqual({
      ok: false,
      error: 'Month must be 12 or less.',
    })
    expect(parseNumericField('0', PUB_MONTH)).toEqual({
      ok: false,
      error: 'Month must be 1 or more.',
    })
    expect(parseNumericField('32', PUB_DAY)).toEqual({
      ok: false,
      error: 'Day must be 31 or less.',
    })
    expect(parseNumericField('0', PUB_DAY)).toEqual({ ok: false, error: 'Day must be 1 or more.' })
  })

  it('accepts every value the CHECK constraints allow, at the edges', () => {
    expect(parseNumericField('1', PUB_MONTH)).toEqual({ ok: true, value: 1 })
    expect(parseNumericField('12', PUB_MONTH)).toEqual({ ok: true, value: 12 })
    expect(parseNumericField('1', PUB_DAY)).toEqual({ ok: true, value: 1 })
    expect(parseNumericField('31', PUB_DAY)).toEqual({ ok: true, value: 31 })
  })

  it('bounds the year well under the smallint overflow', () => {
    expect(parseNumericField('9999', PUB_YEAR)).toEqual({ ok: true, value: 9999 })
    expect(parseNumericField('40000', PUB_YEAR)).toEqual({
      ok: false,
      error: 'Pub year must be 9999 or less.',
    })
    expect(parseNumericField('1', PUB_YEAR)).toEqual({ ok: true, value: 1 }) // genuinely old books
  })

  it('bounds series length sensibly', () => {
    expect(parseNumericField('7', SERIES_COUNT)).toEqual({ ok: true, value: 7 })
    expect(parseNumericField('0', SERIES_COUNT)).toEqual({
      ok: false,
      error: 'Series length must be 1 or more.',
    })
  })
})

describe('parseNumericFields', () => {
  const spec = {
    pubY: { raw: '2021', spec: PUB_YEAR },
    pubM: { raw: '6', spec: PUB_MONTH },
    pubD: { raw: '8', spec: PUB_DAY },
  }

  it('returns every parsed value when the whole set is valid', () => {
    const r = parseNumericFields(spec)
    expect(r).toEqual({ ok: true, values: { pubY: 2021, pubM: 6, pubD: 8 } })
  })

  it('collects EVERY error in one pass, not just the first', () => {
    const r = parseNumericFields({
      ...spec,
      pubM: { raw: '13', spec: PUB_MONTH },
      pubD: { raw: 'nope', spec: PUB_DAY },
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(Object.keys(r.errors).sort()).toEqual(['pubD', 'pubM'])
      expect(r.errors.pubM).toBe('Month must be 12 or less.')
      expect(r.errors.pubD).toBe('Day must be a number.')
    }
  })

  it('blank fields are not errors', () => {
    const r = parseNumericFields({
      pubY: { raw: '', spec: PUB_YEAR },
      pubM: { raw: '', spec: PUB_MONTH },
      pubD: { raw: '', spec: PUB_DAY },
    })
    expect(r).toEqual({ ok: true, values: { pubY: null, pubM: null, pubD: null } })
  })
})
