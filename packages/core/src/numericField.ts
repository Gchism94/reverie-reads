// Numeric form fields that write straight to a constrained column.
//
// The book editor used to parse these with `Number(v) || null`, which fails two ways at once:
// it silently turned any non-numeric input into "unset" (a pasted "2021-06-08", a month typed
// "June", a year with a thousands comma), and it treated a real 0 as blank. Worse, nothing checked
// the RANGE, so an out-of-range month or day reached Postgres and `books_pub_m_check` /
// `books_pub_d_check` rejected the whole PATCH — discarding every other edit in the same dialog,
// with no error shown to the reader.
//
// So: parse explicitly, and keep the bounds HERE, next to the parse, mirroring the CHECK
// constraints in 20260715010000_book_editing.sql. A value that would be rejected by the database
// is rejected by the form first, with a sentence saying why.

export interface NumericFieldSpec {
  /** field name as the reader sees it — used to build the message */
  label: string
  min?: number
  max?: number
  /** false for fields where decimals are meaningful (a #2.5 novella slot) */
  integer?: boolean
}

export type NumericFieldResult =
  /** `null` = genuinely blank, which is a legitimate "not set" for every field here */
  | { ok: true; value: number | null }
  | { ok: false; error: string }

/** Mirrors `books_pub_*_check`. Year has no CHECK, but the column is a smallint — bound it well
 *  under the 32767 overflow so a typo can't 500, while still admitting genuinely old books. */
export const PUB_YEAR: NumericFieldSpec = { label: 'Pub year', min: 1, max: 9999, integer: true }
export const PUB_MONTH: NumericFieldSpec = { label: 'Month', min: 1, max: 12, integer: true }
export const PUB_DAY: NumericFieldSpec = { label: 'Day', min: 1, max: 31, integer: true }
export const SERIES_COUNT: NumericFieldSpec = { label: 'Series length', min: 1, max: 999, integer: true }
/** Positions carry decimals on purpose — #0.5 prequels, #2.5 novellas — and 0 is a real slot. */
export const SERIES_POSITION: NumericFieldSpec = { label: 'Position', min: 0, max: 9999 }

/**
 * Parse one numeric field. Blank is fine and means "not set"; anything non-numeric or out of range
 * is an ERROR the caller must show, never a silent null.
 *
 * Deliberately stricter than `Number()`: that accepts '' (→ 0), '0x1f', '1e3' and whitespace-padded
 * junk, none of which a reader means when typing a year. Digits, one optional decimal point, and an
 * optional leading minus — nothing else.
 */
export function parseNumericField(raw: string, spec: NumericFieldSpec): NumericFieldResult {
  const s = raw.trim()
  if (s === '') return { ok: true, value: null }

  if (!/^-?\d+(\.\d+)?$/.test(s)) {
    return { ok: false, error: `${spec.label} must be a number.` }
  }
  const n = Number(s)
  if (!Number.isFinite(n)) return { ok: false, error: `${spec.label} must be a number.` }

  if (spec.integer && !Number.isInteger(n)) {
    return { ok: false, error: `${spec.label} must be a whole number.` }
  }
  if (spec.min != null && n < spec.min) {
    return { ok: false, error: `${spec.label} must be ${spec.min} or more.` }
  }
  if (spec.max != null && n > spec.max) {
    return { ok: false, error: `${spec.label} must be ${spec.max} or less.` }
  }
  return { ok: true, value: n }
}

/**
 * Parse a whole set of fields at once. Returns every error, so a form can mark all the bad fields
 * in one pass rather than surfacing them one save at a time.
 */
export function parseNumericFields<K extends string>(
  fields: Record<K, { raw: string; spec: NumericFieldSpec }>,
): { ok: true; values: Record<K, number | null> } | { ok: false; errors: Record<string, string> } {
  const values = {} as Record<K, number | null>
  const errors: Record<string, string> = {}
  for (const key of Object.keys(fields) as K[]) {
    const { raw, spec } = fields[key]
    const r = parseNumericField(raw, spec)
    if (r.ok) values[key] = r.value
    else errors[key] = r.error
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, values }
}
