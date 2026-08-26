import { useState } from 'react'
import { coverCandidates, isDegenerateGoogleCoverRender } from '@reverie/core'
import type { HouseholdBook, HouseholdBookOwner } from '../data/household'
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

function householdPossessionLabels(owner: HouseholdBookOwner): string[] {
  const labels: string[] = []
  if (owner.ownership === 'owned') labels.push('Owned')
  if (owner.borrowed) labels.push('Borrowed')
  return labels
}

function householdFormatLabels(owner: HouseholdBookOwner): string[] {
  const formats: string[] = []
  if (owner.ownedPhysical) {
    formats.push(owner.ownedPhysical === 'yes' ? 'Physical' : titleCase(owner.ownedPhysical))
  }
  if (owner.ownedEbook) formats.push('Ebook')
  if (owner.ownedAudiobook) formats.push('Audiobook')
  return formats
}

const ownerLabel = (owner: HouseholdBookOwner, currentReaderId: string): string =>
  `${owner.displayName}${owner.userId === currentReaderId ? ' (you)' : ''}`

const ownerSummary = (book: HouseholdBook, currentReaderId: string): string =>
  book.owners.length
    ? book.owners.map((owner) => ownerLabel(owner, currentReaderId)).join(', ')
    : 'Household copy'

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
  const members = ownerSummary(book, currentReaderId)
  const possession = [...new Set(book.owners.flatMap((owner) => householdPossessionLabels(owner)))]

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`View ${book.title} in the household library`}
      aria-current={selected ? 'true' : undefined}
      data-testid="household-book-card"
      data-owners={book.owners.map((owner) => owner.userId).join(' ')}
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
          {members}
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
        {book.owners.length ? members : 'Kept in the household'}
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
  onRemove,
  removing = false,
}: {
  book: HouseholdBook | null
  currentReaderId: string
  onRemove?: () => void
  removing?: boolean
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
        In your household library
      </p>
      <p className="mt-1 text-center text-[12px] text-muted">
        {book.owners.length
          ? `Active copies: ${ownerSummary(book, currentReaderId)}`
          : 'Kept here independently of any personal copy'}
      </p>

      {book.owners.length > 0 && (
        <div className="mt-4">
          <div className="mb-1.5 text-[11px] uppercase tracking-[0.2em] text-muted">Copies</div>
          <div className="space-y-2">
            {book.owners.map((owner) => {
              const details = [...householdPossessionLabels(owner), ...householdFormatLabels(owner)]
              return (
                <Surface key={owner.userId} tone="field" radius="control" pad={2}>
                  <div className="text-[12.5px] font-semibold text-ink">
                    {ownerLabel(owner, currentReaderId)}
                  </div>
                  {details.length > 0 && (
                    <div className="mt-0.5 text-[11.5px] text-muted">{details.join(' · ')}</div>
                  )}
                </Surface>
              )
            })}
          </div>
        </div>
      )}

      {(book.householdTags.length > 0 || book.householdTropes.length > 0) && (
        <div className="mt-4">
          <div className="mb-1.5 text-[11px] uppercase tracking-[0.2em] text-muted">
            Household notes
          </div>
          <div className="flex flex-wrap gap-1.5">
            {book.householdTags.map((tag) => (
              <span
                key={tag}
                className="skin-control px-2.5 py-1 text-[12px] font-semibold text-ink"
                style={{ background: 'var(--chip)' }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {(book.primaryGenre || published || book.isbns[0]) && (
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
          {book.isbns[0] && (
            <>
              <dt className="text-muted">ISBN</dt>
              <dd className="break-all text-ink">{book.isbns[0]}</dd>
            </>
          )}
        </dl>
      )}

      <Surface tone="field" radius="control" pad={2} className="mt-auto text-[12px] text-muted">
        {book.owners.some((owner) => owner.ownership === 'owned')
          ? 'An owned personal copy keeps this work in the household. Change or remove that personal copy first.'
          : 'Removing this household entry never removes anyone’s personal book or the corpus record.'}
      </Surface>
      {onRemove && (
        <button
          type="button"
          disabled={removing}
          onClick={onRemove}
          className="skin-control mt-3 border border-line px-4 py-2 text-[13px] font-semibold disabled:opacity-50"
          style={{ background: 'var(--card)', color: 'var(--accent-ink)' }}
        >
          {removing ? 'Removing…' : 'Remove from household'}
        </button>
      )}
    </div>
  )
}
