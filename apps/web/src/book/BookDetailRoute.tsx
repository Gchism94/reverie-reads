import { useState, type ReactNode } from 'react'
import { Link, createRoute, useNavigate } from '@tanstack/react-router'
import {
  authorOf,
  bookSubgenres,
  buildBuyLinks,
  buyDisclosure,
  isAuthorRole,
  seriesStatusBadge,
  ROLE_LABELS,
  type Book,
  possessionPatch,
  possessionState,
  type PossessionState,
  type Owned,
  formatPartialDate,
} from '@reverie/core'
import { useFilters } from '../library/filterStore'
import { buyConfig } from '../lib/buyConfig'
import { useLabels, useVoice } from '../skin/labels'
import { rootRoute } from '../routes/RootRoute'
import { BackLink } from '../components/BackLink'
import { SeriesStrip } from '../components/SeriesStrip'
import { CoverImage } from '../components/CoverImage'
import { useBooks, useDeleteBook, useUpdateBook } from '../data/books'
import { useDeleteRead, useReads } from '../data/reads'
import { useBookListIds, useToggleListItem } from '../data/listItems'
import { useCreateList, useLists } from '../data/lists'
import { Stars } from '../components/Stars'
import { Chip } from '../components/Chip'
import { READ_STATUS_OPTIONS, readStatusLabel, subgenreGradient } from '../library/constants'
import { maybeChainPrompt } from '../lib/chainPrompt'
import { EditDetails, LogReadForm, MergeDialog } from './dialogs'
import { PlanEditor } from './PlanEditor'
import { TropePicker } from '../components/TropePicker'
import { TropeChip } from '../components/TropeChip'
import { MoodChip } from '../components/MoodChip'
import { MoodPicker } from '../components/MoodPicker'
import { Modal } from '../components/Modal'
import { CoverSheet } from '../components/CoverSheet'
import { useCoverBackfill } from '../data/coverBackfill'
import { OwnedCopies } from './OwnedCopies'
import { ReviewsPanel } from './ReviewsPanel'
import { MoreLikeThis } from './MoreLikeThis'
import { workKeyFor } from '../data/reviews'
import { useProfile } from '../data/profile'
import { BookmarkGlyph } from '../components/BookmarkGlyph'

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
  // Fires on both onPointerUp and onBlur with the SAME value, so ordering cannot corrupt it — but
  // it is still two concurrent writes to one book, and scoping makes the pair ordered and cheap.
  const updateBook = useUpdateBook(book.id)
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

type Dialog = 'trope' | 'mood' | 'log' | 'edit' | 'merge' | 'cover' | null

function BookDetailScreen() {
  const { bookId } = bookRoute.useParams()
  const navigate = useNavigate()
  const { data: books, isLoading } = useBooks()
  const { data: reads } = useReads(bookId)
  const { data: listIds } = useBookListIds(bookId)
  const { data: lists } = useLists()
  const { data: profile } = useProfile()
  const labels = useLabels()
  // One screen, one book, many small writes — fave, rating, possession, and the per-format toggles,
  // which each send the WHOLE `owned` object. Rapid toggling is the same clobbering shape the plan
  // editor hit, so these serialize per book. Scoped on the route param, which is available before
  // the book itself loads.
  const updateBook = useUpdateBook(bookId)
  const deleteBook = useDeleteBook()
  const deleteRead = useDeleteRead(bookId)
  const toggleListItem = useToggleListItem(bookId)
  const createList = useCreateList()
  const setAuthor = useFilters((s) => s.setAuthor)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [tropesExpanded, setTropesExpanded] = useState(false)

  const filterByAuthor = (name: string) => {
    setAuthor(name)
    void navigate({ to: '/library' })
  }

  const book = books?.find((b) => b.id === bookId)

  const voice = useVoice()
  // Lazy backfill: an externally-hotlinked cover moves into owned Storage on first view (task §3).
  useCoverBackfill(book)
  if (isLoading) return <p className="px-6 py-16 text-center text-muted">{voice.loading}</p>
  if (!book)
    return (
      <div className="px-6 py-16 text-center text-muted">
        <p>That book isn’t in your library.</p>
        <BackLink fallback="/library" className="mt-3 inline-block text-primary">
          ← Back to library
        </BackLink>
      </div>
    )

  const [g0, g1] = subgenreGradient(book.subgenre, book.genre)
  const workKey = workKeyFor(book)
  const reviewerName = profile?.displayName || 'Reader'
  const setOwned = (owned: Owned) => updateBook.mutate({ id: book.id, patch: { owned } })
  // Four-state possession WORD over five independent flags (docs/archive/task-shelf-model.md): picking one
  // word is exclusive, so possessionPatch writes the whole trio. Format flags are left alone across
  // any change — dropping possession suppresses them (bookOwnedFormats gates every read), so marking
  // a book owned or borrowed again restores your copies.
  const setPossession = (next: PossessionState) =>
    updateBook.mutate({ id: book.id, patch: possessionPatch(next) })
  const memberIds = new Set(listIds ?? [])
  const tbrs = (lists ?? []).filter((l) => l.kind === 'tbr')
  const collections = (lists ?? []).filter((l) => l.kind === 'collection')

  const seriesBadge = seriesStatusBadge(book)

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <BackLink fallback="/library" className="text-[13px] text-muted hover:text-ink">
        ← Library
      </BackLink>

      {/* header */}
      {/* cover + title share the row even on phones — a stacked w-32 cover left dead space beside it */}
      <div className="mt-3 flex gap-4 sm:gap-5">
        {/* the cover is the door — tapping it opens the cover sheet (change/add a cover) */}
        <button
          type="button"
          onClick={() => setDialog('cover')}
          aria-label={book.cover ? 'Change cover' : 'Add a cover'}
          className="relative aspect-[2/3] w-28 flex-none overflow-hidden rounded-xl border border-line sm:w-40"
          style={{ background: `linear-gradient(150deg, ${g0}, ${g1})` }}
        >
          <CoverImage book={book} />
          {!book.cover && (
            <span
              aria-hidden
              className="absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-0.5 text-[10px] font-semibold backdrop-blur"
              style={{
                background: 'rgba(0,0,0,0.62)',
                color: 'var(--mark-on-ph)',
                borderRadius: 'var(--mark-radius)',
              }}
            >
              + add a cover
            </span>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h1
              className="text-[23px] italic leading-tight text-ink sm:text-[28px]"
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
                      {c.name}{' '}
                      <span className="text-[12px] lowercase">
                        · {ROLE_LABELS[c.role].toLowerCase()}
                      </span>
                    </span>
                  )}
                  {i < book.contributors.length - 1 ? <span aria-hidden>,</span> : null}
                </span>
              ))
            ) : (
              <span>{authorOf(book) || 'Unknown author'}</span>
            )}
          </div>
          {book.series && <SeriesStrip book={book} />}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {bookSubgenres(book).map((s) => (
              <Pill key={s}>{s}</Pill>
            ))}
            <Pill>{seriesBadge}</Pill>
            {(book.intensity ?? 0) > 0 && (
              <Pill>{labels.intensityGlyph.repeat(book.intensity ?? 0)}</Pill>
            )}
            {formatPartialDate(book.pub) && <Pill>📅 {formatPartialDate(book.pub)}</Pill>}
            {/* Absent when unknown — no pill at all, rather than a fabricated 0 or a guess. */}
            {book.pages != null && <Pill>{book.pages} pp</Pill>}
          </div>
        </div>
      </div>

      {/* your copies (per-format ownership) */}
      <div className="mt-6">
        <OwnedCopies
          possession={possessionState(book)}
          owned={book.owned}
          onChange={setOwned}
          onPossessionChange={setPossession}
        />
      </div>

      {/* buy at an indie (discover + support — not live inventory) */}
      <BuyAtIndie book={book} />

      {/* reading status — "Not set" is a real, selectable state; no forced choice */}
      <Label>Reading status</Label>
      <div className="flex flex-wrap gap-1.5">
        {READ_STATUS_OPTIONS.map((s) => (
          <Chip
            key={s}
            active={book.readStatus === s}
            onClick={() => {
              updateBook.mutate({
                id: book.id,
                patch: { readStatus: s, ...(s === 'Reading' ? { readingNowHidden: false } : {}) },
              })
              if (s === 'Read') void maybeChainPrompt(book, books ?? [])
            }}
          >
            {readStatusLabel(s)}
          </Chip>
        ))}
      </div>

      {book.readStatus === 'Reading' && <ProgressSlider book={book} />}

      {/* rating */}
      <Label
        action={
          <button
            type="button"
            onClick={() => setDialog('edit')}
            className="text-[12px] text-primary"
          >
            edit details
          </button>
        }
      >
        Your rating
      </Label>
      <Stars
        value={book.rating}
        onChange={(v) => updateBook.mutate({ id: book.id, patch: { rating: v } })}
      />
      <p className="mt-1 text-[11.5px] text-muted">
        Your rating only — Reverie never shows an averaged score.
      </p>

      {/* reviews (opt-in, individual voices) */}
      <div className="mt-4">
        <ReviewsPanel workKey={workKey} reviewerName={reviewerName} />
      </div>

      {/* Tier 2: semantic neighbours from your own shelves (silent until embeddings exist) */}
      <MoreLikeThis bookId={book.id} />

      {/* tags (Tryst skin: "Tropes") */}
      <Label
        action={
          <button
            type="button"
            onClick={() => setDialog('trope')}
            className="text-[12px] text-primary"
          >
            + tag
          </button>
        }
      >
        {labels.tags}
      </Label>
      {/* pinned lead with the skin's ornament; the rest collapse behind a count (≤5 visible) */}
      <div className="flex flex-wrap items-center gap-1.5">
        {book.tropes.length ? (
          <>
            {(tropesExpanded ? book.tropes : book.tropes.slice(0, 5)).map((t) => (
              <TropeChip key={t.id} name={t.name} emphasis={t.emphasis} to={`/tropes/${t.id}`} />
            ))}
            {book.tropes.length > 5 && (
              <button
                type="button"
                onClick={() => setTropesExpanded((v) => !v)}
                className="rounded-full border border-line px-2.5 py-1 text-[12px] font-semibold text-muted"
                style={{ background: 'var(--field)' }}
              >
                {tropesExpanded ? 'fewer' : `+${book.tropes.length - 5} more`}
              </button>
            )}
          </>
        ) : (
          <span className="text-[13px] text-muted">No {labels.tags.toLowerCase()} yet</span>
        )}
      </div>

      {/* Mood — the reader's OWN impression (how it landed), its own area, apart from the descriptive
          tropes above. Never derived: empty is a valid, quiet state (docs/archive/task-mood.md). */}
      <Label
        action={
          <button
            type="button"
            onClick={() => setDialog('mood')}
            className="text-[12px] text-primary"
          >
            {book.moods.length ? 'edit' : '+ mood'}
          </button>
        }
      >
        Mood
      </Label>
      <div className="flex flex-wrap items-center gap-1.5">
        {book.moods.length ? (
          book.moods.map((m) => <MoodChip key={m.id} name={m.name} to={`/moods/${m.id}`} />)
        ) : (
          <span className="text-[13px] text-muted">No mood set — how did it land on you?</span>
        )}
      </div>

      {/* read log */}
      <Label
        action={
          <button
            type="button"
            onClick={() => setDialog('log')}
            className="text-[12px] text-primary"
          >
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
          <div
            key={r.id}
            className="rounded-xl border border-line p-3"
            style={{ background: 'var(--field)' }}
          >
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
              const created = await createList.mutateAsync({
                name: name.trim(),
                kind: 'collection',
              })
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
              {l.priority && (
                <>
                  <BookmarkGlyph />{' '}
                </>
              )}
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
      <PlanEditor book={book} />

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
          // accent-ink, not primary: on this --card background, hearth/dark's --primary measures
          // 2.24:1 (a11y sweep, 2026-08-10). There is no dedicated destructive/danger token in
          // tokens.css — this button was leaning on --primary's reddish hue as its only color
          // signal, with the label as the real signal. A --danger token is a queued follow-up;
          // not designed here.
          className="rounded-full border border-line px-4 py-2 text-[13px] font-semibold"
          style={{ background: 'var(--card)', color: 'var(--accent-ink)' }}
        >
          Remove book
        </button>
      </div>

      {dialog === 'trope' && <TropePicker book={book} onClose={() => setDialog(null)} />}
      {dialog === 'mood' && (
        <Modal title="Mood" onClose={() => setDialog(null)}>
          <p className="-mt-2 mb-3 text-[13px] text-muted">
            How did {book.title} land on you? Tap what you felt — yours alone, and only if you want
            to.
          </p>
          <MoodPicker book={book} />
        </Modal>
      )}
      {dialog === 'log' && <LogReadForm book={book} onClose={() => setDialog(null)} />}
      {dialog === 'edit' && (
        <EditDetails
          book={book}
          onClose={() => setDialog(null)}
          onChangeCover={() => setDialog('cover')}
        />
      )}
      {dialog === 'cover' && <CoverSheet book={book} onClose={() => setDialog(null)} />}
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
    <details
      className="mt-4 rounded-2xl border border-line p-4"
      style={{ background: 'var(--card)' }}
    >
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
