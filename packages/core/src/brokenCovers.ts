// Broken-cover telemetry aggregation (docs/COVER_SOURCING_AND_STUDIO.md, cover durability). A saved
// cover link can rot; the client detects it via <img> onerror. Per the doc's QUOTA caveat we must NOT
// emit one telemetry event per broken cover (an import tail can be hundreds → burns the Sentry free
// tier and drowns real errors) — so events are AGGREGATED into a single summary. This is the pure
// summary builder; the app batches/debounces broken events and calls captureMessage with the result.

export interface BrokenCover {
  ref: string
  title?: string
  author?: string
}

/**
 * Aggregate broken-cover events into ONE summary message + count. Dedups by ref (the same cover can
 * error more than once) and names a few example titles. Pure — the caller owns batching + the actual
 * captureMessage call.
 */
export function summarizeBrokenCovers(items: readonly BrokenCover[]): {
  count: number
  message: string
} {
  const seen = new Set<string>()
  const unique: BrokenCover[] = []
  for (const i of items) {
    if (i.ref && !seen.has(i.ref)) {
      seen.add(i.ref)
      unique.push(i)
    }
  }
  const count = unique.length
  const samples = unique.slice(0, 3).map((i) => (i.title && i.title.trim()) || i.ref)
  const more = count > samples.length ? `, +${count - samples.length} more` : ''
  const eg = samples.length ? ` (e.g. ${samples.join(', ')}${more})` : ''
  return { count, message: `${count} book cover${count === 1 ? '' : 's'} failed to load${eg}` }
}
