import { Link } from '@tanstack/react-router'
import type { Book } from '@reverie/core'
import { CoverImage } from '../components/CoverImage'
import { TasteTier } from '../components/TasteTier'
import { useBooks } from '../data/books'
import { useEnsureEmbeddings, useSimilarBooks } from '../data/similar'
import { useTasteCalibration, useTasteScores } from '../data/taste'

/** Tier 2 on the book screen: the nearest neighbours from YOUR OWN shelves (semantic — same
 *  world, same tropes, same heat — not just same series). Renders nothing until embeddings
 *  exist; the sweep it kicks off fills the section in on a later visit. */
export function MoreLikeThis({ bookId }: { bookId: string }) {
  useEnsureEmbeddings()
  const { data: books } = useBooks()
  const q = useSimilarBooks(bookId)

  const byId = new Map((books ?? []).map((b) => [b.id, b]))
  const hits = (q.data ?? [])
    .map((h) => ({ similarity: h.similarity, book: byId.get(h.book_id) }))
    .filter((h): h is { similarity: number; book: Book } => !!h.book)
    .slice(0, 6)

  // The SAME taste tier a neighbour would show in Discover — a property of (book, reader), not of
  // this shelf. Sort stays neighbour-to-book similarity (unchanged); the tier is match-to-you.
  const { data: anchors } = useTasteCalibration()
  const { data: tasteScores } = useTasteScores(hits.map((h) => h.book.id))

  if (!hits.length) return null

  return (
    <div className="mt-4">
      <div className="skin-label mb-2 text-[11px] text-muted">
        More like this — from your shelves
      </div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {hits.map(({ book, similarity }) => (
          <Link
            key={book.id}
            to="/book/$bookId"
            params={{ bookId: book.id }}
            className="group block"
            title={`${book.title} · ${Math.round(similarity * 100)}% close`}
          >
            <div
              className="aspect-[2/3] overflow-hidden rounded-[6px] border border-line"
              style={{ background: 'var(--card)' }}
            >
              <CoverImage book={book} />
            </div>
            <div className="mt-1 break-words text-[11.5px] text-muted group-hover:text-ink">
              {book.title}
            </div>
            <TasteTier
              cos={tasteScores?.[book.id]}
              anchors={anchors}
              className="mt-0.5 block text-[10.5px] font-semibold"
            />
          </Link>
        ))}
      </div>
    </div>
  )
}
