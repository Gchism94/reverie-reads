import { useEffect, useRef, useState } from 'react'
import { isPossessed, type Book } from '@reverie/core'
import { Spine } from './Spine'
import { CoverImage } from './CoverImage'

/**
 * A horizontal shelf of book spines — each a real per-skin Spine (gilt-bound Tryst · brushed-metal
 * Aphelion), sized book-to-book. The spine nearest the shelf's centre widens, and flips open to its
 * cover when it has one — the design's signature spine-shelf interaction.
 *
 * Pass `onReorder` to make the shelf arrangeable in place (drag a spine, or the ◀▶ under it).
 * Reordering used to live only in the shelf page's GRID view, which is not the view a reader lands
 * on — so "reordering books in a shelf doesn't work" was the honest reading. Surfaces that are about
 * something other than one shelf's order (the /shelves overview, Home's rails) simply omit it.
 */
export function SpineShelf({
  books,
  onOpen,
  onAdd,
  addLabel = 'Add a book',
  onReorder,
}: {
  books: Book[]
  onOpen: (id: string) => void
  /** renders a "+" end-cap slot on the shelf — the add-book affordance in shelf form */
  onAdd?: () => void
  addLabel?: string
  /** when set, spines can be dragged (and keyboard-moved) into a new order */
  onReorder?: (orderedIds: string[]) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [activeId, setActiveId] = useState<string | null>(books[0]?.id ?? null)
  // Pointer/keyboard reveal, layered over the scroll-driven pick: shelves too short to scroll
  // never move activeId, so hover / :focus-visible / first-tap must be able to flip a spine too.
  const [pointerId, setPointerId] = useState<string | null>(null)
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  /** Move the spine at `from` into slot `to`, then hand the whole new order up. */
  const place = (from: number, to: number) => {
    if (!onReorder || from === to || to < 0 || to >= books.length || from < 0 || from >= books.length) return
    const ids = books.map((b) => b.id)
    const [moved] = ids.splice(from, 1)
    ids.splice(to, 0, moved!)
    onReorder(ids)
  }

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const update = () => {
      const r = el.getBoundingClientRect()
      const cx = r.left + r.width / 2
      let best: string | null = null
      let bd = Infinity
      el.querySelectorAll<HTMLElement>('[data-spine]').forEach((s) => {
        const sr = s.getBoundingClientRect()
        const d = Math.abs(sr.left + sr.width / 2 - cx)
        if (d < bd) {
          bd = d
          best = s.dataset.spine ?? null
        }
      })
      setActiveId(best)
    }
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(update)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    update()
    setPointerId(null)
    return () => {
      el.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [books])

  const shownId = pointerId ?? activeId

  return (
    <div
      ref={ref}
      className="flex items-end gap-1.5 overflow-x-auto pb-4 pt-4"
      style={{ scrollbarWidth: 'none' }}
      onPointerLeave={() => setPointerId(null)}
    >
      {books.map((b, i) => {
        const shown = b.id === shownId
        // Spines you don't have in hand (wishlist / unset) sit ghosted on the shelf — a TBR shelf is
        // mostly books you don't own yet. A borrowed book is in hand, so it never ghosts. Artwork-only
        // dim (--ghost-opacity); the title stays in the aria-label.
        const unowned = !isPossessed(b)
        return (
          <div key={b.id} className="flex flex-none flex-col items-center self-end">
          <button
            data-spine={b.id}
            draggable={!!onReorder}
            onDragStart={() => setDragIdx(i)}
            onDragOver={(e) => onReorder && e.preventDefault()}
            onDrop={() => {
              if (dragIdx != null) place(dragIdx, i)
              setDragIdx(null)
            }}
            onDragEnd={() => setDragIdx(null)}
            // One rule, every modality: a not-yet-revealed spine's first activation reveals it; the
            // revealed spine opens. Mouse hover reveals before the click ever lands (click opens);
            // touch gets tap-to-reveal then tap-to-open; keyboard reveals on focus, Enter opens.
            onClick={() => (shown ? onOpen(b.id) : setPointerId(b.id))}
            onPointerEnter={(e) => {
              if (e.pointerType === 'mouse') setPointerId(b.id)
            }}
            onFocus={(e) => {
              if (e.target.matches(':focus-visible')) setPointerId(b.id)
            }}
            title={b.title}
            aria-label={shown ? `Open ${b.title}` : `Reveal ${b.title}`}
            className="flex-none snap-center self-end"
            style={dragIdx === i ? { opacity: 0.4 } : undefined}
          >
            {/* the featured volume lifts off the shelf, the skin's accent pointing beneath it —
                the chunk-4 composed screens' shared shelf gesture (all nine skins agree) */}
            <span
              className="relative block transition-transform duration-300 motion-reduce:transition-none"
              style={{
                ...(shown ? { transform: 'translateY(-8px)', filter: 'drop-shadow(0 12px 14px rgba(0, 0, 0, 0.38))', zIndex: 2 } : undefined),
                ...(unowned ? { opacity: 'var(--ghost-opacity)' } : undefined),
              }}
            >
              {shown && b.cover ? (
                // The flip is a marquee surface (~120px, 2–3× DPR) — CoverImage upgrades to the FULL
                // cover, but as an <img> it can fall back to the real original (or the skin placeholder)
                // when the largest scan 404s or returns Google's "no image" plate; a CSS background can't.
                <div className="h-44 w-[120px] overflow-hidden rounded-md border border-line">
                  <CoverImage book={b} />
                </div>
              ) : (
                <Spine book={b} active={shown} tint={b.coverColor} />
              )}
              {shown && (
                <span
                  aria-hidden
                  className="absolute left-1/2 bottom-[-9px]"
                  style={{ width: 7, height: 7, transform: 'translateX(-50%) rotate(45deg)', background: 'var(--accent)', boxShadow: '0 0 8px color-mix(in srgb, var(--accent) 55%, transparent)' }}
                />
              )}
            </span>
          </button>
          {/* The keyboard half of the gesture — drag alone would leave the shelf unarrangeable
              without a pointer. Quiet enough to leave the signature look intact. */}
          {onReorder && (
            <span className="mt-1 flex gap-0.5">
              <button
                type="button"
                onClick={() => place(i, i - 1)}
                disabled={i === 0}
                aria-label={`Move ${b.title} earlier`}
                className="rounded border border-line px-1 text-[11px] leading-none text-muted disabled:opacity-30"
                style={{ background: 'var(--chip)' }}
              >
                ◀
              </button>
              <button
                type="button"
                onClick={() => place(i, i + 1)}
                disabled={i === books.length - 1}
                aria-label={`Move ${b.title} later`}
                className="rounded border border-line px-1 text-[11px] leading-none text-muted disabled:opacity-30"
                style={{ background: 'var(--chip)' }}
              >
                ▶
              </button>
            </span>
          )}
          </div>
        )
      })}
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          aria-label={addLabel}
          title={addLabel}
          className="flex-none self-end"
        >
          <span
            className="flex h-36 w-9 items-center justify-center rounded-md border border-dashed border-line text-[18px]"
            style={{ background: 'var(--chip)', color: 'var(--muted)' }}
          >
            ＋
          </span>
        </button>
      )}
    </div>
  )
}
