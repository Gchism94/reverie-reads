import { useState } from 'react'
import { coverCandidates, isGoogleNoCoverArt } from '@reverie/core'
import { markCoverBroken } from '../data/brokenCovers'
import { CoverPlaceholder } from './CoverPlaceholder'

/**
 * A book cover that degrades gracefully. It walks an ordered candidate chain — the display-upgraded
 * (larger) URL first, then the **un-upgraded original**, then the skin placeholder — so a hotlinked
 * cover renders sharp when the larger scan exists but degrades to the real, smaller cover when it
 * doesn't, never to a broken state. Two failure signals advance the chain:
 *   · `onError` — a genuinely dead link (404 / network).
 *   · `onLoad` + `isGoogleNoCoverArt` — Google Books answers a MISSING cover with a stock "image not
 *     available" plate at HTTP 200, which `onError` can't catch; we detect it by its fixed size.
 * When the LAST candidate fails, the cover joins the Cover Studio "needs attention" queue (aggregated
 * telemetry). FILLS its parent (the caller provides the sized/bordered box), so it's a drop-in for the
 * app's `{cover && <img …/>}` cover idiom.
 *
 * `thumb` prefers the ~300px stored thumbnail (grids/spines/shelves — the ingest pipeline's asset) and
 * a lighter display size; detail/flip ask for the largest.
 */
export function CoverImage({
  book,
  className = 'h-full w-full object-cover',
  thumb = false,
  ghost = false,
}: {
  book: { id?: string; title?: string; first?: string; last?: string; cover?: string | null; coverThumb?: string | null }
  className?: string
  thumb?: boolean
  /**
   * "Not in hand" (wishlist / unset): dim the ARTWORK behind --ghost-opacity.
   *
   * Owned here rather than by the caller because only this component knows whether it is about to
   * render artwork or the placeholder — and the placeholder is TYPE. Callers used to wrap the whole
   * box in the opacity, which composited the placeholder's title and author against the card behind
   * it and dropped them under AA (axe caught marrow's box-lid plate at 4.16:1 dark, 3.38:1 light).
   * Dimming a photograph is a legible visual state; dimming a word is just harder to read. When the
   * placeholder shows, the ghost signal is carried by the caller's dashed frame instead.
   */
  ghost?: boolean
}) {
  const [failed, setFailed] = useState<Set<string>>(() => new Set())
  const chain = coverCandidates(book.cover, {
    size: thumb ? 'thumb' : 'full',
    storedThumb: thumb ? book.coverThumb : null,
  })
  const candidates = chain.filter((u) => !failed.has(u))
  const src = candidates[0]
  if (!src) return <CoverPlaceholder book={book} className={className} />
  // The last untried candidate: its failure is a genuine dead end → placeholder + broken telemetry.
  const isLast = candidates.length === 1
  const fail = (): void => {
    setFailed((prev) => new Set(prev).add(src))
    if (book.id && isLast)
      markCoverBroken({ id: book.id, title: book.title, first: book.first, last: book.last })
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      // Covers sit inside `draggable` reorder containers (shelf grid cards, the /shelves shelf rows).
      // A native <img> is draggable by default and would hijack the reorder gesture with an image drag
      // — so opt out and let the parent's drag-to-reorder win. Keyboard ▲▼/◀▶ fallbacks are unaffected.
      draggable={false}
      className={className}
      style={ghost ? { opacity: 'var(--ghost-opacity)' } : undefined}
      onLoad={(e) => {
        // A Google "no image" plate loads successfully (HTTP 200) — reject it by its fixed size so the
        // chain falls back to the real original, or to the honest placeholder when nothing's left.
        const img = e.currentTarget
        if (isGoogleNoCoverArt(src, img.naturalWidth, img.naturalHeight)) fail()
      }}
      onError={fail}
    />
  )
}
