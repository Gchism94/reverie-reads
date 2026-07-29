import { useMemo, useState } from 'react'
import { createRoute, useNavigate } from '@tanstack/react-router'
import { type Book } from '@reverie/core'
import { rootRoute } from './RootRoute'
import { BackLink } from '../components/BackLink'
import { CoverCard } from '../components/CoverCard'
import { LibraryPicker } from '../components/LibraryPicker'
import { ExternalSearchSheet } from '../components/ExternalSearchSheet'
import { SpineShelf } from '../components/SpineShelf'
import { SectionHeader } from '../components/Structure'
import { BookmarkGlyph } from '../components/BookmarkGlyph'
import { useBooks, useUpdateBook } from '../data/books'
import { useAddListItem, useAllListItems, useRemoveListItem } from '../data/listItems'
import { useLists, useReorderList, useUpdateList } from '../data/lists'
import { useVoice } from '../skin/labels'

type ShelfView = 'spines' | 'grid'

const COVER_GRID: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))',
  gap: '18px 16px',
}

/**
 * The shelf/TBR detail page — a marquee surface: the signature spine-shelf treatment by default,
 * a cover grid for utility. BOTH views reorder (drag, or the keyboard arrows beside each book):
 * reorder used to live in the Grid view only, which is not the view a reader lands on, so
 * "reordering books in a shelf doesn't work" was the honest reading. All styling is the existing
 * slot/token kit — nothing bespoke.
 */
function ShelfScreen() {
  const { listId } = shelfRoute.useParams()
  const navigate = useNavigate()
  const { data: books } = useBooks()
  const { data: lists } = useLists()
  const { data: items } = useAllListItems()
  const reorder = useReorderList()
  const addItem = useAddListItem()
  const removeItem = useRemoveListItem()
  const updateList = useUpdateList()
  const updateBook = useUpdateBook()
  const voice = useVoice()

  // View lives in the ROUTE — see ShelvesRoute for the full reasoning. `undefined` = the default,
  // so /shelf/$listId stays canonical and only ?view=grid carries a param. The path param is
  // untouched; search params are independent of it, so this survives across different shelves.
  const { view = 'spines' } = shelfRoute.useSearch()
  const setView = (v: ShelfView) =>
    // replace: true — back should leave the shelf, not undo a view toggle.
    void navigate({
      to: '/shelf/$listId',
      params: { listId },
      search: v === 'spines' ? {} : { view: v },
      replace: true,
    })
  const [pickerOpen, setPickerOpen] = useState(false)
  const [externalSearch, setExternalSearch] = useState(false)
  // Appends within one picker session step past the stale cache max (invalidation lags picks).
  const [pickCount, setPickCount] = useState(0)
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  const list = (lists ?? []).find((l) => l.id === listId)
  const byId = useMemo(() => new Map((books ?? []).map((b) => [b.id, b])), [books])

  const listItems = useMemo(
    () =>
      (items ?? [])
        .filter((it) => it.list_id === listId)
        .sort((a, b) => (a.position ?? 1e15) - (b.position ?? 1e15)),
    [items, listId],
  )
  const shelfBooks = useMemo(
    () => listItems.map((it) => byId.get(it.book_id)).filter((b): b is Book => !!b),
    [listItems, byId],
  )
  const maxPosition = Math.max(0, ...listItems.map((it) => it.position ?? 0))
  const memberIds = useMemo(() => new Set(shelfBooks.map((b) => b.id)), [shelfBooks])

  if (!list)
    return (
      <div className="px-6 py-16 text-center text-muted">
        <p>That shelf isn’t here anymore.</p>
        <BackLink fallback="/shelves" className="mt-3 inline-block text-primary">
          ← Back to shelves
        </BackLink>
      </div>
    )

  const openBook = (id: string) => void navigate({ to: '/book/$bookId', params: { bookId: id } })

  const applyOrder = (ids: string[]) => reorder.mutate({ listId: list.id, orderedBookIds: ids })

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= shelfBooks.length) return
    const ids = shelfBooks.map((b) => b.id)
    const a = ids[i]!
    ids[i] = ids[j]!
    ids[j] = a
    applyOrder(ids)
  }

  const dropOn = (target: number) => {
    if (dragIdx == null || dragIdx === target) return
    const ids = shelfBooks.map((b) => b.id)
    const [moved] = ids.splice(dragIdx, 1)
    ids.splice(target, 0, moved!)
    setDragIdx(null)
    applyOrder(ids)
  }

  return (
    <section className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <BackLink fallback="/shelves" className="text-[13px] text-muted hover:text-ink">
        ← Shelves
      </BackLink>

      <header className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1
            className="text-[26px] italic leading-tight text-ink"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
          >
            {list.priority && (
              <span style={{ color: 'var(--accent-ink)' }}>
                <BookmarkGlyph size={15} />{' '}
              </span>
            )}
            {list.name}
          </h1>
          <p className="mt-0.5 text-[13px] text-muted">
            {list.description || (list.kind === 'tbr' ? 'A to-be-read shelf.' : 'A collection.')} ·{' '}
            {shelfBooks.length} book{shelfBooks.length !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex rounded-full border border-line p-1"
            style={{ background: 'var(--card)' }}
          >
            {(
              [
                ['spines', 'Shelf'],
                ['grid', 'Grid'],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className="rounded-full px-3 py-1 text-[12.5px] font-semibold"
                style={
                  view === v
                    ? { background: 'var(--accent-fill)', color: 'var(--on-primary)' }
                    : { color: 'var(--muted)' }
                }
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => updateList.mutate({ id: list.id, isPriority: !list.priority })}
            aria-pressed={list.priority}
            className="rounded-full border border-line px-3 py-1.5 text-[12.5px] font-semibold text-ink"
            style={{ background: 'var(--card)' }}
          >
            <BookmarkGlyph filled={list.priority} /> {list.priority ? 'Priority' : 'Make priority'}
          </button>
          <button
            type="button"
            onClick={() => {
              const description = window.prompt(
                'Describe this shelf (shown under its name):',
                list.description,
              )
              if (description != null)
                updateList.mutate({ id: list.id, description: description.trim() })
            }}
            className="rounded-full border border-line px-3 py-1.5 text-[12.5px] font-semibold text-ink"
            style={{ background: 'var(--card)' }}
          >
            Describe
          </button>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="skin-control skin-btn-primary px-3.5 py-1.5 text-[12.5px]"
          >
            ＋ Add books
          </button>
        </div>
      </header>

      <SectionHeader
        className="mb-3 mt-6"
        label={view === 'spines' ? 'The shelf' : 'Arrange'}
        readout={shelfBooks.length}
      />

      {shelfBooks.length === 0 ? (
        <p className="skin-panel border border-line p-6 text-center text-[14px] text-muted">
          Empty shelf — add the first book. {voice.motif}
        </p>
      ) : view === 'spines' ? (
        // The default view is arrangeable too — reorder used to exist only in Grid, which is not
        // where a reader lands (docs/task-shelf-regressions.md, audit follow-up).
        <SpineShelf
          books={shelfBooks}
          onOpen={openBook}
          onAdd={() => setPickerOpen(true)}
          addLabel={`Add a book to ${list.name}`}
          onReorder={applyOrder}
        />
      ) : (
        <div style={COVER_GRID}>
          {shelfBooks.map((b, i) => (
            <div
              key={b.id}
              draggable
              onDragStart={() => setDragIdx(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => dropOn(i)}
              onDragEnd={() => setDragIdx(null)}
              style={dragIdx === i ? { opacity: 0.4 } : undefined}
            >
              <CoverCard
                book={b}
                onOpen={() => openBook(b.id)}
                onToggleFave={() => updateBook.mutate({ id: b.id, patch: { fave: !b.fave } })}
              />
              <div className="mt-1 flex items-center justify-between">
                <span className="flex gap-0.5">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    aria-label={`Move ${b.title} earlier`}
                    className="rounded border border-line px-1.5 py-0.5 text-[12px] leading-none text-muted"
                    style={{ background: 'var(--chip)' }}
                  >
                    ◀
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    aria-label={`Move ${b.title} later`}
                    className="rounded border border-line px-1.5 py-0.5 text-[12px] leading-none text-muted"
                    style={{ background: 'var(--chip)' }}
                  >
                    ▶
                  </button>
                </span>
                <button
                  type="button"
                  onClick={() => removeItem.mutate({ listId: list.id, bookId: b.id })}
                  aria-label={`Remove ${b.title} from ${list.name}`}
                  className="text-[11.5px] text-muted hover:text-primary"
                >
                  remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {pickerOpen && (
        <LibraryPicker
          title={`Add to ${list.name}`}
          books={books ?? []}
          excludeIds={memberIds}
          onPick={(b) => {
            addItem.mutate({
              listId: list.id,
              bookId: b.id,
              afterPosition: maxPosition + pickCount * 1000,
            })
            setPickCount((c) => c + 1)
          }}
          onClose={() => {
            setPickerOpen(false)
            setPickCount(0)
          }}
          // The seam (task §3): "search everywhere" opens the same search backend as Discover,
          // bound to this shelf — a found book lands here as an unowned copy.
          onExternalSearch={() => {
            setPickerOpen(false)
            setPickCount(0)
            setExternalSearch(true)
          }}
        />
      )}

      {externalSearch && (
        <ExternalSearchSheet
          listId={list.id}
          listName={list.name}
          books={books ?? []}
          onClose={() => setExternalSearch(false)}
        />
      )}
    </section>
  )
}

export const shelfRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'shelf/$listId',
  // Fails closed — unknown values resolve to the default view rather than throwing.
  validateSearch: (search: Record<string, unknown>): { view?: ShelfView } => ({
    view: search.view === 'grid' ? 'grid' : undefined,
  }),
  component: ShelfScreen,
})
