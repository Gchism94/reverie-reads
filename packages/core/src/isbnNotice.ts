// Truncated-ISBN notice — a READ-ONLY detector over the detected ISBN column(s). It never mutates a
// value, never blocks import, never changes dedup/match: it only COUNTS ISBNs that look like they lost
// a leading digit (the one unrecoverable case — a zero destroyed on data entry, before the file
// existed). Books still import normally; the count lets the import summary say those ISBNs may not
// match. Lives in the shared layer so BOTH csv and xlsx imports feed it (truncation is a property of
// the data, not the format).

/**
 * True when a value looks like an ISBN that dropped a leading digit. NOT flagged: a valid ISBN-10
 * (9 digits + a final digit or `X`), a valid 13-digit ISBN-13, empty, or non-numeric junk (junk
 * isn't truncation). Flagged: an all-digit value of length 8–9 (truncated ISBN-10 — the real-world
 * case) or 11–12 (truncated ISBN-13 — lower confidence, near-zero in practice).
 */
export function isLikelyTruncatedIsbn(raw: string): boolean {
  const norm = (raw || '').replace(/[\s-]/g, '').toUpperCase()
  if (!norm) return false
  if (/^\d{13}$/.test(norm)) return false // valid ISBN-13
  if (/^\d{9}[\dX]$/.test(norm)) return false // valid ISBN-10 (incl. trailing X)
  if (!/^\d+$/.test(norm)) return false // junk / non-numeric — not a truncation
  const n = norm.length
  return (n >= 8 && n <= 9) || (n >= 11 && n <= 12)
}

const isIsbnHeader = (h: string) => h.trim().toLowerCase().includes('isbn')

/**
 * Count likely-truncated ISBNs across the ISBN column(s) of parsed CSV rows (row 0 = header). Scans
 * ONLY columns whose header names an ISBN; returns 0 when there's no ISBN column or no data rows.
 * Pure and read-only — it reads the rows and returns a number, mutating nothing.
 */
export function countTruncatedIsbns(rows: readonly (readonly string[])[]): number {
  if (rows.length < 2) return 0
  const header = rows[0] ?? []
  const cols: number[] = []
  header.forEach((h, i) => {
    if (isIsbnHeader(h)) cols.push(i)
  })
  if (!cols.length) return 0
  let count = 0
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] ?? []
    for (const c of cols) if (isLikelyTruncatedIsbn(row[c] ?? '')) count++
  }
  return count
}
