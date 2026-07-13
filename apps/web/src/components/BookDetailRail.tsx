import { Link } from '@tanstack/react-router'
import { formatAuthors, bookOwnedFormats, type Book } from '@reverie/core'
import { subgenreGradient } from '../library/constants'
import { useLabels, useVoice } from '../skin/labels'
import { Chip } from './Chip'
import { CoverImage } from './CoverImage'
import { Nameplate } from './Nameplate'

const FORMAT_ICON = { physical: '📖', ebook: '📱', audiobook: '🎧' } as const
const FORMAT_LABEL = { physical: 'Physical', ebook: 'Ebook', audiobook: 'Audiobook' } as const

function seriesBadge(book: Book): string {
  if (book.status === 'Complete') return 'Series complete'
  if (book.status === 'Series')
    return `Series${book.seriesCount ? ` of ${book.seriesCount}` : ' · length not set'}`
  return 'Standalone'
}

/** The master-detail right rail: a read-only summary of the selected book with a link into the
 *  full book page for editing. Renders an invitation when nothing is selected. */
export function BookDetailRail({
  book,
  onToggleFave,
}: {
  book: Book | null
  onToggleFave?: (id: string) => void
}) {
  const labels = useLabels()
  const voice = useVoice()

  if (!book) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center text-muted">
        <span aria-hidden className="text-[28px] opacity-50">
          ✶
        </span>
        <p className="mt-3 text-[13px]">Select a book to see its details.</p>
      </div>
    )
  }

  const author = formatAuthors(book.contributors) || [book.first, book.last].filter(Boolean).join(' ')
  const [g0, g1] = subgenreGradient(book.subgenre)
  const isRead = book.readStatus === 'Read' || book.reads.length > 0
  const intensity = book.intensity ?? 0
  const owned = bookOwnedFormats(book)

  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 py-5">
      <div
        className="mx-auto aspect-[2/3] w-36 overflow-hidden rounded-xl border border-line"
        style={{ background: `linear-gradient(150deg, ${g0}, ${g1})` }}
      >
        <CoverImage book={book} />
      </div>

      <Nameplate
        className="mt-4"
        eyebrow={
          book.series ? `${book.series}${book.position !== '' ? ` · #${book.position}` : ''}` : undefined
        }
        title={book.title}
        subtitle={author || undefined}
      />

      <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
        <span
          className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={{ background: 'var(--chip)', color: 'var(--muted)' }}
        >
          {seriesBadge(book)}
        </span>
        {isRead && (
          <span
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{ background: 'color-mix(in srgb, var(--gold) 18%, transparent)', color: 'var(--ink)' }}
          >
            Read
          </span>
        )}
        {intensity > 0 && (
          <span
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{ background: 'color-mix(in srgb, var(--primary) 14%, transparent)', color: 'var(--ink)' }}
            title={`${labels.intensity} ${intensity}/5`}
          >
            {labels.intensityGlyph.repeat(intensity)}
          </span>
        )}
        {onToggleFave && (
          <button
            type="button"
            onClick={() => onToggleFave(book.id)}
            aria-pressed={book.fave}
            aria-label={book.fave ? 'Remove from favorites' : 'Add to favorites'}
            className="rounded-full border border-line px-2.5 py-1 text-[12px]"
            style={{ background: 'var(--chip)', color: book.fave ? 'var(--gold)' : 'var(--muted)' }}
          >
            {book.fave ? '♥' : '♡'}
          </button>
        )}
      </div>

      {book.tags.length > 0 && (
        <div className="mt-4">
          <div className="mb-1.5 text-[11px] uppercase tracking-[0.2em] text-muted">{labels.tags}</div>
          <div className="flex flex-wrap gap-1.5">
            {book.tags.slice(0, 10).map((t) => (
              <Chip key={t}>{t}</Chip>
            ))}
          </div>
        </div>
      )}

      {/* Read-only here like the rest of the rail — the ownership TOGGLE lives on the full page. */}
      {book.ownership === 'unowned' && (
        <div className="mt-4">
          <span
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-line px-2.5 py-1 text-[12px] font-semibold text-muted"
            style={{ background: 'var(--chip)' }}
          >
            ⊹ Wishlist — not owned yet
          </span>
        </div>
      )}

      {owned.length > 0 && (
        <div className="mt-4">
          <div className="mb-1.5 text-[11px] uppercase tracking-[0.2em] text-muted">Owned</div>
          <div className="flex flex-wrap gap-1.5">
            {owned.map((f) => (
              <span
                key={f}
                className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold text-ink"
                style={{ background: 'var(--chip)' }}
              >
                <span aria-hidden>{FORMAT_ICON[f]}</span> {FORMAT_LABEL[f]}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* The RESUME line — every composed rail speaks one when a book is mid-read (chunk 4,
          verdict-approved): "You left off — the lamps are still lit." / "THE TRAIL IS STILL WARM." */}
      {book.readStatus === 'Reading' && (
        <p className="mt-auto pt-4 text-[13px] italic text-muted" style={{ fontFamily: 'var(--font-display)' }}>
          {voice.resume}
        </p>
      )}

      <Link
        to="/book/$bookId"
        params={{ bookId: book.id }}
        className={`${book.readStatus === 'Reading' ? 'mt-2' : 'mt-auto'} flex h-11 items-center justify-center rounded-full text-[13.5px] font-semibold`}
        style={{ background: 'linear-gradient(135deg, var(--primary), var(--gold))', color: 'var(--on-primary)' }}
      >
        Open full page
      </Link>
    </div>
  )
}
