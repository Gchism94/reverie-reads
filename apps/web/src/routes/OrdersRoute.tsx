import { useMemo, useState } from 'react'
import { createRoute, useNavigate } from '@tanstack/react-router'
import {
  authorOf,
  expandOrder,
  nextInOrder,
  orderProgress,
  sortItems,
  type Book,
  type ReadingOrder,
  type ReadingOrderItem,
} from '@reverie/core'
import { rootRoute } from './RootRoute'
import { useBooks } from '../data/books'
import {
  useAddOrderItem,
  useCreateOrder,
  useDeleteOrder,
  useReadingOrders,
  useRemoveOrderItem,
  useReorderItem,
  useSetItemNote,
  useUpdateOrder,
} from '../data/readingOrders'

const inputClass = 'h-10 w-full rounded-xl border border-line px-3 text-[14px] text-ink outline-none'
const inputStyle = { background: 'var(--field)' } as const

/** Label for an item: a book's title or a series name (+ its book count). */
function itemLabel(item: ReadingOrderItem, books: Book[]): { title: string; sub: string } {
  if (item.kind === 'series') {
    const n = books.filter((b) => b.series === item.series).length
    return { title: item.series ?? 'Series', sub: `series · ${n} book${n === 1 ? '' : 's'}` }
  }
  const b = books.find((x) => x.id === item.bookId)
  return { title: b?.title ?? 'Missing book', sub: b ? authorOf(b) || 'book' : 'book' }
}

function AddItem({ order, books }: { order: ReadingOrder; books: Book[] }) {
  const addItem = useAddOrderItem()
  const [q, setQ] = useState('')
  const seriesNames = useMemo(
    () => [...new Set(books.filter((b) => b.series).map((b) => b.series))].sort((a, b) => a.localeCompare(b)),
    [books],
  )
  const matches = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return []
    return books
      .filter((b) => `${b.title} ${authorOf(b)}`.toLowerCase().includes(term))
      .slice(0, 6)
  }, [q, books])

  return (
    <div className="mt-3 rounded-xl border border-line p-3" style={{ background: 'var(--field)' }}>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-[0.15em] text-muted">Add a book</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your library…" className={inputClass} style={{ background: 'var(--card)' }} />
          {matches.length > 0 && (
            <ul className="mt-1.5 flex flex-col gap-1">
              {matches.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => {
                      addItem.mutate({ order, bookId: b.id })
                      setQ('')
                    }}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-line px-2.5 py-1.5 text-left text-[13px] text-ink"
                    style={{ background: 'var(--card)' }}
                  >
                    <span className="truncate">{b.title}</span>
                    <span className="flex-none text-[12px] font-semibold text-primary">Add</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-[0.15em] text-muted" htmlFor={`series-${order.id}`}>
            Add a whole series
          </label>
          <select
            id={`series-${order.id}`}
            value=""
            onChange={(e) => {
              if (e.target.value) addItem.mutate({ order, series: e.target.value })
            }}
            className={inputClass}
            style={{ background: 'var(--card)' }}
          >
            <option value="">Choose a series…</option>
            {seriesNames.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11.5px] text-muted">A series expands to its books in series order at that slot.</p>
        </div>
      </div>
    </div>
  )
}

function OrderEditor({ order, books, onOpenBook }: { order: ReadingOrder; books: Book[]; onOpenBook: (id: string) => void }) {
  const items = sortItems(order.items)
  const reorder = useReorderItem()
  const removeItem = useRemoveOrderItem()
  const setNote = useSetItemNote()
  const expanded = useMemo(() => expandOrder(order.items, books), [order.items, books])
  const next = nextInOrder(expanded)
  const { read, total } = orderProgress(expanded)
  const pct = total ? Math.round((read / total) * 100) : 0

  return (
    <div>
      {/* progress + next-to-read */}
      <div className="rounded-2xl border border-line p-4" style={{ background: 'var(--card)' }}>
        <div className="flex items-center justify-between text-[13px] text-muted">
          <span>
            {read} of {total} read
          </span>
          <span>{pct}%</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full" style={{ background: 'var(--field)' }}>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, var(--primary), var(--gold))' }} />
        </div>
        {next ? (
          <button
            type="button"
            onClick={() => onOpenBook(next.book.id)}
            className="mt-3 flex w-full items-center gap-2 rounded-xl border border-line px-3 py-2 text-left"
            style={{ background: 'var(--field)' }}
          >
            <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-primary">Next</span>
            <span className="truncate text-[14px] font-semibold text-ink">{next.book.title}</span>
            {next.viaSeries && <span className="flex-none text-[12px] text-muted">· {next.viaSeries}</span>}
          </button>
        ) : (
          <p className="mt-3 text-[13px] text-muted">{total ? 'You’ve read everything in this order. ✦' : 'Add books or series below to build the order.'}</p>
        )}
      </div>

      {/* the authored item sequence (reorder / note / remove) */}
      <ol className="mt-3 flex flex-col gap-2">
        {items.map((item, i) => {
          const { title, sub } = itemLabel(item, books)
          return (
            <li key={item.id} className="rounded-xl border border-line p-2.5" style={{ background: 'var(--card)' }}>
              <div className="flex items-center gap-2">
                <span className="flex-none text-[12px] font-semibold text-muted">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold text-ink">{title}</div>
                  <div className="text-[12px] text-muted">{sub}</div>
                </div>
                <button
                  type="button"
                  onClick={() => reorder.mutate({ order, itemId: item.id, toIndex: i - 1 })}
                  disabled={i === 0}
                  aria-label={`Move ${title} up`}
                  className="flex h-8 w-7 flex-none items-center justify-center rounded-lg border border-line text-ink disabled:opacity-30"
                  style={inputStyle}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => reorder.mutate({ order, itemId: item.id, toIndex: i + 2 })}
                  disabled={i === items.length - 1}
                  aria-label={`Move ${title} down`}
                  className="flex h-8 w-7 flex-none items-center justify-center rounded-lg border border-line text-ink disabled:opacity-30"
                  style={inputStyle}
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => removeItem.mutate(item.id)}
                  aria-label={`Remove ${title}`}
                  className="flex h-8 w-7 flex-none items-center justify-center rounded-lg border border-line text-muted hover:text-ink"
                  style={inputStyle}
                >
                  ✕
                </button>
              </div>
              <input
                defaultValue={item.note ?? ''}
                onBlur={(e) => {
                  if ((e.target.value || '') !== (item.note ?? '')) setNote.mutate({ itemId: item.id, note: e.target.value })
                }}
                placeholder="Note (e.g. “read to ch. 20 before the next book”)"
                aria-label={`Note for ${title}`}
                className="mt-2 h-8 w-full rounded-lg border border-line px-2 text-[12.5px] text-ink outline-none"
                style={inputStyle}
              />
            </li>
          )
        })}
      </ol>

      <AddItem order={order} books={books} />
    </div>
  )
}

function OrdersScreen() {
  const navigate = useNavigate()
  const { data: books } = useBooks()
  const { data: orders } = useReadingOrders()
  const createOrder = useCreateOrder()
  const updateOrder = useUpdateOrder()
  const deleteOrder = useDeleteOrder()
  const [name, setName] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const lib = books ?? []
  const selected = (orders ?? []).find((o) => o.id === selectedId) ?? null
  const openBook = (id: string) => void navigate({ to: '/book/$bookId', params: { bookId: id } })

  return (
    <section className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <h1 className="text-[22px] italic text-ink" style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
        Reading orders
      </h1>
      <p className="mb-4 text-[13px] text-muted">
        A custom sequence across series and standalones — read two interconnected series in the exact order you want.
      </p>

      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          createOrder.mutate(
            { name: name.trim() },
            { onSuccess: (id) => setSelectedId(id) },
          )
          setName('')
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New order name (e.g. “Cosmere chronological”)" className={`${inputClass} flex-1`} style={inputStyle} />
        <button
          type="submit"
          className="h-10 flex-none rounded-full px-5 text-[14px] font-semibold"
          style={{ background: 'linear-gradient(135deg, var(--primary), var(--gold))', color: 'var(--on-primary)' }}
        >
          Create
        </button>
      </form>

      {(orders ?? []).length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {(orders ?? []).map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setSelectedId(o.id === selectedId ? null : o.id)}
              aria-pressed={o.id === selectedId}
              className="rounded-full border border-line px-3.5 py-2 text-[13px] font-semibold"
              style={o.id === selectedId ? { background: 'var(--accent-fill)', color: 'var(--on-primary)' } : { background: 'var(--card)', color: 'var(--ink)' }}
            >
              {o.name}
            </button>
          ))}
        </div>
      )}

      {!orders?.length && <p className="mt-6 text-center text-[13px] text-muted">No reading orders yet — name one above to start sequencing.</p>}

      {selected && (
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <input
              defaultValue={selected.name}
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v && v !== selected.name) updateOrder.mutate({ id: selected.id, name: v })
              }}
              aria-label="Order name"
              className="h-9 flex-1 rounded-lg border border-line px-2.5 text-[15px] font-semibold text-ink outline-none"
              style={inputStyle}
            />
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Delete the reading order “${selected.name}”? Its sequence is removed (your books are untouched).`)) {
                  deleteOrder.mutate(selected.id)
                  setSelectedId(null)
                }
              }}
              className="h-9 flex-none rounded-lg border border-line px-3 text-[12.5px] font-semibold text-muted hover:text-ink"
              style={inputStyle}
            >
              Delete
            </button>
          </div>
          <OrderEditor order={selected} books={lib} onOpenBook={openBook} />
        </div>
      )}
    </section>
  )
}

export const ordersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'orders',
  component: OrdersScreen,
})
