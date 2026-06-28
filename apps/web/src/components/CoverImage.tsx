import { useState } from 'react'
import { markCoverBroken } from '../data/brokenCovers'
import { CoverPlaceholder } from './CoverPlaceholder'

/**
 * A book cover that degrades gracefully: shows the image, and on a missing OR dead link falls back to
 * the skin-themed placeholder. A failed load is recorded (markCoverBroken) so the cover joins the
 * Cover Studio "needs attention" queue + the aggregated owner telemetry. FILLS its parent (the caller
 * provides the sized/bordered box), so it's a drop-in for the app's `{cover && <img …/>}` cover idiom.
 */
export function CoverImage({
  book,
  className = 'h-full w-full object-cover',
}: {
  book: { id?: string; title?: string; first?: string; last?: string; cover?: string | null }
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  if (!book.cover || failed) return <CoverPlaceholder book={book} className={className} />
  return (
    <img
      src={book.cover}
      alt=""
      loading="lazy"
      decoding="async"
      className={className}
      onError={() => {
        setFailed(true)
        if (book.id) markCoverBroken({ id: book.id, title: book.title, first: book.first, last: book.last })
      }}
    />
  )
}
