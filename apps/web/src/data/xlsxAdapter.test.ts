import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { parseCSV } from '@reverie/core'
import { workbookToRows, rowsToCsv, xlsxToCsv, XlsxReadError } from './xlsxAdapter'

// The core guarantee: the adapter's rows are INDISTINGUISHABLE from the CSV path's rows for the same
// data, so importDetectedExport (and everything downstream) can't tell xlsx from csv. Plus the messy
// inputs that break detection if mishandled, and the unreadable-file fallback.

function wbOf(ws: XLSX.WorkSheet): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  return wb
}
function bytesOf(ws: XLSX.WorkSheet): Uint8Array {
  return XLSX.write(wbOf(ws), { type: 'array', bookType: 'xlsx' }) as Uint8Array
}

describe('xlsx adapter — rows identical to the CSV equivalent', () => {
  it('clean sheet → exactly the rows the equivalent CSV parses to (dates ISO, numbers as text)', async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Title', 'Author', 'My Rating', 'Date Read'],
      ['Fourth Wing', 'Rebecca Yarros', 5, 0],
    ])
    ws['D2'] = { t: 'n', v: 45720, z: 'm/d/yy' } // a real Excel date cell: serial 45720 = 2025-03-04

    const csv = await xlsxToCsv(bytesOf(ws))
    const equivalent = 'Title,Author,My Rating,Date Read\nFourth Wing,Rebecca Yarros,5,2025-03-04'
    expect(parseCSV(csv)).toEqual(parseCSV(equivalent))
  })

  it('messy: leading title row dropped, serial date → ISO, formula → cached value, number → text', async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['My Library', '', '', ''], // a banner row above the header
      ['Title', 'My Rating', 'Date Read', 'Pages'],
      ['Iron Flame', 4, 0, 0],
    ])
    ws['C3'] = { t: 'n', v: 45000, z: 'yyyy-mm-dd' } // serial date (a different format)
    ws['D3'] = { t: 'n', v: 640, f: 'A1' } // formula cell with a cached value

    const rows = parseCSV(await xlsxToCsv(bytesOf(ws)))
    expect(rows[0]).toEqual(['Title', 'My Rating', 'Date Read', 'Pages']) // title row gone
    expect(rows[1]![0]).toBe('Iron Flame')
    expect(rows[1]![1]).toBe('4') // numeric rating as text
    expect(rows[1]![2]).toMatch(/^\d{4}-\d{2}-\d{2}$/) // date is ISO, not "45000"
    expect(rows[1]![3]).toBe('640') // the cached value, never the formula "A1"
  })

  it('the same data via xlsx and via csv lands the same rows (round-trip identity)', async () => {
    const aoa = [
      ['Title', 'Author', 'ISBN13', 'My Rating', 'Exclusive Shelf'],
      ['A Court of Thorns and Roses', 'Sarah J. Maas', '9781619634442', 5, 'read'],
      ['Iron Flame', 'Rebecca Yarros', '9781649374172', 0, 'to-read'],
    ]
    const fromXlsx = parseCSV(await xlsxToCsv(bytesOf(XLSX.utils.aoa_to_sheet(aoa))))
    const fromCsv = parseCSV(rowsToCsv(aoa.map((r) => r.map(String))))
    expect(fromXlsx).toEqual(fromCsv)
  })
})

describe('xlsx adapter — fallback on unreadable / non-tabular input', () => {
  it('throws XlsxReadError when no sheet has a header + data across ≥2 columns', () => {
    const ws = XLSX.utils.aoa_to_sheet([['Just one column'], ['a value']])
    expect(() => workbookToRows(XLSX, wbOf(ws))).toThrow(XlsxReadError)
  })

  it('throws XlsxReadError when the header has data but no rows', () => {
    const ws = XLSX.utils.aoa_to_sheet([['Title', 'Author']])
    expect(() => workbookToRows(XLSX, wbOf(ws))).toThrow(XlsxReadError)
  })

  it('rejects with XlsxReadError on bytes that are not a spreadsheet', async () => {
    const garbage = new TextEncoder().encode('this is definitely not a spreadsheet')
    await expect(xlsxToCsv(garbage)).rejects.toBeInstanceOf(XlsxReadError)
  })
})

describe('rowsToCsv', () => {
  it('quotes cells containing commas, quotes, or newlines (parseCSV round-trips)', () => {
    const rows = [['a,b', 'c"d', 'e\nf'], ['x', 'y', 'z']]
    expect(parseCSV(rowsToCsv(rows))).toEqual(rows)
  })
})
