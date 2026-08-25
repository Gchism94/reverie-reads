import { useState } from 'react'
import { coverCandidates, isDegenerateGoogleCoverRender } from '@reverie/core'
import type { HouseholdBook } from '../data/household'
import { subgenreGradient } from '../library/constants'
import { CoverPlaceholder } from './CoverPlaceholder'
import { Nameplate } from './Nameplate'
import { Surface } from './Surface'

export type LibraryScope = 'personal' | 'household'

export function LibraryScopeControl({
  scope,
  onChange,
}: {
  scope: LibraryScope
  onChange: (scope: LibraryScope) => void
}) {
  return (
    <Surface
      radius="control"
      tone="card"
      pad={1}
      role="group"
      aria-label="Library scope"
      className="flex shrink-0"
    >
      {(['personal', 'household'] as const).map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          aria-pressed={scope === value}
          className="skin-control h-8 px-3 text-[12.5px] font-semibold capitalize"
          style={
            scope === value
              ? { background: 'var(--accent-fill)', color: 'var(--on-primary)' }
              : { background: 'transparent', color: 'var(--muted)' }
          }
        >
          {value.charAt(0).toUpperCase() + value.slice(1)}
        </button>
      ))}
    </Surface>
  )
}

function HouseholdCover({ book, thumb = false }: { book: HouseholdBook; thumb?: boolean }) {
  const [failed, setFailed] = useState<Set<string>>(() => new Set())
  const chain = coverCandidates(book.cover, {
    size: thumb ? 'thumb' : 'full',
    storedThumb: thumb ? book.coverThumb : null,
  })
  const src = chain.find((candidate) => !failed.has(candidate))
  if (!src) {
    return (
      <CoverPlaceholder
        book={{ id: book.id, title: book.title, first: '', last: book.author }}
        className="h-full w-full"
      />
    )
  }

  const fail = () => setFailed((current) => new Set(current).add(src))
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      className="h-full w-full object-cover"
      onError={fail}
      onLoad={(event) => {
        const image = event.currentTarget
        if (isDegenerateGoogleCoverRender(src, image.naturalWidth, image.naturalHeight)) fail()
      }}
    />
  )
}

const titleCase = (value: string): string =>
  value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())

function householdPossessionLabels(book: HouseholdBook): string[] {
  const labels: string[] = []
  if (book.ownership === 'owned') labels.push('Owned')
  if (book.borrowed) labels.push('Borrowed')
  if (book.wishlist) labels.push('Wishlist')
  return labels
}

function householdFormatLabels(book: HouseholdBook): string[] {
  const formats: string[] = []
  if (book.ownedPhysical) {
    formats.push(book.ownedPhysical === 'yes' ? 'Physical' : titleCase(book.ownedPhysical))
  }
  if (book.ownedEbook) formats.push('Ebook')
  if (book.ownedAudiobook) formats.push('Audiobook')
  return formats
}

const ownerLabel = (book: HouseholdBook, currentReaderId: string): string =>
  `${book.ownerName}${book.ownerId === currentReaderId ? ' (you)' : ''}`

export function HouseholdBookCard({
  book,
  currentReaderId,
  selected = false,
  onOpen,
}: {
  book: HouseholdBook
  currentReaderId: string
  selected?: boolean
  onOpen: () => void
}) {
  const [g0, g1] = subgenreGradient(book.subgenre, book.primaryGenre)
  const member = ownerLabel(book, currentReaderId)
  const possession = householdPossessionLabels(book)

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`View ${book.title} from ${member}'s library`}
      aria-current={selected ? 'true' : undefined}
      data-testid="household-book-card"
      data-owner={book.ownerId}
      className="group block w-full text-left"
    >
      <div
        className="skin-card relative aspect-[2/3] overflow-hidden border border-line transition-shadow motion-reduce:transition-none"
        style={{
          background: `linear-gradient(150deg, ${g0}, ${g1})`,
          ...(selected ? { boxShadow: '0 0 0 2.5px var(--primary), var(--shadow)' } : {}),
        }}
      >
        <HouseholdCover book={book} thumb />
        <span
          className="absolute left-1.5 top-1.5 max-w-[calc(100%-12px)] truncate px-2 py-1 text-[10px] font-semibold"
          style={{
            background: 'var(--card-solid)',
            color: 'var(--ink)',
            borderRadius: 'var(--mark-radius)',
            boxShadow: 'var(--shadow)',
          }}
        >
          {member}
        </span>
        {possession.length > 0 && (
          <span
            className="absolute bottom-1.5 right-1.5 max-w-[calc(100%-12px)] truncate px-2 py-1 text-[10px] font-semibold"
            style={{
              background: 'var(--card-solid)',
              color: 'var(--ink)',
              borderRadius: 'var(--mark-radius)',
            }}
          >
            {possession.join(' · ')}
          </span>
        )}
      </div>
      <span className="mt-1.5 block overflow-hidden text-ellipsis text-[12.5px] font-semibold text-ink">
        {book.title}
      </span>
      {book.author && (
        <span className="block truncate text-[11.5px] text-muted">{book.author}</span>
      )}
      <span className="mt-0.5 block truncate text-[11px] font-semibold text-muted">
        {member}'s library
      </span>
    </button>
  )
}

const publicationLabel = (book: HouseholdBook): string | null => {
  if (!book.publicationYear) return null
  return [book.publicationYear, book.publicationMonth, book.publicationDay]
    .filter((value): value is number => value !== null)
    .join('-')
}

export function HouseholdBookDetail({
  book,
  currentReaderId,
}: {
  book: HouseholdBook | null
  currentReaderId: string
}) {
  if (!book) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center text-muted">
        <span aria-hidden className="text-[28px] opacity-50">
          ✶
        </span>
        <p className="mt-3 text-[13px]">Select a household book to see its shared details.</p>
      </div>
    )
  }

  const [g0, g1] = subgenreGradient(book.subgenre, book.primaryGenre)
  const member = ownerLabel(book, currentReaderId)
  const possession = householdPossessionLabels(book)
  const formats = householdFormatLabels(book)
  const published = publicationLabel(book)

  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 py-5">
      <div
        className="mx-auto aspect-[2/3] w-36 overflow-hidden rounded-xl border border-line"
        style={{ background: `linear-gradient(150deg, ${g0}, ${g1})` }}
      >
        <HouseholdCover book={book} />
      </div>

      <Nameplate
        className="mt-4"
        eyebrow={
          book.series
            ? `${book.series}${book.position !== null ? ` · #${book.position}` : ''}`
            : undefined
        }
        title={book.title}
        subtitle={book.author || undefined}
      />

      <p className="mt-3 text-center text-[12.5px] font-semibold text-ink">
        From {member}'s personal library
      </p>
      <p className="mt-1 text-center text-[12px] text-muted">Read-only household view</p>

      {(possession.length > 0 || formats.length > 0) && (
        <div className="mt-4">
          <div className="mb-1.5 text-[11px] uppercase tracking-[0.2em] text-muted">Possession</div>
          <div className="flex flex-wrap gap-1.5">
            {[...possession, ...formats].map((label) => (
              <span
                key={label}
                className="skin-control px-2.5 py-1 text-[12px] font-semibold text-ink"
                style={{ background: 'var(--chip)' }}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      )}

      {(book.primaryGenre || published || book.isbn) && (
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-[12.5px]">
          {book.primaryGenre && (
            <>
              <dt className="text-muted">Genre</dt>
              <dd className="text-ink">{titleCase(book.primaryGenre)}</dd>
            </>
          )}
          {published && (
            <>
              <dt className="text-muted">Published</dt>
              <dd className="text-ink">{published}</dd>
            </>
          )}
          {book.isbn && (
            <>
              <dt className="text-muted">ISBN</dt>
              <dd className="break-all text-ink">{book.isbn}</dd>
            </>
          )}
        </dl>
      )}

      <Surface tone="field" radius="control" pad={2} className="mt-auto text-[12px] text-muted">
        Changes stay with {member} in their personal library. This view has no editing controls.
      </Surface>
    </div>
  )
}
