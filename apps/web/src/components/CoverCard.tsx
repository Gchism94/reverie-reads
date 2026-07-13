import { formatAuthors, bookOwnedFormats, type Book } from '@reverie/core'
import { subgenreGradient } from '../library/constants'
import { useLabels } from '../skin/labels'
import { useBrokenCoverIds } from '../data/brokenCovers'
import { CoverImage } from './CoverImage'

const FORMAT_ICON = { physical: '📖', ebook: '📱', audiobook: '🎧' } as const

/** A library cover card with small spice (🌶️) and favorite (♥) marks — design signature. */
export function CoverCard({
  book,
  onOpen,
  onToggleFave,
  onAddCover,
  selected = false,
}: {
  book: Book
  onOpen: () => void
  onToggleFave: () => void
  /** When set, a no-cover placeholder carries a quiet "add a cover" affordance opening the sheet. */
  onAddCover?: () => void
  /** Master-detail selection (desktop): draws the accent ring + marks aria-current. */
  selected?: boolean
}) {
  const author = formatAuthors(book.contributors) || [book.first, book.last].filter(Boolean).join(' ')
  const [g0, g1] = subgenreGradient(book.subgenre)
  const isRead = book.readStatus === 'Read' || book.reads.length > 0
  const labels = useLabels()
  const intensity = book.intensity ?? 0

  // The skin-accent marks (--mark-accent: Tryst gold, Aphelion cyan) keep their flavour everywhere
  // axe can't measure them or where they still clear AA: over a real cover (contrast skipped over the
  // image), always in the accent. Over a PLACEHOLDER the colour comes from --mark-on-ph — by default
  // the accent in dark mode and white in light, but the non-inverting skins (Marginalia's bond page,
  // Almanac's buff manual) keep light placeholders at night and override it to white in tokens.css.
  // Scrim deepens over placeholders to hold the text. The mark silhouette follows --mark-radius
  // (Tryst round pills · Aphelion squared instrument tags) — the two-worlds signal.
  const brokenIds = useBrokenCoverIds()
  const showsPlaceholder = !book.cover || brokenIds.has(book.id)
  const markInk = showsPlaceholder ? 'var(--mark-on-ph)' : 'var(--mark-accent)'
  const markBg = showsPlaceholder ? 'rgba(0,0,0,0.62)' : 'rgba(0,0,0,0.45)'
  // Unowned (wishlist) ghost: the ARTWORK dims behind --ghost-opacity and the frame goes dashed;
  // title/author below and the marks keep full contrast (AA untouched).
  const unowned = book.ownership === 'unowned'

  return (
    <div className="group">
      <div
        className="skin-card relative aspect-[2/3] overflow-hidden border border-line transition-shadow motion-reduce:transition-none"
        style={{
          ...(selected ? { boxShadow: '0 0 0 2.5px var(--primary), var(--shadow)' } : undefined),
          ...(unowned ? { borderStyle: 'dashed' } : undefined),
        }}
      >
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Open ${book.title}`}
          aria-current={selected ? 'true' : undefined}
          className="block h-full w-full"
          style={{ background: `linear-gradient(150deg, ${g0}, ${g1})`, ...(unowned ? { opacity: 'var(--ghost-opacity)' } : undefined) }}
        >
          {/* cover → skin placeholder fallback + dead-link detection (Cover Studio) */}
          <CoverImage book={book} thumb />
        </button>

        {/* the honest placeholder invites — a quiet affordance, not a restyle (import-quality owns
            the placeholder's look). Sits above the intensity mark; opens the cover sheet. */}
        {showsPlaceholder && onAddCover && (
          <button
            type="button"
            onClick={onAddCover}
            aria-label={`Add a cover for ${book.title}`}
            className="absolute bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-0.5 text-[10px] font-semibold backdrop-blur"
            style={{ background: markBg, color: markInk, borderRadius: 'var(--mark-radius)' }}
          >
            + add a cover
          </button>
        )}

        <button
          type="button"
          onClick={onToggleFave}
          aria-pressed={book.fave}
          aria-label={book.fave ? `Remove ${book.title} from favorites` : `Add ${book.title} to favorites`}
          className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center text-[14px] opacity-0 backdrop-blur transition-opacity focus-visible:opacity-100 group-hover:opacity-100 aria-pressed:opacity-100"
          style={{ background: markBg, color: book.fave ? markInk : '#fff', borderRadius: 'var(--mark-radius)' }}
        >
          {book.fave ? '♥' : '♡'}
        </button>

        {isRead && (
          <span
            className="absolute left-1.5 top-1.5 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={{ background: markBg, color: markInk, borderRadius: 'var(--mark-radius)' }}
          >
            Read
          </span>
        )}

        {intensity > 0 && (
          <div
            className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 text-[10px] backdrop-blur"
            style={{ background: markBg, color: '#fff', borderRadius: 'var(--mark-radius)' }}
            title={`${labels.intensity} ${intensity}/5`}
          >
            {labels.intensityGlyph.repeat(intensity)}
          </div>
        )}

        {unowned && (
          <span
            className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={{ background: markBg, color: markInk, borderRadius: 'var(--mark-radius)' }}
          >
            ⊹ Wishlist
          </span>
        )}

        {bookOwnedFormats(book).length > 0 && (
          <div
            className="absolute bottom-1.5 right-1.5 flex gap-0.5 px-1 py-0.5 text-[10px] backdrop-blur"
            style={{ background: markBg, color: '#fff', borderRadius: 'var(--mark-radius)' }}
            title={`Owned: ${bookOwnedFormats(book).join(', ')}`}
          >
            {bookOwnedFormats(book).map((f) => (
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
