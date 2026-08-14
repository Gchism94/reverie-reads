import { useMemo, useState } from 'react'
import { createRoute, useNavigate } from '@tanstack/react-router'
import {
  entryState,
  nextUp,
  positionBetween,
  progressLine,
  seriesProgress,
  sortEntries,
  stateSuffix,
  SERIES_STATUS_LABELS,
  SERIES_STATUS_VALUES,
  type Book,
  type SeriesEntry,
  type SeriesStatus,
} from '@reverie/core'
import { rootRoute } from './RootRoute'
import { BackLink } from '../components/BackLink'
import { CoverImage } from '../components/CoverImage'
import { LibraryPicker } from '../components/LibraryPicker'
import { Modal } from '../components/Modal'
import { useBooks } from '../data/books'
import { useAllListItems } from '../data/listItems'
import { useLists } from '../data/lists'
import {
  useAcquireGhost,
  useAddGhostEntry,
  useAddSeriesEntries,
  useApplySeriesSource,
  useMoveEntry,
  useRemoveEntry,
  useSeriesDetail,
  useUpdateEntry,
  useUpdateSeries,
} from '../data/series'

const fmtPos = (n: number): string => `#${n}`

/**
 * The series page IS the reading order (docs/archive/task-series-experience.md §1) — one ordered shelf,
 * every canonical entry including ghost slots for books the reader doesn't have, the reader's
 * own state woven inline, Next Up elevated as the page's emotional center. Drag (or ▲▼) writes
 * decimal positions — between #2 and #3 lands #2.5 — and manual order always wins over source.
 */
function SeriesScreen() {
  const { seriesName } = seriesRoute.useParams()
  const name = decodeURIComponent(seriesName)
  const navigate = useNavigate()
  const { data: books } = useBooks()
  const { data: lists } = useLists()
  const { data: items } = useAllListItems()
  const { data: detail, isLoading } = useSeriesDetail(name)
  const updateSeries = useUpdateSeries(name)
  const moveEntry = useMoveEntry(name)
  const updateEntry = useUpdateEntry(name)
  const removeEntry = useRemoveEntry(name)
  const addEntries = useAddSeriesEntries(name)
  const addGhost = useAddGhostEntry(name)
  const acquire = useAcquireGhost(name)
  const applySource = useApplySeriesSource(name)

  const [pickerOpen, setPickerOpen] = useState(false)
  // Appends within one picker session step past the stale cache max (invalidation lags picks).
  const [pickCount, setPickCount] = useState(0)
  const [acquiring, setAcquiring] = useState<SeriesEntry | null>(null)
  const [removing, setRemoving] = useState<SeriesEntry | null>(null)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [sourceNote, setSourceNote] = useState<string | null>(null)

  const byId = useMemo(() => new Map((books ?? []).map((b) => [b.id, b])), [books])
  const tbrs = useMemo(() => (lists ?? []).filter((l) => l.kind === 'tbr'), [lists])
  // which TBR (first one) holds each linked book — the "on a TBR" state line
  const tbrNameByBook = useMemo(() => {
    const listName = new Map(tbrs.map((l) => [l.id, l.name]))
    const m = new Map<string, string>()
    for (const it of items ?? []) {
      const n = listName.get(it.list_id)
      if (n && !m.has(it.book_id)) m.set(it.book_id, n)
    }
    return m
  }, [items, tbrs])

  const entries = useMemo(() => sortEntries(detail?.entries ?? []), [detail])
  const progress = useMemo(() => seriesProgress(entries, byId), [entries, byId])
  const next = useMemo(() => nextUp(entries, byId), [entries, byId])
  const memberIds = useMemo(
    () => new Set(entries.map((e) => e.bookId).filter((x): x is string => !!x)),
    [entries],
  )
  // the genre a ghost-born record inherits — its siblings know the shelf
  const siblingGenre =
    entries.map((e) => (e.bookId ? byId.get(e.bookId)?.genre : '')).find(Boolean) ?? ''

  if (isLoading || !detail)
    return (
      <div className="px-6 py-16 text-center text-muted">
        <p>Opening the series…</p>
      </div>
    )

  const openBook = (id: string) => void navigate({ to: '/book/$bookId', params: { bookId: id } })

  /** Reposition `from` so it lands at visual slot `to`; decimals stay human, ugly gaps renumber. */
  const placeAt = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= entries.length || to >= entries.length) return
    const rest = entries.filter((_, i) => i !== from)
    const prev = rest[to - 1]?.position ?? null
    const nextPos = rest[to]?.position ?? null
    const moved = entries[from]!
    const { position, renumber } = positionBetween(prev, nextPos)
    // ONE call either way. `bookId` no longer rides along: set_series_order reads it from the entry
    // row inside its own transaction, so the books.position mirror cannot be aimed at a book this
    // component's cache is wrong about.
    const slots = renumber
      ? [...rest.slice(0, to), moved, ...rest.slice(to)].map((e, i) => ({
          entryId: e.id,
          position: i + 1,
        }))
      : [{ entryId: moved.id, position }]
    moveEntry.mutate({ seriesId: detail.series.id, slots })
  }

  const editLabel = (e: SeriesEntry) => {
    const label = window.prompt(
      'Tag this position — “novella”, “prequel”… (empty clears it)',
      e.label ?? '',
    )
    if (label == null) return
    updateEntry.mutate({ entryId: e.id, label: label.trim() || null })
  }

  const rename = () => {
    const newName = window.prompt('Rename this series', detail.series.name)?.trim()
    if (!newName || newName === detail.series.name) return
    updateSeries.mutate(
      { id: detail.series.id, name: newName },
      {
        onSuccess: () =>
          void navigate({
            to: '/series/$seriesName',
            params: { seriesName: encodeURIComponent(newName) },
            replace: true,
          }),
      },
    )
  }

  const addGhostSlot = () => {
    const title = window.prompt('Which book is missing? Its title:')?.trim()
    if (!title) return
    const author = window.prompt('Author (optional):')?.trim() ?? ''
    const after = Math.floor(Math.max(0, ...entries.map((e) => e.position))) + 1
    addGhost.mutate({ seriesId: detail.series.id, title, author, position: after })
  }

  const fetchSource = () =>
    applySource.mutate(
      {
        detail,
        author:
          entries
            .map((e) => (e.bookId ? byId.get(e.bookId) : null))
            .map((b) => (b ? [b.first, b.last].filter(Boolean).join(' ') : ''))
            .find(Boolean) ?? '',
      },
      {
        onSuccess: (r) => {
          // Both skip kinds are said out loud, so a refresh that left things alone doesn't read as
          // a no-op: rows the reader arranged stay put by design, and a catalog position already
          // held by another slot drops just that move rather than the whole refresh.
          const parts: string[] = []
          if (r.added)
            parts.push(
              `${r.added} canonical ${r.added === 1 ? 'entry' : 'entries'} added from Hardcover.`,
            )
          if (r.skipped)
            parts.push(`${r.skipped} left where you arranged ${r.skipped === 1 ? 'it' : 'them'}.`)
          if (r.skippedCollision)
            parts.push(
              `${r.skippedCollision} skipped — ${r.skippedCollision === 1 ? 'its catalog position is' : 'their catalog positions are'} already taken.`,
            )
          setSourceNote(
            parts.length
              ? parts.join(' ')
              : r.unavailable
                ? 'No source data for this series — yours to arrange.'
                : 'Already up to date.',
          )
        },
        onError: () => setSourceNote('Couldn’t reach the catalog just now.'),
      },
    )

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <BackLink fallback="/library" className="text-[13px] text-muted hover:text-ink">
        ← Back
      </BackLink>

      <header className="mt-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1
            className="min-w-0 text-[26px] italic leading-tight text-ink"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
          >
            {detail.series.name}
            <button
              type="button"
              onClick={rename}
              aria-label="Rename series"
              className="ml-2 align-middle text-[13px] not-italic text-muted hover:text-ink"
            >
              ✎
            </button>
          </h1>
          {/* the SERIES' publication status — the reader's own position lives in the shelf below */}
          <select
            value={detail.series.status ?? ''}
            onChange={(e) =>
              updateSeries.mutate({
                id: detail.series.id,
                status: (e.target.value || null) as SeriesStatus | null,
              })
            }
            aria-label="Series status"
            className="skin-control h-9 border border-line px-2.5 text-[12.5px] font-semibold text-ink"
            style={{ background: 'var(--card)' }}
          >
            <option value="">Status…</option>
            {SERIES_STATUS_VALUES.map((s) => (
              <option key={s} value={s}>
                {SERIES_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        {/* progress lockup: "Read 3 of 7 · 2 to get" + a subtle rule */}
        <p className="mt-2 text-[14px] text-ink">
          {progressLine(progress)}
          {detail.series.status && (
            <span className="text-muted"> · {SERIES_STATUS_LABELS[detail.series.status]}</span>
          )}
        </p>
        <div
          aria-hidden
          className="mt-2 h-[3px] w-full overflow-hidden rounded-full"
          style={{ background: 'var(--chip)' }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${progress.total ? Math.round((progress.read / progress.total) * 100) : 0}%`,
              background: 'linear-gradient(90deg, var(--primary), var(--gold))',
            }}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="skin-control border border-line px-3.5 py-1.5 text-[12.5px] font-semibold text-ink"
            style={{ background: 'var(--card)' }}
          >
            ＋ Add books
          </button>
          <button
            type="button"
            onClick={addGhostSlot}
            className="skin-control border border-dashed border-line px-3.5 py-1.5 text-[12.5px] font-semibold text-muted"
            style={{ background: 'var(--chip)' }}
          >
            ＋ One you don’t have yet
          </button>
          <button
            type="button"
            onClick={fetchSource}
            disabled={applySource.isPending}
            className="skin-control border border-line px-3.5 py-1.5 text-[12.5px] font-semibold text-muted disabled:opacity-50"
            style={{ background: 'var(--card)' }}
          >
            {applySource.isPending ? 'Checking the catalog…' : '⟳ Fetch series data'}
          </button>
        </div>
        {sourceNote && <p className="mt-2 text-[12.5px] text-muted">{sourceNote}</p>}
      </header>

      {/* THE order — every canonical slot, ghosts included, reader state inline */}
      <ol className="mt-5 flex flex-col gap-2">
        {entries.map((e, i) => {
          const book = e.bookId ? byId.get(e.bookId) : undefined
          const state = entryState(book, !!(book && tbrNameByBook.has(book.id)))
          const isNext = next?.id === e.id
          const stateLine =
            state === 'read'
              ? '✓ Read'
              : state === 'reading'
                ? 'Reading now'
                : state === 'tbr'
                  ? `On ${tbrNameByBook.get(book!.id)!}`
                  : state === 'unread'
                    ? 'On your shelf'
                    : state === 'wishlist'
                      ? '⊹ To get'
                      : '⊹ Not in your library'
          return (
            <li
              key={e.id}
              draggable
              onDragStart={() => setDragIdx(i)}
              onDragOver={(ev) => ev.preventDefault()}
              onDrop={() => {
                if (dragIdx != null) placeAt(dragIdx, i)
                setDragIdx(null)
              }}
              className="relative rounded-2xl border p-3"
              style={
                isNext
                  ? {
                      borderColor: 'var(--accent-ink)',
                      background: 'var(--card)',
                      boxShadow: '0 6px 24px color-mix(in srgb, var(--accent) 18%, transparent)',
                    }
                  : {
                      borderColor: 'var(--line)',
                      background: state === 'ghost' ? 'transparent' : 'var(--card)',
                      ...(state === 'ghost' ? { borderStyle: 'dashed' } : {}),
                    }
              }
            >
              {isNext && (
                <p
                  className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.24em]"
                  style={{ color: 'var(--accent-ink)' }}
                >
                  {state === 'ghost' || state === 'wishlist'
                    ? 'Next up — you need this one'
                    : 'Next up'}
                </p>
              )}
              <div className="flex items-center gap-3">
                {/* position badge (+ optional label tag) — tap to tag: novella, prequel, … */}
                <button
                  type="button"
                  onClick={() => editLabel(e)}
                  aria-label={`Position ${fmtPos(e.position)}${e.label ? `, ${e.label}` : ''} — edit label`}
                  className="flex w-12 flex-none flex-col items-center"
                >
                  <span className="text-[15px] font-bold text-ink">{fmtPos(e.position)}</span>
                  {e.label && (
                    <span
                      className="mt-0.5 skin-control px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide"
                      style={{ background: 'var(--chip)', color: 'var(--muted)' }}
                    >
                      {e.label}
                    </span>
                  )}
                </button>

                {book ? (
                  <button
                    type="button"
                    onClick={() => openBook(book.id)}
                    // The row's visible text names the book; the suffix adds the state a thumb
                    // cannot show. Thumb-class carries state to the screen reader only.
                    aria-label={`Open ${book.title}${stateSuffix(book)}`}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <div
                      className="h-[60px] w-10 flex-none overflow-hidden rounded-md border border-line"
                      style={state === 'wishlist' ? { borderStyle: 'dashed' } : undefined}
                    >
                      <CoverImage book={book} thumb ghost={state === 'wishlist'} />
                    </div>
                    <span className="min-w-0">
                      <span
                        className="block truncate text-[15px] font-semibold text-ink"
                        style={{ fontFamily: 'var(--font-display)' }}
                      >
                        {book.title}
                      </span>
                      <span className="block text-[12px] text-muted">{stateLine}</span>
                    </span>
                  </button>
                ) : (
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div
                      className="flex h-[60px] w-10 flex-none items-center justify-center rounded-md border border-dashed border-line text-[16px] text-muted"
                      style={{ background: 'var(--chip)' }}
                    >
                      ⊹
                    </div>
                    <span className="min-w-0">
                      <span
                        className="block truncate text-[15px] font-semibold text-muted"
                        style={{ fontFamily: 'var(--font-display)' }}
                      >
                        {e.title}
                      </span>
                      <span className="block text-[12px] text-muted">
                        {e.author ? `${e.author} · ` : ''}
                        {stateLine}
                      </span>
                    </span>
                  </div>
                )}

                <div className="flex flex-none items-center gap-1">
                  {!book && (
                    <button
                      type="button"
                      onClick={() => setAcquiring(e)}
                      className="skin-control px-3 py-1.5 text-[12px] font-semibold"
                      style={{ background: 'var(--accent-fill)', color: 'var(--on-primary)' }}
                    >
                      ＋ Add
                    </button>
                  )}
                  {/* Every slot can be removed — ghost or not. Gating this on `!book` is what left a
                      book added from here with no way out (docs/archive/task-series-defects.md §Removal). */}
                  <button
                    type="button"
                    onClick={() => setRemoving(e)}
                    aria-label={`Remove ${book?.title ?? e.title} from the series`}
                    className="h-8 w-8 rounded-full text-[13px] text-muted hover:text-ink"
                  >
                    ✕
                  </button>
                  <span className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => placeAt(i, i - 1)}
                      disabled={i === 0}
                      aria-label={`Move ${book?.title ?? e.title} earlier`}
                      className="h-6 w-7 text-[11px] text-muted disabled:opacity-30"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => placeAt(i, i + 1)}
                      disabled={i === entries.length - 1}
                      aria-label={`Move ${book?.title ?? e.title} later`}
                      className="h-6 w-7 text-[11px] text-muted disabled:opacity-30"
                    >
                      ▼
                    </button>
                  </span>
                </div>
              </div>
            </li>
          )
        })}
      </ol>

      {!entries.length && (
        <p className="mt-6 rounded-2xl border border-dashed border-line p-6 text-center text-[13.5px] text-muted">
          Nothing on this shelf yet — add books from your library, or slot in the ones you still
          need.
        </p>
      )}

      {pickerOpen && (
        <LibraryPicker
          title={`Add to ${detail.series.name}`}
          books={books ?? []}
          excludeIds={memberIds}
          onClose={() => setPickerOpen(false)}
          onPick={(b: Book) => {
            addEntries.mutate({
              seriesId: detail.series.id,
              books: [b],
              after: Math.max(0, ...entries.map((x) => x.position)) + pickCount,
            })
            setPickCount((n) => n + 1)
          }}
        />
      )}

      {/* Removal is one act with one meaning on both surfaces: the slot goes, and a linked book stops
          naming the series. Confirmed because it discards the slot's place in the order. */}
      {removing && (
        <Modal title="Remove from this series?" onClose={() => setRemoving(null)}>
          <p className="-mt-2 mb-4 text-[13px] text-muted">
            <span className="font-semibold text-ink">
              {(removing.bookId ? byId.get(removing.bookId)?.title : null) ?? removing.title}
            </span>{' '}
            leaves {detail.series.name} and its place in the order goes with it.
            {removing.bookId
              ? ' The book stays in your library — it just stops belonging to this series.'
              : ' Fetching the series data again won’t bring it back.'}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setRemoving(null)}
              className="h-11 flex-1 skin-control border border-line text-[13.5px] font-semibold text-ink"
              style={{ background: 'var(--card)' }}
            >
              Keep it
            </button>
            <button
              type="button"
              onClick={() => {
                removeEntry.mutate({ entryId: removing.id })
                setRemoving(null)
              }}
              disabled={removeEntry.isPending}
              className="h-11 flex-1 skin-control text-[14px] font-semibold disabled:opacity-50"
              style={{
                background: 'linear-gradient(135deg, var(--primary), var(--gold))',
                color: 'var(--on-primary)',
              }}
            >
              Remove
            </button>
          </div>
        </Modal>
      )}

      {acquiring && (
        <Modal title={`Add ${acquiring.title}`} onClose={() => setAcquiring(null)}>
          <p className="-mt-2 mb-3 text-[13px] text-muted">
            Lands in your library as a wishlist copy — {fmtPos(acquiring.position)} stays its place
            in the order.
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                acquire.mutate({ entry: acquiring, genre: siblingGenre })
                setAcquiring(null)
              }}
              className="h-11 skin-control text-[14px] font-semibold"
              style={{ background: 'var(--accent-fill)', color: 'var(--on-primary)' }}
            >
              ⊹ Add to wishlist
            </button>
            {tbrs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  acquire.mutate({ entry: acquiring, genre: siblingGenre, tbrId: t.id })
                  setAcquiring(null)
                }}
                className="h-11 skin-control border border-line text-[14px] font-semibold text-ink"
                style={{
                  textTransform: 'none',
                  /* SKIN-UPPERCASE-INTERIM */ background: 'var(--card)',
                }}
              >
                …and onto {t.name}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </section>
  )
}

export const seriesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'series/$seriesName',
  component: SeriesScreen,
})
