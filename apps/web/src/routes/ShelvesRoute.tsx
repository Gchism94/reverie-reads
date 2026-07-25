import { useState } from 'react'
import { createRoute, useNavigate } from '@tanstack/react-router'
import { authorOf, bookOwnedFormats, type Book, type OwnedFormat } from '@reverie/core'
import { rootRoute } from './RootRoute'
import { useBooks } from '../data/books'
import {
  useCreateList,
  useDeleteList,
  useLists,
  useReorderList,
  useReorderLists,
  useUpdateList,
  type UiList,
} from '../data/lists'
import { useAddListItem, useAllListItems, useRemoveListItem } from '../data/listItems'
import { LibraryPicker } from '../components/LibraryPicker'
import { ExternalSearchSheet } from '../components/ExternalSearchSheet'
import { SpineShelf } from '../components/SpineShelf'
import { Modal } from '../components/Modal'
import { BookmarkGlyph } from '../components/BookmarkGlyph'

type Tab = 'tbr' | 'collection'

function ListModal({
  list,
  books,
  onClose,
  onOpenBook,
}: {
  list: UiList
  books: Book[]
  onClose: () => void
  onOpenBook: (id: string) => void
}) {
  const updateList = useUpdateList()
  const deleteList = useDeleteList()
  const reorder = useReorderList()
  const removeItem = useRemoveListItem()
  const [order, setOrder] = useState(books.map((b) => b.id))
  const byId = new Map(books.map((b) => [b.id, b]))

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= order.length) return
    const next = [...order]
    const a = next[i]
    const b = next[j]
    if (a === undefined || b === undefined) return
    next[i] = b
    next[j] = a
    setOrder(next)
    reorder.mutate({ listId: list.id, orderedBookIds: next })
  }

  return (
    <Modal title={list.name} onClose={onClose}>
      <div className="-mt-2 mb-4 flex flex-wrap gap-2">
        {/* Priority is for every kind now — the flag is the cap, home renders all flagged shelves. */}
        <button
          type="button"
          onClick={() => updateList.mutate({ id: list.id, isPriority: !list.priority })}
          className="rounded-full border border-line px-3 py-1.5 text-[12.5px] font-semibold text-ink"
          style={{ background: 'var(--card)' }}
        >
          <BookmarkGlyph filled={list.priority} /> {list.priority ? 'Priority list' : 'Make priority'}
        </button>
        <button
          type="button"
          onClick={() => {
            const name = window.prompt('Rename:', list.name)
            if (name?.trim()) updateList.mutate({ id: list.id, name: name.trim() })
          }}
          className="rounded-full border border-line px-3 py-1.5 text-[12.5px] font-semibold text-ink"
          style={{ background: 'var(--card)' }}
        >
          Rename
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm('Delete this list? (Books stay in your library.)')) {
              deleteList.mutate(list.id, { onSuccess: onClose })
            }
          }}
          className="rounded-full border border-line px-3 py-1.5 text-[12.5px] font-semibold text-primary"
          style={{ background: 'var(--card)' }}
        >
          Delete list
        </button>
      </div>

      {order.length ? (
        <ul className="flex flex-col gap-1.5">
          {order.map((id, i) => {
            const b = byId.get(id)
            if (!b) return null
            return (
              <li key={id} className="flex items-center gap-2 skin-card border border-line px-3 py-2" style={{ background: 'var(--field)' }}>
                <span className="flex flex-col">
                  <button type="button" onClick={() => move(i, -1)} aria-label="Move up" className="px-1 py-0.5 text-[12px] leading-none text-muted">
                    ▲
                  </button>
                  <button type="button" onClick={() => move(i, 1)} aria-label="Move down" className="px-1 py-0.5 text-[12px] leading-none text-muted">
                    ▼
                  </button>
                </span>
                <button type="button" onClick={() => onOpenBook(id)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[14px] font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>
                    {b.title}
                  </span>
                  <span className="block truncate text-[12px] text-muted">{authorOf(b)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    removeItem.mutate({ listId: list.id, bookId: id })
                    setOrder((prev) => prev.filter((x) => x !== id))
                  }}
                  className="text-[12px] text-muted hover:text-primary"
                >
                  remove
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-[13px] text-muted">
          Empty — open any book and use “Lists &amp; shelves” to add it here.
        </p>
      )}
    </Modal>
  )
}

const OWNED_SHELVES: { fmt: OwnedFormat; label: string; icon: string }[] = [
  { fmt: 'physical', label: 'Physical', icon: '📖' },
  { fmt: 'ebook', label: 'Ebook', icon: '📱' },
  { fmt: 'audiobook', label: 'Audiobook', icon: '🎧' },
]

/** Smart shelves derived from per-format ownership — auto-updating, not hand-edited. */
function OwnedShelves({ books, onOpen }: { books: Book[]; onOpen: (id: string) => void }) {
  return (
    <div className="mb-8">
      <h2 className="text-[16px] font-semibold text-ink">Your copies</h2>
      <p className="mb-3 text-[12px] text-muted">Updates as you mark copies you have, owned or borrowed — no add or remove.</p>
      <div className="flex flex-col gap-5">
        {OWNED_SHELVES.map(({ fmt, label, icon }) => {
          const shelf = books.filter((b) => bookOwnedFormats(b).includes(fmt))
          return (
            <div key={fmt}>
              <div className="mb-1 text-[14px] font-semibold text-ink">
                {icon} {label} <span className="text-[12px] font-normal text-muted">· {shelf.length}</span>
              </div>
              {shelf.length ? (
                <SpineShelf books={shelf} onOpen={onOpen} />
              ) : (
                <p className="skin-card border border-line p-3 text-[13px] text-muted">
                  Flip a copy switch on a book and it lands here.
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ShelvesScreen() {
  const navigate = useNavigate()
  const { data: books } = useBooks()
  const { data: lists } = useLists()
  const { data: items } = useAllListItems()
  const createList = useCreateList()
  const reorderLists = useReorderLists()
  const addItem = useAddListItem()
  const [tab, setTab] = useState<Tab>('tbr')
  const [openListId, setOpenListId] = useState<string | null>(null)
  const [pickerFor, setPickerFor] = useState<UiList | null>(null)
  const [externalFor, setExternalFor] = useState<UiList | null>(null)
  const [dragListIdx, setDragListIdx] = useState<number | null>(null)

  const all = books ?? []
  const byId = new Map(all.map((b) => [b.id, b]))
  const openBook = (id: string) => void navigate({ to: '/book/$bookId', params: { bookId: id } })

  const booksFor = (listId: string): Book[] =>
    (items ?? [])
      .filter((it) => it.list_id === listId)
      .sort((a, b) => (a.position ?? 1e9) - (b.position ?? 1e9))
      .map((it) => byId.get(it.book_id))
      .filter((b): b is Book => !!b)

  // Manual order (useLists sorts by sort_order) — priority no longer jumps the queue here.
  const shown = (lists ?? []).filter((l) => l.kind === tab)

  // Renumber the FULL list set (both kinds) with this tab's segment reordered in place — kinds
  // interleave on Home by the same sort_order, so a tab-local renumber must not collide.
  const applyTabOrder = (tabIds: string[]) => {
    const queue = [...tabIds]
    const full = (lists ?? []).map((l) => (l.kind === tab ? queue.shift()! : l.id))
    reorderLists.mutate(full)
  }

  const moveList = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= shown.length) return
    const ids = shown.map((l) => l.id)
    const a = ids[i]!
    ids[i] = ids[j]!
    ids[j] = a
    applyTabOrder(ids)
  }

  const dropListOn = (target: number) => {
    if (dragListIdx == null || dragListIdx === target) return
    const ids = shown.map((l) => l.id)
    const [moved] = ids.splice(dragListIdx, 1)
    ids.splice(target, 0, moved!)
    setDragListIdx(null)
    applyTabOrder(ids)
  }

  const openList = openListId ? (lists ?? []).find((l) => l.id === openListId) : null

  return (
    <section className="px-4 py-6 sm:px-6">
      <h1 className="mb-4 text-[22px] italic text-ink" style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
        Shelves
      </h1>

      <OwnedShelves books={all} onOpen={openBook} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[16px] font-semibold text-ink">Your lists</h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-full border border-line p-1" style={{ background: 'var(--card)' }}>
            {(['tbr', 'collection'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                aria-pressed={tab === t}
                className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold"
                style={tab === t ? { background: 'var(--accent-fill)', color: 'var(--on-primary)' } : { color: 'var(--muted)' }}
              >
                {t === 'tbr' ? 'TBRs' : 'Collections'}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              const name = window.prompt(tab === 'tbr' ? 'Name this TBR list:' : 'Name this collection:')
              if (name?.trim()) createList.mutate({ name: name.trim(), kind: tab })
            }}
            className="rounded-full px-4 py-2 text-[13px] font-semibold"
            style={{ background: 'linear-gradient(135deg, var(--primary), var(--gold))', color: 'var(--on-primary)' }}
          >
            ＋ New {tab === 'tbr' ? 'TBR' : 'collection'}
          </button>
        </div>
      </div>

      {shown.length ? (
        <div className="flex flex-col gap-8">
          {shown.map((l, i) => {
            const shelfBooks = booksFor(l.id)
            return (
              // The card is a drop TARGET but not a drag source: making the whole thing draggable
              // meant dragging a book cover picked up the entire shelf instead of doing nothing.
              // The grab handle below is the only place a shelf drag can start.
              <div
                key={l.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dropListOn(i)}
                style={dragListIdx === i ? { opacity: 0.4 } : undefined}
              >
                <div className="mb-1 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    {/* the shelf's name IS the door to its full page */}
                    <button type="button" onClick={() => void navigate({ to: '/shelf/$listId', params: { listId: l.id } })} className="block text-left">
                      <h2 className="text-[18px] italic text-ink underline-offset-4 hover:underline" style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                        {l.priority && (
                          <span style={{ color: 'var(--accent-ink)' }}>
                            <BookmarkGlyph size={12} />{' '}
                          </span>
                        )}
                        {l.name} <span aria-hidden className="text-[13px] text-muted">›</span>
                      </h2>
                    </button>
                    <p className="text-[12px] text-muted">
                      {shelfBooks.length} book{shelfBooks.length !== 1 ? 's' : ''}
                      {shelfBooks.length > 1 ? ' · scroll the shelf to flip a cover' : ''}
                    </p>
                  </div>
                  <div className="flex flex-none items-center gap-1.5">
                    <button
                      type="button"
                      draggable
                      onDragStart={() => setDragListIdx(i)}
                      onDragEnd={() => setDragListIdx(null)}
                      aria-label={`Drag to reorder ${l.name}`}
                      title={`Drag to reorder ${l.name}`}
                      className="cursor-grab px-1 text-[13px] leading-none text-muted"
                    >
                      ⠿
                    </button>
                    <span className="flex flex-col">
                      <button type="button" onClick={() => moveList(i, -1)} aria-label={`Move ${l.name} up`} className="px-1 py-0.5 text-[12px] leading-none text-muted">
                        ▲
                      </button>
                      <button type="button" onClick={() => moveList(i, 1)} aria-label={`Move ${l.name} down`} className="px-1 py-0.5 text-[12px] leading-none text-muted">
                        ▼
                      </button>
                    </span>
                    <button
                      type="button"
                      onClick={() => setOpenListId(l.id)}
                      className="rounded-full border border-line px-3.5 py-1.5 text-[12.5px] font-semibold text-ink"
                      style={{ background: 'var(--card)' }}
                    >
                      Edit
                    </button>
                  </div>
                </div>
                {shelfBooks.length ? (
                  <SpineShelf books={shelfBooks} onOpen={openBook} onAdd={() => setPickerFor(l)} addLabel={`Add a book to ${l.name}`} />
                ) : (
                  <p className="skin-panel border border-line p-4 text-[13px] text-muted">
                    No books yet —{' '}
                    <button type="button" onClick={() => setPickerFor(l)} className="font-semibold text-primary underline-offset-2 hover:underline">
                      add the first
                    </button>
                    .
                  </p>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <p className="skin-panel border border-line p-6 text-center text-[14px] text-muted">
          No {tab === 'tbr' ? 'TBRs' : 'collections'} yet — hit ＋ New.
        </p>
      )}

      {openList && (
        <ListModal
          list={openList}
          books={booksFor(openList.id)}
          onClose={() => setOpenListId(null)}
          onOpenBook={(id) => {
            setOpenListId(null)
            openBook(id)
          }}
        />
      )}

      {pickerFor && (
        <LibraryPicker
          title={`Add to ${pickerFor.name}`}
          books={all}
          excludeIds={new Set(booksFor(pickerFor.id).map((b) => b.id))}
          onPick={(b) => {
            const positions = (items ?? []).filter((it) => it.list_id === pickerFor.id).map((it) => it.position ?? 0)
            addItem.mutate({ listId: pickerFor.id, bookId: b.id, afterPosition: Math.max(0, ...positions) })
          }}
          onClose={() => setPickerFor(null)}
          // The external-search seam — same as the shelf detail page. Without it, "search everywhere"
          // stays disabled and a book you don't already own can't be added from the Shelves page.
          onExternalSearch={() => {
            const l = pickerFor
            setPickerFor(null)
            setExternalFor(l)
          }}
        />
      )}

      {externalFor && (
        <ExternalSearchSheet
          listId={externalFor.id}
          listName={externalFor.name}
          books={all}
          onClose={() => setExternalFor(null)}
        />
      )}
    </section>
  )
}

export const shelvesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'shelves',
  component: ShelvesScreen,
})
