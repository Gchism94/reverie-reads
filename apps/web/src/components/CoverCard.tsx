import { ownedFormats, type Book } from '@reverie/core'
import { subgenreGradient } from '../library/constants'
import { useLabels } from '../skin/labels'

const FORMAT_ICON = { physical: '📖', ebook: '📱', audiobook: '🎧' } as const

/** A library cover card with small spice (🌶️) and favorite (♥) marks — design signature. */
export function CoverCard({
  book,
  onOpen,
  onToggleFave,
}: {
  book: Book
  onOpen: () => void
  onToggleFave: () => void
}) {
  const author = [book.first, book.last].filter(Boolean).join(' ')
  const [g0, g1] = subgenreGradient(book.subgenre)
  const isRead = book.readStatus === 'Read' || book.reads.length > 0
  const labels = useLabels()
  const intensity = book.intensity ?? 0

  return (
    <div className="group">
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl border border-line">
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Open ${book.title}`}
          className="block h-full w-full"
          style={{ background: `linear-gradient(150deg, ${g0}, ${g1})` }}
        >
          {book.cover ? (
            <img
              src={book.cover}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
              onError={(e) => {
                e.currentTarget.style.visibility = 'hidden'
              }}
            />
          ) : (
            <span
              className="flex h-full w-full items-center justify-center p-3 text-center text-[13px] font-semibold leading-tight text-on-primary"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {book.title}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={onToggleFave}
          aria-pressed={book.fave}
          aria-label={book.fave ? `Remove ${book.title} from favorites` : `Add ${book.title} to favorites`}
          className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full text-[14px] opacity-0 backdrop-blur transition-opacity focus-visible:opacity-100 group-hover:opacity-100 aria-pressed:opacity-100"
          style={{ background: 'rgba(0,0,0,0.4)', color: book.fave ? 'var(--gold)' : '#fff' }}
        >
          {book.fave ? '♥' : '♡'}
        </button>

        {isRead && (
          <span
            className="absolute left-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
            style={{ background: 'rgba(0,0,0,0.45)', color: 'var(--gold)' }}
          >
            Read
          </span>
        )}

        {intensity > 0 && (
          <div
            className="absolute bottom-1.5 left-1.5 rounded-full px-1.5 py-0.5 text-[9px] backdrop-blur"
            style={{ background: 'rgba(0,0,0,0.4)' }}
            title={`${labels.intensity} ${intensity}/5`}
          >
            {labels.intensityGlyph.repeat(intensity)}
          </div>
        )}

        {ownedFormats(book.owned).length > 0 && (
          <div
            className="absolute bottom-1.5 right-1.5 flex gap-0.5 rounded-full px-1 py-0.5 text-[9px] backdrop-blur"
            style={{ background: 'rgba(0,0,0,0.4)' }}
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
