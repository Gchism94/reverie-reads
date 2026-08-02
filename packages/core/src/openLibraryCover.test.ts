import { describe, expect, it } from 'vitest'
import { buildOpenLibraryIsbnCoverUrl, fetchCover } from './covers'

// The Open Library cover chain: the ISBN-direct endpoint, its mandatory guard, and the artifact that
// guard exists to keep out.
//
// Cover-resolution approach adapted from work shared by Annabelle
// (https://github.com/Annabelle0726/somnia-library) — see docs/DATA_SOURCES.md.

/**
 * THE REAL ARTIFACT, not a stand-in. Captured verbatim from
 *   GET https://covers.openlibrary.org/b/isbn/9999999999999-L.jpg     (no ?default=false)
 * which answers a MISS with HTTP 200, no content-type, and these 43 bytes: a 1x1 GIF89a.
 *
 * It matters that this is the genuine response. A hand-rolled "tiny gif" would prove the floor
 * rejects something small; this proves it rejects the exact thing production would have stored. The
 * bytes decode to GIF magic `GIF8`, which `sniffImage` in the covers function accepts, so before the
 * dimension floor this would have normalized and been written as a durable cover with no fallback.
 */
export const OL_BLANK_PLATE_BASE64 = 'R0lGODlhAQABAPAAAAAAAP///yH5BAUAAAAALAAAAAABAAEAAAICRAEAOw=='
const bytes = Uint8Array.from(atob(OL_BLANK_PLATE_BASE64), (c) => c.charCodeAt(0))

describe('the blank-plate artifact is what we think it is', () => {
  it('is 43 bytes and carries GIF magic — so sniffImage would accept it', () => {
    expect(bytes.byteLength).toBe(43)
    // 0x47 0x49 0x46 0x38 === "GIF8", exactly the branch sniffImage matches on.
    expect([bytes[0], bytes[1], bytes[2], bytes[3]]).toEqual([0x47, 0x49, 0x46, 0x38])
  })

  it('declares 1x1 in its header — under any sane minimum edge', () => {
    // GIF89a logical screen descriptor: width and height are LE uint16 at offsets 6 and 8.
    const width = bytes[6]! | (bytes[7]! << 8)
    const height = bytes[8]! | (bytes[9]! << 8)
    expect([width, height]).toEqual([1, 1])
    expect(Math.min(width, height)).toBeLessThan(50) // MIN_COVER_EDGE_PX in the covers function
  })
})

describe('buildOpenLibraryIsbnCoverUrl', () => {
  it('always carries default=false — the whole reason for this URL shape', () => {
    const url = buildOpenLibraryIsbnCoverUrl('9781649374042')
    expect(url).toContain('default=false')
    expect(url).toBe('https://covers.openlibrary.org/b/isbn/9781649374042-L.jpg?default=false')
  })

  it('asks for -L, not -M — ingest normalizes to ~1200px and -M starves the resizer', () => {
    expect(buildOpenLibraryIsbnCoverUrl('9781649374042')).toContain('-L.jpg')
  })

  it('strips separators an ISBN may carry, keeping a trailing X', () => {
    expect(buildOpenLibraryIsbnCoverUrl('978-1-64937-404-2')).toContain('/9781649374042-L.jpg')
    expect(buildOpenLibraryIsbnCoverUrl('080442957X')).toContain('/080442957X-L.jpg')
  })
})

describe('fetchCover — ISBN-direct first, search as the no-ISBN fallback', () => {
  const searchHit = () =>
    Promise.resolve({ json: () => Promise.resolve({ docs: [{ cover_i: 42 }] }) })
  const searchMiss = () => Promise.resolve({ json: () => Promise.resolve({ docs: [] }) })

  it('takes the ISBN-direct URL when the endpoint says 200, without searching at all', async () => {
    let searched = false
    const url = await fetchCover(
      { title: 'Fourth Wing', last: 'Yarros', isbn: '9781649374042' },
      () => {
        searched = true
        return searchHit()
      },
      () => Promise.resolve({ ok: true, status: 200 }),
    )
    expect(url).toBe('https://covers.openlibrary.org/b/isbn/9781649374042-L.jpg?default=false')
    expect(searched, 'a direct hit must not also cost a search request').toBe(false)
  })

  it('falls through to search on a 404 — the documented "no cover for this ISBN"', async () => {
    const url = await fetchCover(
      { title: 'Fourth Wing', last: 'Yarros', isbn: '9781649374042' },
      searchHit,
      () => Promise.resolve({ ok: false, status: 404 }),
    )
    expect(url).toBe('https://covers.openlibrary.org/b/id/42-M.jpg')
  })

  it('uses search alone when there is no ISBN — the ~205 books that have none', async () => {
    const url = await fetchCover({ title: 'Some Indie', last: 'Author' }, searchHit)
    expect(url).toBe('https://covers.openlibrary.org/b/id/42-M.jpg')
  })

  it('returns empty when both paths miss — never a Google fallback', async () => {
    const url = await fetchCover(
      { title: 'Nothing', last: 'Nobody', isbn: '9999999999999' },
      searchMiss,
      () => Promise.resolve({ ok: false, status: 404 }),
    )
    expect(url).toBe('')
  })

  it('survives a network failure on the direct path by trying search', async () => {
    const url = await fetchCover(
      { title: 'Fourth Wing', last: 'Yarros', isbn: '9781649374042' },
      searchHit,
      () => Promise.reject(new Error('ECONNRESET')),
    )
    expect(url).toBe('https://covers.openlibrary.org/b/id/42-M.jpg')
  })
})
