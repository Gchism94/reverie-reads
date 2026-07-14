import { useState } from 'react'
import { upgradeCoverUrl } from '@reverie/core'
import { markCoverBroken } from '../data/brokenCovers'
import { CoverPlaceholder } from './CoverPlaceholder'

/**
 * A book cover that degrades gracefully: shows the image, and on a missing OR dead link falls back to
 * the skin-themed placeholder. A failed load is recorded (markCoverBroken) so the cover joins the
 * Cover Studio "needs attention" queue + the aggregated owner telemetry. FILLS its parent (the caller
 * provides the sized/bordered box), so it's a drop-in for the app's `{cover && <img …/>}` cover idiom.
 *
 * `thumb` prefers the ~300px stored thumbnail (grids/spines/shelves — the ingest pipeline's asset);
 * a dead thumb retries the full asset before surrendering to the placeholder.
 */
export function CoverImage({
  book,
  className = 'h-full w-full object-cover',
  thumb = false,
}: {
  book: { id?: string; title?: string; first?: string; last?: string; cover?: string | null; coverThumb?: string | null }
  className?: string
  thumb?: boolean
}) {
  const [failed, setFailed] = useState<Set<string>>(() => new Set())
  // Display-upgrade a hotlinked external cover to the size the surface needs — a never-ingested
  // Google/Open Library cover otherwise renders at its ~128px thumbnail and pixelates at detail/flip.
  // Grids ask for a lighter size (thumb → ~300px); detail/flip ask for the largest. Stored assets +
  // Hardcover/B&N pass through untouched. When a stored thumb is present it's already the right size.
  const full = book.cover ? upgradeCoverUrl(book.cover, thumb ? 'thumb' : 'full') : null
  const candidates = [thumb && book.coverThumb ? book.coverThumb : null, full].filter(
    (u): u is string => !!u && !failed.has(u),
  )
  const src = candidates[0]
  if (!src) return <CoverPlaceholder book={book} className={className} />
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      className={className}
      onError={() => {
        setFailed((prev) => new Set(prev).add(src))
        // Only a dead FULL cover joins the broken-cover queue — a stale thumb still has its fallback.
        if (book.id && src === full)
          markCoverBroken({ id: book.id, title: book.title, first: book.first, last: book.last })
      }}
    />
  )
}
