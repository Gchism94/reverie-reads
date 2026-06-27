import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { authorOf, type Book, type SeriesGroup } from '@reverie/core'
import { subgenreGradient } from './constants'
import { Modal } from '../components/Modal'
import { useUpdateBook } from '../data/books'
import { useReadingOrders } from '../data/readingOrders'

const posNum = (b: Book) => (typeof b.position === 'number' ? b.position : Number(b.position) || 0)
const isRead = (b: Book) => b.readStatus === 'Read' || b.reads.length > 0

function seriesBadge(g: SeriesGroup): { text: string; bg: string; fg: string } {
  if (g.total && g.owned < g.total)
    return { text: `📚 ${g.total - g.owned} to get`, bg: 'rgba(232,58,120,0.16)', fg: 'var(--primary)' }
  if (g.total && g.read >= g.total)
    return { text: '✓ Series done', bg: 'rgba(123,63,160,0.18)', fg: 'var(--ink)' }
  if (!g.total) return { text: 'length not set', bg: 'rgba(123,63,160,0.14)', fg: 'var(--muted)' }
  return { text: '✓ All owned', bg: 'rgba(123,63,160,0.18)', fg: 'var(--ink)' }
}

function SeriesCard({ group, onOpen }: { group: SeriesGroup; onOpen: () => void }) {
  const badge = seriesBadge(group)
  const slots = Math.min(Math.max(group.owned, group.total ?? 0), 10)
  const hasPos = group.books.some((b) => b.position !== '' && b.position != null)

  const spines = []
  for (let i = 1; i <= slots; i++) {
    const b = hasPos ? group.books.find((x) => posNum(x) === i) : group.books[i - 1]
    if (b) {
      const [g0, g1] = subgenreGradient(b.subgenre)
      spines.push(
        <div
          key={i}
          title={b.title}
          className="relative h-12 w-3 flex-none overflow-hidden rounded-sm"
          style={{ background: b.cover ? `center/cover url(${b.cover})` : `linear-gradient(${g0}, ${g1})` }}
        >
          {isRead(b) && (
            <span
              className="absolute inset-x-0 bottom-0 text-center text-[7px] leading-3"
              style={{ background: 'var(--gold)', color: '#3a2400' }}
            >
              ✓
            </span>
          )}
        </div>,
      )
    } else {
      spines.push(
        <div
          key={i}
          title={`#${i} — not on your shelf`}
          className="h-12 w-3 flex-none rounded-sm border border-dashed border-line"
        />,
      )
    }
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="rounded-2xl border border-line p-4 text-left backdrop-blur"
      style={{ background: 'var(--card)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[18px] italic text-ink" style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
          {group.name}
        </h3>
        <span
          className="flex-none rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
          style={{ background: badge.bg, color: badge.fg }}
        >
          {badge.text}
        </span>
      </div>
      <div className="mt-1 text-[12px] text-muted">
        {authorOf(group.books[0] ?? ({} as Book))} · {group.owned} owned
        {group.total ? ` of ${group.total}` : ''} · {group.read} read
      </div>
      <div className="mt-3 flex items-end gap-1">{spines}</div>
    </button>
  )
}

function SeriesModal({
  name,
  allBooks,
  onClose,
}: {
  name: string
  allBooks: Book[]
  onClose: () => void
}) {
  const navigate = useNavigate()
  const updateBook = useUpdateBook()
  const { data: orders } = useReadingOrders()
  const books = allBooks.filter((b) => b.series === name).sort((a, b) => posNum(a) - posNum(b))
  const total = books.find((b) => b.seriesCount != null)?.seriesCount ?? null
  // Reading orders that pull in this series (as a series item or by including one of its books).
  const bookIds = new Set(books.map((b) => b.id))
  const inOrders = (orders ?? []).filter((o) =>
    o.items.some((it) => (it.kind === 'series' ? it.series === name : !!it.bookId && bookIds.has(it.bookId))),
  )

  function setLength() {
    const input = window.prompt('How many books are in this series?', total ? String(total) : '')
    if (input == null) return
    const v = parseInt(input) || null
    for (const b of books) {
      updateBook.mutate({
        id: b.id,
        patch: { seriesCount: v, status: v && b.status === 'Standalone' ? 'Series' : b.status },
      })
    }
  }

  return (
    <Modal title={name} onClose={onClose}>
      <p className="-mt-2 mb-3 text-[13px] text-muted">
        {books.length} owned{total ? ` of ${total}` : ' · series length not set'}
      </p>
      {inOrders.length > 0 && (
        <p className="-mt-1 mb-3 text-[12.5px] text-muted">
          Part of reading order:{' '}
          {inOrders.map((o, i) => (
            <span key={o.id}>
              {i > 0 ? ', ' : ''}
              <Link to="/orders" onClick={onClose} className="font-semibold text-primary underline-offset-2 hover:underline">
                {o.name}
              </Link>
            </span>
          ))}
        </p>
      )}
      <button
        type="button"
        onClick={setLength}
        className="mb-4 rounded-full border border-line px-3.5 py-1.5 text-[12.5px] font-semibold text-ink"
        style={{ background: 'var(--card)' }}
      >
        {total ? 'Change' : 'Set'} series length
      </button>

      <ul className="flex flex-col gap-1.5">
        {books.map((b) => (
          <li key={b.id}>
            <button
              type="button"
              onClick={() => {
                onClose()
                void navigate({ to: '/book/$bookId', params: { bookId: b.id } })
              }}
              className="flex w-full items-center gap-3 rounded-xl border border-line px-3 py-2 text-left"
              style={{ background: 'var(--field)' }}
            >
              <span
                className="flex h-5 w-5 flex-none items-center justify-center rounded-full border border-line text-[11px]"
                style={isRead(b) ? { background: 'var(--accent-fill)', color: 'var(--on-primary)' } : undefined}
              >
                {isRead(b) ? '✓' : ''}
              </span>
              <span className="flex-1">
                <span className="text-[14px] font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>
                  {b.position !== '' ? `#${b.position} · ` : ''}
                  {b.title}
                </span>
                <span className="block text-[12px] text-muted">
                  {b.readStatus}
                  {b.rating ? ` · ${'★'.repeat(Math.round(b.rating))}` : ''}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  )
}

export function SeriesView({ groups, allBooks }: { groups: SeriesGroup[]; allBooks: Book[] }) {
  const [open, setOpen] = useState<string | null>(null)
  if (!groups.length) {
    return (
      <p className="px-2 py-10 text-center text-[14px] text-muted">
        No series match these filters. Add a series name to a book via “edit details”.
      </p>
    )
  }
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => (
          <SeriesCard key={g.name} group={g} onOpen={() => setOpen(g.name)} />
        ))}
      </div>
      {open && <SeriesModal name={open} allBooks={allBooks} onClose={() => setOpen(null)} />}
    </>
  )
}
