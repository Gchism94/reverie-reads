// Goodreads encodes series membership in the TITLE — `"Title (Series Name, #2)"` and friends.
// The parenthetical is display junk in Reverie (series/position are real fields), and worse, it
// breaks title-based duplicate matching against a clean library. Parse it out; never guess:
// only parentheticals that actually look series-shaped are consumed — "(Special Edition)" stays.

export interface SeriesRef {
  series: string
  /** '' when the parenthetical names a range (#1-3 omnibus) or carries no single position */
  position: number | ''
}

export interface ParsedSeriesTitle {
  /** the title with all series parentheticals removed */
  title: string
  series: string
  position: number | ''
  /** additional series memberships beyond the first ("Title (A, #1) (B, #3)" / "(A, #1; B, #3)") */
  more: SeriesRef[]
}

// One series reference inside a parenthetical: "Name, #2" · "Name #2.5" · "Name, #1-3" ·
// "Name, Book 2" · bare "Name, 2". The name must be non-empty; the marker must be present —
// a parenthetical with no positional marker is treated as part of the title, not a series.
const REF =
  /^\s*(.+?),?\s+(?:#\s*(\d+(?:\.\d+)?)(?:\s*[-–]\s*#?\d+(?:\.\d+)?)?|book\s+(\d+(?:\.\d+)?)|#\s*(\d+(?:\.\d+)?\s*[-–]\s*\d+(?:\.\d+)?))\s*$/i

function parseRef(chunk: string): SeriesRef | null {
  const m = REF.exec(chunk)
  if (!m || !m[1]) return null
  const isRange = /[-–]/.test(chunk.slice(chunk.indexOf('#')))
  const num = m[2] ?? m[3]
  return { series: m[1].trim(), position: isRange || num == null ? '' : Number(num) }
}

/**
 * Split a Goodreads title into clean title + series references. Walks trailing parentheticals
 * (Goodreads may stack several for multi-series books) and consumes only the series-shaped ones;
 * the walk stops at the first non-series parenthetical so mid-title parens are never touched.
 * A `#1-3` range keeps the series but leaves position unset ('' — an omnibus has no single slot).
 */
export function parseSeriesFromTitle(raw: string): ParsedSeriesTitle {
  let title = (raw ?? '').trim()
  const refs: SeriesRef[] = []

  for (;;) {
    const m = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(title)
    if (!m || !m[1]) break
    const inner = m[2] ?? ''
    // one parenthetical may hold several refs, ';'-separated: "(A, #1; B, #3)"
    const parts = inner.split(';').map(parseRef)
    if (parts.some((p) => p === null)) break // not (entirely) series-shaped → it's title text
    refs.unshift(...(parts as SeriesRef[]))
    title = m[1].trim()
  }

  const [first, ...more] = refs
  return { title, series: first?.series ?? '', position: first?.position ?? '', more }
}
