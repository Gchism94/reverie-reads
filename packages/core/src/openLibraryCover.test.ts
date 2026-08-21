import { describe, expect, it } from 'vitest'

// The Open Library blank-plate artifact, pinned. The LIVE ingest chain is the `covers` edge
// function (Deno — unimportable from Vitest), whose `?default=false` is the primary defence
// against this artifact and whose host-agnostic MIN_COVER_EDGE_PX floor is the backstop
// (supabase/functions/covers/index.ts). The gate never boots the Deno sandbox, so this file is the
// only EXECUTABLE guard that the artifact those defences are sized against is what we think it is
// — same pattern as sourcePace's Deno-parity test. The core-side URL builder that once lived
// beside this (buildOpenLibraryIsbnCoverUrl) was dead code and is gone; the knowledge is the
// artifact, not the builder.
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
