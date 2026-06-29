import { formatAuthors, ownedFormats, type Book } from '@reverie/core'
import { subgenreGradient } from '../library/constants'
import { useLabels } from '../skin/labels'
import { CoverImage } from './CoverImage'

const FORMAT_ICON = { physical: '📖', ebook: '📱', audiobook: '🎧' } as const

/** A library cover card with small spice (🌶️) and favorite (♥) marks — design signature. */
export function CoverCard({
  book,
  onOpen,
  onToggleFave,
  selected = false,
}: {
  book: Book
  onOpen: () => void
  onToggleFave: () => void
  /** Master-detail selection (desktop): draws the accent ring + marks aria-current. */
  selected?: boolean
}) {
  const author = formatAuthors(book.contributors) || [book.first, book.last].filter(Boolean).join(' ')
  const [g0, g1] = subgenreGradient(book.subgenre)
  const isRead = book.readStatus === 'Read' || book.reads.length > 0
  const labels = useLabels()
  const intensity = book.intensity ?? 0

  return (
    <div className="group">
      <div
        className="relative aspect-[2/3] overflow-hidden rounded-xl border border-line transition-shadow motion-reduce:transition-none"
        style={selected ? { boxShadow: '0 0 0 2.5px var(--primary), var(--shadow)' } : undefined}
      >
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Open ${book.title}`}
          aria-current={selected ? 'true' : undefined}
          className="block h-full w-full"
          style={{ background: `linear-gradient(150deg, ${g0}, ${g1})` }}
        >
          {/* cover → skin placeholder fallback + dead-link detection (Cover Studio) */}
          <CoverImage book={book} />
        </button>

        <button
          type="button"
          onClick={onToggleFave}
          aria-pressed={book.fave}
          aria-label={book.fave ? `Remove ${book.title} from favorites` : `Add ${book.title} to favorites`}
          className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full text-[14px] opacity-0 backdrop-blur transition-opacity focus-visible:opacity-100 group-hover:opacity-100 aria-pressed:opacity-100"
          style={{ background: 'rgba(0,0,0,0.62)', color: '#fff' }}
        >
          {book.fave ? '♥' : '♡'}
        </button>

        {isRead && (
          <span
            className="absolute left-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
            style={{ background: 'rgba(0,0,0,0.62)', color: '#fff' }}
          >
            Read
          </span>
        )}

        {intensity > 0 && (
          <div
            className="absolute bottom-1.5 left-1.5 rounded-full px-1.5 py-0.5 text-[9px] backdrop-blur"
            style={{ background: 'rgba(0,0,0,0.62)', color: '#fff' }}
            title={`${labels.intensity} ${intensity}/5`}
          >
            {labels.intensityGlyph.repeat(intensity)}
          </div>
        )}

        {ownedFormats(book.owned).length > 0 && (
          <div
            className="absolute bottom-1.5 right-1.5 flex gap-0.5 rounded-full px-1 py-0.5 text-[9px] backdrop-blur"
            style={{ background: 'rgba(0,0,0,0.62)', color: '#fff' }}
            title={`Owned: ${ownedFormats(book.owned).join(', ')}`}
          >
            {ownedFormats(book.owned).map((f) => (
              <span key={f}>{FORMAT_ICON[f]}</span>
            ))}
          </div>
        )}
      </div>

      <button type="button" onClick={onOpen} className="mt-1.5 block w-full text-left">
        <div className="truncate text-[12.5px] font-semibold text-ink">{book.title}</div>
        {author && <div className="truncate text-[11.5px] text-muted">{author}</div>}
      </button>
    </div>
  )
}
