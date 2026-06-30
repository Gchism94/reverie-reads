import type * as XLSXNS from 'xlsx'

/**
 * XLSX import adapter — a THIN bridge that turns a spreadsheet into the exact CSV-style rows the
 * existing CSV path already produces, so `importDetectedExport` can't tell the source apart. This is
 * NOT a second import pipeline: everything downstream of "rows" (column detection, add/merge,
 * DuplicateReview, the in-flow + Settings screens) is the CSV path, untouched.
 *
 * The SheetJS parser is **dynamic-imported** in `xlsxToCsv()` so it only loads when a user actually
 * picks an `.xlsx` file — most imports are CSV, so the parser must stay out of the entry bundle and
 * land in a lazy chunk.
 *
 * Pinned to the current SheetJS build (cdn.sheetjs.com/xlsx-0.20.3), not the stale npm `xlsx@0.18.5`.
 */

type XLSXModule = typeof XLSXNS

/** SSF (number-format) helpers we use — typed narrowly since the bundled d.ts omits `is_date`. */
type SSF = {
  is_date(fmt: string): boolean
  parse_date_code(code: number): { y: number; m: number; d: number } | null
}

/** Thrown when the file isn't a readable, tabular spreadsheet — the callers turn this into a legible
 *  "we couldn't read this spreadsheet" with a way forward, never a silent stall. */
export class XlsxReadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'XlsxReadError'
  }
}

const p2 = (n: number) => String(n).padStart(2, '0')

/**
 * One worksheet cell → the string a CSV would carry. The failure modes that would let detection tell
 * xlsx from csv, each handled:
 *  - dates: Excel stores them as serial numbers — convert via SSF on the SERIAL (pure arithmetic, so
 *    TZ-proof; a JS `Date` round-trips off-by-one) to `YYYY-MM-DD`, the format the CSV date parser eats.
 *  - numbers: the raw value as a string (ratings / pages / years), never the formatted `.w` (no commas).
 *  - formula cells: the cached/computed value (`.v`), never the formula text (`.f`).
 *  - whitespace / empties: trimmed; empty → "".
 */
function cellToString(XLSX: XLSXModule, cell: XLSXNS.CellObject | undefined): string {
  if (!cell || cell.v == null || cell.v === '') return ''
  if (cell.t === 'n') {
    const ssf = XLSX.SSF as unknown as SSF
    if (typeof cell.z === 'string' && ssf.is_date(cell.z)) {
      const d = ssf.parse_date_code(cell.v as number)
      if (d && d.y) return `${d.y}-${p2(d.m)}-${p2(d.d)}`
    }
    return String(cell.v)
  }
  if (cell.t === 'b') return cell.v ? 'TRUE' : 'FALSE'
  return String(cell.v).trim()
}

function sheetRows(XLSX: XLSXModule, ws: XLSXNS.WorkSheet): string[][] {
  const ref = ws['!ref']
  if (!ref) return []
  const range = XLSX.utils.decode_range(ref)
  const rows: string[][] = []
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: string[] = []
    for (let c = range.s.c; c <= range.e.c; c++) {
      row.push(cellToString(XLSX, ws[XLSX.utils.encode_cell({ r, c })]))
    }
    rows.push(row)
  }
  return rows
}

const isBlank = (row: string[]) => row.every((c) => c === '')
const filled = (row: string[]) => row.filter((c) => c !== '').length

/** Drop leading all-blank rows; if a lone title cell sits directly above a wider header row, drop it
 *  too (a common "My Library" banner before the real header). */
function trimToHeader(rows: string[][]): string[][] {
  let i = 0
  while (i < rows.length && isBlank(rows[i]!)) i++
  if (i + 1 < rows.length && filled(rows[i]!) === 1 && filled(rows[i + 1]!) >= 2) i++
  return rows.slice(i)
}

/** Trim trailing all-empty columns (Excel often over-extends the used range) so the rows match a
 *  clean CSV's shape exactly. Columns are defined by the header row. */
function trimTrailingCols(rows: string[][]): string[][] {
  const header = rows[0] ?? []
  let last = header.length - 1
  while (last >= 0 && header[last] === '') last--
  return rows.map((r) => r.slice(0, last + 1))
}

/** Workbook → rows of strings, indistinguishable from CSV-parse output. Pure (takes the XLSX
 *  namespace + workbook), so it's unit-testable without the dynamic import. Picks the FIRST non-empty
 *  sheet; throws `XlsxReadError` if no sheet has a header + at least one data row across ≥2 columns. */
export function workbookToRows(XLSX: XLSXModule, wb: XLSXNS.WorkBook): string[][] {
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]
    if (!ws) continue
    const rows = trimToHeader(sheetRows(XLSX, ws)).filter((r) => !isBlank(r))
    if (rows.length >= 2 && filled(rows[0]!) >= 2) return trimTrailingCols(rows)
  }
  throw new XlsxReadError('We couldn’t find a readable table in that spreadsheet.')
}

const NEEDS_QUOTE = /[",\r\n]/
/** Serialize rows to CSV text the existing `parseCSV` reads back identically (RFC-style quoting). */
export function rowsToCsv(rows: string[][]): string {
  return rows
    .map((row) => row.map((c) => (NEEDS_QUOTE.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(','))
    .join('\n')
}

function resolveXlsx(mod: unknown): XLSXModule {
  const m = mod as { read?: unknown; default?: unknown }
  return (m.read ? m : m.default) as XLSXModule
}

/** Parse `.xlsx` bytes into CSV text for `importDetectedExport`. Lazy-loads SheetJS. Throws
 *  `XlsxReadError` on an unreadable / non-tabular / empty file. */
export async function xlsxToCsv(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  let mod: unknown
  try {
    mod = await import('xlsx')
  } catch {
    throw new XlsxReadError('Couldn’t load the spreadsheet reader.')
  }
  const XLSX = resolveXlsx(mod)
  let wb: XLSXNS.WorkBook
  try {
    // cellNF (not cellDates) keeps dates as their serial + format, so we convert TZ-proof via SSF.
    wb = XLSX.read(bytes, { type: 'array', cellNF: true })
  } catch {
    throw new XlsxReadError('That file isn’t a spreadsheet we can read.')
  }
  return rowsToCsv(workbookToRows(XLSX, wb))
}

/** The one entry both import call sites use: a picked file → CSV text for `importDetectedExport`.
 *  `.xlsx` goes through the lazy adapter; everything else is read as text (the CSV path), unchanged. */
export async function fileToCsvText(file: File): Promise<string> {
  if (/\.xlsx$/i.test(file.name)) return xlsxToCsv(await file.arrayBuffer())
  return file.text()
}
