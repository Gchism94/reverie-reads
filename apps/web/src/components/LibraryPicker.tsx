import { useMemo, useState } from 'react'
import { authorOf, possessionState, type Book } from '@reverie/core'
import { Modal } from './Modal'
import { CoverImage } from './CoverImage'

/**
 * Pick a book from YOUR library (owned + wishlist) — the add-to-shelf / Reading Now picker.
 * Stays open after a pick so several books go on a shelf in one sitting; picked rows flip to a
 * ✓ state. The footer carries the EXTERNAL-SEARCH SEAM: pass `onExternalSearch` and the
 * "search everywhere" row goes live with the current query — the discover-search task plugs in
 * there without any rework here. Until then it renders visibly disabled.
 */
export function LibraryPicker({
  title,
  books,
  excludeIds,
  onPick,
  onClose,
  onExternalSearch,
}: {
  title: string
  books: Book[]
  /** already-member ids — shown as ✓ and not pickable again */
  excludeIds: ReadonlySet<string>
  onPick: (book: Book) => void
  onClose: () => void
  /** discover-search seam — provide to enable "search everywhere" with the typed query */
  onExternalSearch?: (query: string) => void
}) {
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const pool = needle
      ? books.filter((b) => `${b.title} ${authorOf(b)} ${b.series}`.toLowerCase().includes(needle))
      : books
    return pool.slice(0, 30)
  }, [books, q])

  const pick = (b: Book) => {
    onPick(b)
    setPicked((prev) => new Set(prev).add(b.id))
  }

  return (
    <Modal title={title} onClose={onClose}>
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search your library…"
        aria-label="Search your library"
        className="h-10 w-full skin-card border border-line px-3 text-[14px] text-ink outline-none"
        style={{ background: 'var(--field)' }}
      />

      <ul className="mt-3 flex max-h-[46vh] flex-col gap-1.5 overflow-y-auto">
        {matches.map((b) => {
          const added = excludeIds.has(b.id) || picked.has(b.id)
          return (
            <li key={b.id}>
              <button
                type="button"
                disabled={added}
                onClick={() => pick(b)}
                className="flex w-full items-center gap-3 skin-card border border-line px-2.5 py-2 text-left disabled:opacity-60"
                style={{ background: 'var(--field)' }}
              >
                <span
                  className="h-12 w-8 flex-none overflow-hidden rounded border border-line"
                  style={{ background: 'var(--card)' }}
                >
                  <CoverImage book={b} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-[13.5px] font-semibold text-ink">
                    {b.title}
                  </span>
                  <span className="block break-words text-[11.5px] text-muted">
                    {authorOf(b)}
                    {possessionState(b) === 'wishlist' && ' · ⊹ wishlist'}
                    {possessionState(b) === 'borrowed' && ' · ⇄ borrowed'}
                  </span>
                </span>
                <span
                  className="flex-none text-[12.5px] font-semibold"
                  style={{ color: added ? 'var(--muted)' : 'var(--accent-ink)' }}
                >
                  {added ? '✓ Added' : '＋ Add'}
                </span>
              </button>
            </li>
          )
        })}
        {!matches.length && (
          <li className="px-1 py-3 text-[13px] text-muted">Nothing in your library matches.</li>
        )}
      </ul>

      {/* external-search seam (feat/discover-search wires this up) */}
      <div className="mt-3 border-t border-line pt-3">
        <button
          type="button"
          disabled={!onExternalSearch}
          onClick={() => onExternalSearch?.(q)}
          className="skin-control w-full border border-dashed border-line px-3 py-2.5 text-[13px] font-semibold disabled:opacity-50"
          style={{ background: 'var(--chip)', color: 'var(--muted)' }}
        >
          Can’t find it? Search everywhere{onExternalSearch ? '' : ' — coming soon'}
        </button>
      </div>
    </Modal>
  )
}
