import { describe, expect, it } from 'vitest'
import { buildOpenLibraryIsbnCoverUrl } from './covers'

// The Open Library cover chain: the ISBN-direct endpoint, its mandatory guard, and the artifact that
// guard exists to keep out.
//
// Cover-resolution approach adapted from work shared by Annabelle
// (https://github.com/Annabelle0726/somnia-library) — see docs/reference/DATA_SOURCES.md.

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
