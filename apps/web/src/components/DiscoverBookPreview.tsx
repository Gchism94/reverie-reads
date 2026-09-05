import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { normalizeIsbn, splitName, type Book } from '@reverie/core'
import { Modal } from './Modal'
import { CoverImage } from './CoverImage'
import { supabase } from '../lib/supabase'
import { enrichBookOutcome } from '../lib/enrich'
import { hitKey, type DiscoverHit } from '../lib/discover'

interface Details {
  description?: string | null
  publisher?: string | null
  language?: string | null
}
const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

/** Source prose is rendered as text, never trusted markup or generated marketing copy. */
function plainDescription(value: string): string {
  const doc = new DOMParser().parseFromString(value, 'text/html')
  doc.querySelectorAll('script,style').forEach((node) => node.remove())
  doc.querySelectorAll('p,br').forEach((node) => node.append('\n'))
  return doc.body.textContent?.trim() ?? ''
}

export function DiscoverBookPreview({
  hit,
  book,
  onClose,
}: {
  hit: DiscoverHit
  book?: Book
  onClose: () => void
}) {
  const author = hit.authors.join(', ')
  const { first, last } = splitName(hit.authors[0] ?? '')
  const details = useQuery({
    queryKey: ['discover-details', hit.corpusWorkId ?? hitKey(hit)],
    queryFn: async (): Promise<Details> => {
      if (hit.corpusWorkId) {
        const { data, error } = await supabase
          .from('works')
          .select('description,publisher,language')
          .eq('id', hit.corpusWorkId)
          .maybeSingle()
        if (error) throw error
        return data ?? {}
      }
      const result = await enrichBookOutcome({
        title: hit.title,
        author: hit.authors[0],
        isbn: hit.isbn || undefined,
      })
      if (result.status === 'failed' || result.status === 'rate_limited')
        throw new Error('Book details are unavailable right now.')
      if (result.status !== 'ok') return {}
      const data = result.data
      const isbn = normalizeIsbn(hit.isbn)
      const sameEdition =
        isbn &&
        [data.isbn, data.isbn10, data.isbn13, ...(data.isbns ?? [])].some(
          (value) => normalizeIsbn(value) === isbn,
        )
      const sameWork =
        normalize(hit.title) === normalize(data.title ?? '') &&
        Boolean(hit.authors[0]) &&
        (data.authors ?? []).some((name) => normalize(name) === normalize(hit.authors[0]!))
      // A plausible title search is not enough to show another work's synopsis as this one's.
      return sameEdition || (sameWork && data.confidence === 'high') ? data : {}
    },
    staleTime: 1000 * 60 * 30,
    retry: false,
  })
  const description = details.data?.description ? plainDescription(details.data.description) : ''
  return (
    <Modal title={hit.title} onClose={onClose} wide>
      <div className="grid gap-6 sm:grid-cols-[160px_minmax(0,1fr)]">
        <div
          className="mx-auto aspect-[2/3] w-36 overflow-hidden border border-line sm:w-full"
          style={{ borderRadius: 'var(--radius-card)' }}
        >
          <CoverImage book={{ title: hit.title, first, last, cover: hit.cover }} />
        </div>
        <div className="min-w-0">
          <p className="text-lg leading-relaxed text-ink">{author || 'Author not listed'}</p>
          <dl className="mt-4 grid gap-3 text-sm leading-relaxed">
            {hit.pub && (
              <div>
                <dt className="text-muted">Published</dt>
                <dd className="text-ink">{hit.pub}</dd>
              </div>
            )}
            {hit.isbn && (
              <div>
                <dt className="text-muted">ISBN</dt>
                <dd className="break-all text-ink">{hit.isbn}</dd>
              </div>
            )}
            {details.data?.publisher && (
              <div>
                <dt className="text-muted">Publisher</dt>
                <dd className="text-ink">{details.data.publisher}</dd>
              </div>
            )}
            {details.data?.language && (
              <div>
                <dt className="text-muted">Language</dt>
                <dd className="text-ink">{details.data.language}</dd>
              </div>
            )}
          </dl>
          {book && <p className="mt-4 text-sm font-semibold text-ink">Already in your library</p>}
        </div>
      </div>
      <div className="mt-6 border-t border-line pt-5">
        <h3 className="text-lg font-semibold leading-snug text-ink">About this book</h3>
        {details.isPending ? (
          <p role="status" className="mt-3 text-sm text-muted">
            Loading the catalog description…
          </p>
        ) : details.isError ? (
          <div role="alert" className="mt-3 text-sm leading-relaxed text-muted">
            <p>The description couldn’t be loaded. You can still keep browsing or add the book.</p>
            <button
              type="button"
              onClick={() => void details.refetch()}
              className="mt-2 min-h-11 text-ink underline underline-offset-4"
            >
              Try again
            </button>
          </div>
        ) : (
          <p className="mt-3 whitespace-pre-line text-base leading-relaxed text-ink">
            {description || 'There isn’t a description in this catalog record yet.'}
          </p>
        )}
        <p className="mt-4 text-xs leading-relaxed text-muted">
          {hit.corpusWorkId
            ? 'Details from the shared catalog.'
            : 'Details from catalog sources; editions may differ.'}{' '}
          Opening a preview doesn’t add the book to your library.
        </p>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-5">
        {book ? (
          <Link
            to="/book/$bookId"
            params={{ bookId: book.id }}
            className="skin-control skin-btn-primary inline-flex min-h-11 items-center px-4 text-sm font-semibold"
          >
            Open your book
          </Link>
        ) : (
          <Link
            to="/add"
            search={{
              work: hit.corpusWorkId,
              title: hit.title,
              author: hit.authors[0] || undefined,
              isbn: hit.isbn || undefined,
              cover: hit.cover || undefined,
              pub: hit.pub || undefined,
              want: true,
            }}
            className="skin-control skin-btn-primary inline-flex min-h-11 items-center px-4 text-sm font-semibold"
          >
            Add to wishlist
          </Link>
        )}
        <button
          type="button"
          onClick={onClose}
          className="skin-control skin-btn-secondary min-h-11 px-4 text-sm font-semibold"
        >
          Keep browsing
        </button>
      </div>
    </Modal>
  )
}
