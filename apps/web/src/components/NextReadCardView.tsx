import { possessionState, type Book } from '@reverie/core'
import { CoverImage } from './CoverImage'
import { Surface } from './Surface'

const quietButton =
  'skin-control min-h-11 border border-line px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50'
const primaryButton =
  'skin-control skin-btn-primary min-h-11 px-4 py-2 text-sm font-semibold disabled:opacity-50'

/** Shared presentation; the reader route owns persistence and the public sample owns only memory. */
export function NextReadCardView({
  book,
  reportCoverErrors = true,
  reason,
  isRead = false,
  onOpen,
  onStart,
  onSave,
  starting = false,
  saving = false,
  startError = false,
}: {
  book: Book
  reportCoverErrors?: boolean
  reason: string
  isRead?: boolean
  onOpen?: () => void
  onStart: () => void
  onSave: () => void
  starting?: boolean
  saving?: boolean
  startError?: boolean
}) {
  const identity = (
    <>
      <div className="aspect-[2/3] w-20 shrink-0 overflow-hidden rounded-lg border border-line bg-[color:var(--field)]">
        <CoverImage reportErrors={reportCoverErrors} book={book} />
      </div>
      <div className="min-w-0">
        <h3
          className="break-words text-lg font-semibold leading-[1.3] text-ink"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {book.title}
        </h3>
        <p className="mt-1 text-sm text-ink">{[book.first, book.last].filter(Boolean).join(' ')}</p>
        <p className="mt-2 text-sm capitalize text-ink">
          {possessionState(book) === 'unset' ? 'No copy recorded' : possessionState(book)}
          {isRead ? ' · Reread' : book.readStatus === 'DNF' ? ' · Previously stopped' : ''}
        </p>
      </div>
    </>
  )
  return (
    <Surface tone="card" radius="panel" pad={4}>
      <article aria-label={book.title} className="flex h-full flex-col gap-4">
        {onOpen ? (
          <button
            type="button"
            onClick={onOpen}
            className="flex w-full items-start gap-4 text-left"
            aria-label={`Open ${book.title}`}
          >
            {identity}
          </button>
        ) : (
          <div className="flex w-full items-start gap-4 text-left">{identity}</div>
        )}
        <p className="text-sm leading-relaxed text-ink">{reason}</p>
        <div className="mt-auto flex flex-wrap gap-2">
          <button type="button" disabled={starting} className={primaryButton} onClick={onStart}>
            {starting ? 'Starting…' : isRead ? 'Read again' : 'Start reading'}
          </button>
          <button type="button" className={quietButton} disabled={saving} onClick={onSave}>
            Save for later
          </button>
        </div>
        {startError && (
          <p role="alert" className="text-sm text-muted">
            Could not start this read. Please try again.
          </p>
        )}
      </article>
    </Surface>
  )
}
