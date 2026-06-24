import type { Book } from '@reverie/core'

/** A library cover card with small spice (🌶️) and favorite (♥) marks — design signature. */
export function CoverCard({ book, onToggleFave }: { book: Book; onToggleFave: () => void }) {
  const author = [book.first, book.last].filter(Boolean).join(' ')
  return (
    <div className="group">
      <div
        className="relative aspect-[2/3] overflow-hidden rounded-xl border border-line"
        style={{ background: 'var(--card)' }}
      >
        {book.cover ? (
          <img
            src={book.cover}
            alt={`${book.title} cover`}
            loading="lazy"
            className="h-full w-full object-cover"
            onError={(e) => {
              e.currentTarget.style.visibility = 'hidden'
            }}
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center p-3 text-center"
            style={{ background: 'linear-gradient(150deg, var(--violet), var(--primary))' }}
          >
            <span
              className="text-[13px] font-semibold leading-tight text-on-primary"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {book.title}
            </span>
          </div>
        )}

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

        {book.spice > 0 && (
          <div
            className="absolute bottom-1.5 left-1.5 rounded-full px-1.5 py-0.5 text-[9px] backdrop-blur"
            style={{ background: 'rgba(0,0,0,0.4)' }}
            title={`Spice ${book.spice}/5`}
          >
            {'🌶️'.repeat(book.spice)}
          </div>
        )}
      </div>

      <div className="mt-1.5 truncate text-[12.5px] font-semibold text-ink">{book.title}</div>
      {author && <div className="truncate text-[11.5px] text-muted">{author}</div>}
    </div>
  )
}
