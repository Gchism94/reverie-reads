import { useState } from 'react'
import { markCoverBroken } from '../data/brokenCovers'
import { CoverPlaceholder } from './CoverPlaceholder'

/**
 * A book cover that degrades gracefully: shows the image, and on a missing OR dead link falls back to
 * the skin-themed placeholder. A failed load is recorded (markCoverBroken) so the cover joins the
 * Cover Studio "needs attention" queue and the aggregated owner telemetry. Reusable anywhere a cover
 * renders (the main grid can adopt it with a one-line swap).
 */
export function CoverImage({
  book,
  className,
}: {
  book: { id: string; title?: string; first?: string; last?: string; cover?: string | null }
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  if (!book.cover || failed) return <CoverPlaceholder book={book} className={className} />
  return (
    <img
      src={book.cover}
      alt={`${book.title ?? 'Book'} cover`}
      className={className}
      loading="lazy"
      style={{ aspectRatio: '2 / 3', objectFit: 'cover', borderRadius: 10, border: '1px solid var(--line)', display: 'block', width: '100%' }}
      onError={() => {
        setFailed(true)
        markCoverBroken(book)
      }}
    />
  )
}
