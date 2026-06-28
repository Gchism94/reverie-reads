import { useState, type ReactNode } from 'react'
import { Link, createRoute, useNavigate } from '@tanstack/react-router'
import { authorOf, buildBuyLinks, buyDisclosure, deriveBoyfriend, isAuthorRole, ordersForBook, ROLE_LABELS, type Book, type Owned } from '@reverie/core'
import { useFilters } from '../library/filterStore'
import { useReadingOrders } from '../data/readingOrders'
import { buyConfig } from '../lib/buyConfig'
import { useLabels } from '../skin/labels'
import { rootRoute } from '../routes/RootRoute'
import { CoverImage } from '../components/CoverImage'
import { useBooks, useDeleteBook, useUpdateBook } from '../data/books'
import { useDeleteRead, useReads } from '../data/reads'
import { useBookListIds, useToggleListItem } from '../data/listItems'
import { useCreateList, useLists } from '../data/lists'
import { Stars } from '../components/Stars'
import { Chip } from '../components/Chip'
import { ARCH, MONTHS, READ_STATUSES, subgenreGradient } from '../library/constants'
import { EditDetails, LogReadForm, MergeDialog, TropePicker } from './dialogs'
import { OwnedCopies } from './OwnedCopies'
import { ReviewsPanel } from './ReviewsPanel'
import { workKeyFor } from '../data/reviews'
import { useProfile } from '../data/profile'

function fmtPub(p: Book['pub']): string {
  if (p.y && p.m && p.d) return `${MONTHS[p.m - 1] ?? ''} ${p.d}, ${p.y}`
  if (p.y && p.m) return `${MONTHS[p.m - 1] ?? ''} ${p.y}`
  if (p.y) return `${p.y}`
  return ''
}

function fmtDate(d: string): string {
  if (!d) return 'Date not set'
  return new Date(`${d}T00:00:00`).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function Label({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-1.5 mt-6 flex items-center justify-between">
      <span className="text-[11px] uppercase tracking-[0.2em] text-muted">{children}</span>
      {action}
    </div>
  )
}

function Pill({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return (
    <span
      className="rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
      style={{
        background: muted ? 'var(--chip)' : 'rgba(123,63,160,0.18)',
        color: muted ? 'var(--muted)' : 'var(--ink)',
      }}
    >
      {children}
    </span>
  )
}

function ProgressSlider({ book }: { book: Book }) {
  const updateBook = useUpdateBook()
  const [value, setValue] = useState(book.progress)
  return (
    <div>
      <Label>
        Progress — <span className="normal-case text-ink">{value}%</span>
      </Label>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        aria-label="Reading progress"
        onChange={(e) => setValue(Number(e.target.value))}
        onPointerUp={() => updateBook.mutate({ id: book.id, patch: { progress: value } })}
        onBlur={() => updateBook.mutate({ id: book.id, patch: { progress: value } })}
        className="w-full"
        style={{ accentColor: 'var(--primary)' }}
      />
    </div>
  )
}

type Dialog = 'trope' | 'log' | 'edit' | 'merge' | null

function BookDetailScreen() {
  const { bookId } = bookRoute.useParams()
  const navigate = useNavigate()
  const { data: books, isLoading } = useBooks()
  const { data: reads } = useReads(bookId)
  const { data: listIds } = useBookListIds(bookId)
  const { data: lists } = useLists()
  const { data: profile } = useProfile()
  const labels = useLabels()
  const updateBook = useUpdateBook()
  const deleteBook = useDeleteBook()
  const deleteRead = useDeleteRead(bookId)
  const toggleListItem = useToggleListItem(bookId)
  const createList = useCreateList()
  const { data: readingOrders } = useReadingOrders()
  const setAuthor = useFilters((s) => s.setAuthor)
  const [dialog, setDialog] = useState<Dialog>(null)

  const filterByAuthor = (name: string) => {
    setAuthor(name)
    void navigate({ to: '/library' })
  }

  const book = books?.find((b) => b.id === bookId)

  if (isLoading) return <p className="px-6 py-16 text-center text-muted">Loading…</p>
  if (!book)
    return (
      <div className="px-6 py-16 text-center text-muted">
        <p>That book isn’t in your library.</p>
        <Link to="/" className="mt-3 inline-block text-primary">
          ← Back to library
        </Link>
      </div>
    )

  const [g0, g1] = subgenreGradient(book.subgenre)
  const bookOrders = ordersForBook(book, readingOrders ?? [])
  const bf = ARCH[book.boyfriend ?? ''] ?? ARCH.cinnamon
  const workKey = workKeyFor(book)
  const reviewerName = profile?.displayName || 'Reader'
  const setOwned = (owned: Owned) => updateBook.mutate({ id: book.id, patch: { owned } })
  const memberIds = new Set(listIds ?? [])
  const tbrs = (lists ?? []).filter((l) => l.kind === 'tbr')
  const collections = (lists ?? []).filter((l) => l.kind === 'collection')

  const removeTag = (t: string) => {
    const tags = book.tags.filter((x) => x !== t)
    updateBook.mutate({
      id: book.id,
      patch: { tags, boyfriend: deriveBoyfriend({ tags, subgenre: book.subgenre }) },
    })
  }

  const seriesBadge =
    book.status === 'Complete'
      ? 'Series complete'
      : book.status === 'Series'
        ? `Series${book.seriesCount ? ` of ${book.seriesCount}` : ' · length not set'}`
        : 'Standalone'

  return (
    <section className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <Link to="/" className="text-[13px] text-muted hover:text-ink">
        ← Library
      </Link>

      {/* header */}
      <div className="mt-3 flex flex-col gap-5 sm:flex-row">
        <div
          className="aspect-[2/3] w-32 flex-none overflow-hidden rounded-xl border border-line sm:w-40"
          style={{ background: `linear-gradient(150deg, ${g0}, ${g1})` }}
        >
          <CoverImage book={book} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h1
              className="text-[28px] italic leading-tight text-ink"
              style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
            >
              {book.title}
            </h1>
            <button
              type="button"
              onClick={() => updateBook.mutate({ id: book.id, patch: { fave: !book.fave } })}
              aria-pressed={book.fave}
              aria-label={book.fave ? 'Remove from favorites' : 'Add to favorites'}
              className="text-[24px] leading-none"
              style={{ color: book.fave ? 'var(--primary)' : 'var(--muted)' }}
            >
              {book.fave ? '♥' : '♡'}
            </button>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[15px] text-muted">
            {book.contributors.length ? (
              book.contributors.map((c, i) => (
                <span key={`${c.name}-${i}`} className="inline-flex items-center">
                  {isAuthorRole(c.role) ? (
                    <button
                      type="button"
                      onClick={() => filterByAuthor(c.name)}
                      className="text-ink underline-offset-2 hover:underline"
                    >
                      {c.name}
                    </button>
                  ) : (
                    <span>
                      {c.name} <span className="text-[12px] lowercase">· {ROLE_LABELS[c.role].toLowerCase()}</span>
                    </span>
                  )}
                  {i < book.contributors.length - 1 ? <span aria-hidden>,</span> : null}
                </span>
              ))
            ) : (
              <span>{authorOf(book) || 'Unknown author'}</span>
            )}
          </div>
          {bookOrders.length > 0 && (
            <div className="mt-1 text-[12.5px] text-muted">
              Part of reading order:{' '}
              {bookOrders.map((o, i) => (
                <span key={o.id}>
                  {i > 0 ? ', ' : ''}
                  <Link to="/orders" className="font-semibold text-primary underline-offset-2 hover:underline">
                    {o.name}
                  </Link>
                </span>
              ))}
            </div>
          )}
          {book.series && (
            <div className="mt-0.5 text-[14px] italic text-muted" style={{ fontFamily: 'var(--font-display)' }}>
              {book.series}
              {book.position !== '' ? ` · #${book.position}` : ''}
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Pill>{book.subgenre}</Pill>
            <Pill>{seriesBadge}</Pill>
            {(book.intensity ?? 0) > 0 && <Pill>{labels.intensityGlyph.repeat(book.intensity ?? 0)}</Pill>}
            {fmtPub(book.pub) && <Pill>📅 {fmtPub(book.pub)}</Pill>}
            <Pill muted>
              {bf?.emoji} {bf?.name.replace(/^The /, '')} vibe
            </Pill>
          </div>
        </div>
      </div>

      {/* your copies (per-format ownership) */}
      <div className="mt-6">
        <OwnedCopies owned={book.owned} onChange={setOwned} />
      </div>

      {/* buy at an indie (discover + support — not live inventory) */}
      <BuyAtIndie book={book} />

      {/* reading status */}
      <Label>Reading status</Label>
      <div className="flex flex-wrap gap-1.5">
        {READ_STATUSES.map((s) => (
          <Chip
            key={s}
            active={book.readStatus === s}
            onClick={() => updateBook.mutate({ id: book.id, patch: { readStatus: s } })}
          >
            {s}
          </Chip>
        ))}
      </div>

      {book.readStatus === 'Reading' && <ProgressSlider book={book} />}

      {/* rating */}
      <Label
        action={
          <button type="button" onClick={() => setDialog('edit')} className="text-[12px] text-primary">
            edit details
          </button>
        }
      >
        Your rating
      </Label>
      <Stars value={book.rating} onChange={(v) => updateBook.mutate({ id: book.id, patch: { rating: v } })} />
      <p className="mt-1 text-[11.5px] text-muted">Your rating only — Reverie never shows an averaged score.</p>

      {/* reviews (opt-in, individual voices) */}
      <div className="mt-4">
        <ReviewsPanel workKey={workKey} reviewerName={reviewerName} />
      </div>

      {/* tags (Tryst skin: "Tropes") */}
      <Label
        action={
          <button type="button" onClick={() => setDialog('trope')} className="text-[12px] text-primary">
            + tag
          </button>
        }
      >
        {labels.tags}
      </Label>
      <div className="flex flex-wrap gap-1.5">
        {book.tags.length ? (
          book.tags.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => removeTag(t)}
              className="rounded-full border px-3 py-1.5 text-[12.5px] font-medium"
              style={{ background: 'var(--accent-fill)', color: 'var(--on-primary)', borderColor: 'transparent' }}
              aria-label={`Remove ${labels.tag} ${t}`}
            >
              {t} ✕
            </button>
          ))
        ) : (
          <span className="text-[13px] text-muted">No {labels.tags.toLowerCase()} yet</span>
        )}
      </div>

      {/* read log */}
      <Label
        action={
          <button type="button" onClick={() => setDialog('log')} className="text-[12px] text-primary">
            + log a read
          </button>
        }
      >
        Read log
      </Label>
      <div className="mb-2 text-[13px] text-muted">
        {reads && reads.length
          ? `Read ${reads.length} time${reads.length > 1 ? 's' : ''}`
          : book.readStatus === 'Read'
            ? 'Marked read — log a date to see it on your calendar'
            : 'Not logged yet'}
      </div>
      <div className="flex flex-col gap-2">
        {(reads ?? []).map((r) => (
          <div key={r.id} className="rounded-xl border border-line p-3" style={{ background: 'var(--field)' }}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13.5px] font-semibold text-ink">{fmtDate(r.date)}</span>
              <button
                type="button"
                onClick={() => deleteRead.mutate(r.id)}
                className="text-[12px] text-muted hover:text-primary"
              >
                remove
              </button>
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[12.5px] text-muted">
              {r.format}
              {r.rating ? <Stars value={r.rating} size={12} /> : null}
            </div>
            {r.notes && <div className="mt-1 text-[13px] text-ink">{r.notes}</div>}
          </div>
        ))}
      </div>

      {/* lists & shelves */}
      <Label
        action={
          <button
            type="button"
            onClick={async () => {
              const name = window.prompt('Name the new shelf / collection:')
              if (!name) return
              const created = await createList.mutateAsync({ name: name.trim(), kind: 'collection' })
              toggleListItem.mutate({ listId: created.id, member: false })
            }}
            className="text-[12px] text-primary"
          >
            + new shelf
          </button>
        }
      >
        Lists &amp; shelves
      </Label>
      <div className="mb-1 text-[12px] text-muted">TBR lists</div>
      <div className="flex flex-wrap gap-1.5">
        {tbrs.length ? (
          tbrs.map((l) => (
            <Chip
              key={l.id}
              active={memberIds.has(l.id)}
              onClick={() => toggleListItem.mutate({ listId: l.id, member: memberIds.has(l.id) })}
            >
              {l.priority ? '★ ' : ''}
              {l.name} {memberIds.has(l.id) ? '✓' : '+'}
            </Chip>
          ))
        ) : (
          <span className="text-[13px] text-muted">No TBR lists yet</span>
        )}
      </div>
      <div className="mb-1 mt-3 text-[12px] text-muted">Collections &amp; shelves</div>
      <div className="flex flex-wrap gap-1.5">
        {collections.length ? (
          collections.map((l) => (
            <Chip
              key={l.id}
              active={memberIds.has(l.id)}
              onClick={() => toggleListItem.mutate({ listId: l.id, member: memberIds.has(l.id) })}
            >
              {l.name} {memberIds.has(l.id) ? '✓' : '+'}
            </Chip>
          ))
        ) : (
          <span className="text-[13px] text-muted">No shelves yet</span>
        )}
      </div>

      {/* plan */}
      <Label>Plan a read date</Label>
      <input
        type="date"
        aria-label="Planned read date"
        value={book.plan ?? ''}
        onChange={(e) =>
          updateBook.mutate({ id: book.id, patch: { plan: e.target.value || null } })
        }
        className="h-10 rounded-xl border border-line px-3 text-[14px] text-ink outline-none"
        style={{ background: 'var(--field)' }}
      />

      {/* actions */}
      <div className="mt-8 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setDialog('merge')}
          className="rounded-full border border-line px-4 py-2 text-[13px] font-semibold text-ink"
          style={{ background: 'var(--card)' }}
        >
          Merge…
        </button>
        <button
          type="button"
          onClick={() => {
            if (!window.confirm('Remove this book from your library?')) return
            deleteBook.mutate(book.id, { onSuccess: () => void navigate({ to: '/' }) })
          }}
          className="rounded-full border border-line px-4 py-2 text-[13px] font-semibold text-primary"
          style={{ background: 'var(--card)' }}
        >
          Remove book
        </button>
      </div>

      {dialog === 'trope' && <TropePicker book={book} onClose={() => setDialog(null)} />}
      {dialog === 'log' && <LogReadForm book={book} onClose={() => setDialog(null)} />}
      {dialog === 'edit' && <EditDetails book={book} onClose={() => setDialog(null)} />}
      {dialog === 'merge' && (
        <MergeDialog book={book} allBooks={books ?? []} onClose={() => setDialog(null)} />
      )}
    </section>
  )
}

/** Format-aware indie buy links — Bookshop.org (print/ebook) + Libro.fm (audio), routed to the
 *  reader's chosen local store. Discover + support, never a claim of in-store stock. */
function BuyAtIndie({ book }: { book: Book }) {
  const { data: profile } = useProfile()
  const config = buyConfig(profile?.defaultStore)
  const links = buildBuyLinks(book, config)
  return (
    <details className="mt-4 rounded-2xl border border-line p-4" style={{ background: 'var(--card)' }}>
      <summary className="cursor-pointer text-[14px] font-semibold text-ink">
        Buy at an indie{profile?.defaultStore ? ` · ${profile.defaultStore.name}` : ''}
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        {links.map((l) => (
          <a
            key={l.provider}
            href={l.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between rounded-xl border border-line px-3 py-2 text-[13px] font-semibold text-ink"
            style={{ background: 'var(--field)' }}
          >
            <span>{l.label}</span>
            <span className="text-primary">↗</span>
          </a>
        ))}
      </div>
      <p className="mt-2 text-[12px] text-muted">
        {buyDisclosure(config)} These open the store’s online shop — not a live in-stock check.
        {!profile?.defaultStore && (
          <>
            {' '}
            <Link to="/indie" className="text-primary">
              Pick your local store
            </Link>
            .
          </>
        )}
      </p>
    </details>
  )
}

export const bookRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'book/$bookId',
  component: BookDetailScreen,
})
