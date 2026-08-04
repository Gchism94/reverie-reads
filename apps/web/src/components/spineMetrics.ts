import { spineDims } from '@reverie/core'

// The seated spine's px width range (thickness = page-count proxy hash). Lives outside Spine.tsx
// so SpineShelf can import it without tripping react-refresh's only-export-components rule —
// and so there is exactly one source for the number both the render and the shelf's
// fits-without-scrolling computation use.
export const SPINE_WIDTH_RANGE = [26, 48] as const

/** A book's seated (non-active) spine width — the same hash-driven number the render uses.
 *  SpineShelf COMPUTES a shelf's natural content width from this (does it fit without
 *  scrolling?) instead of measuring the DOM for it, which would be circular once the shelf
 *  starts spacing its slots in response. */
export function spineNaturalWidth(bookId: string): number {
  const { thickness } = spineDims(bookId)
  return Math.round(
    SPINE_WIDTH_RANGE[0] + thickness * (SPINE_WIDTH_RANGE[1] - SPINE_WIDTH_RANGE[0]),
  )
}
