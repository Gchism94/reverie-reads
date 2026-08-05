import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { isBorrowedBook, isDnf, isPossessed, stateSuffix, type Book } from '@reverie/core'
import { Spine } from './Spine'
import { useSpineReveal } from './spineRevealStore'

/**
 * A horizontal shelf of book spines — each a real per-skin Spine (gilt-bound Tryst · brushed-metal
 * Aphelion), sized book-to-book. The spine nearest the sliding pick anchor lifts, and its cover
 * appears in the page's shared reveal band.
 *
 * This component NO LONGER RENDERS THE REVEAL. It is a spine row plus a pick reporter: it computes
 * which book is picked and publishes that to the band's store (SpineRevealBand.tsx). The reveal
 * used to be an in-row overlay, which docs/audits/spine-overlay-clamp.md retired — a 120px cover
 * over a 29-46px slot overhangs its neighbours by construction, and no clamp fixes a cover that is
 * inside the track and still on top of things.
 *
 * Two consequences worth naming, because they deleted code rather than adding it:
 *  · nothing is absolutely positioned in the track any more, so the content-edge clamp is gone;
 *  · a reveal can no longer bury a sibling's tap target, so the minimum slot pitch that guarded
 *    against that (and `spineMetrics.ts`, and the resize listener that drove it) is gone too.
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

  const reveal = useSpineReveal()
  const railId = useId()
  // The route's open handler behind a ref: the band opens through the OWNING rail, and a route
  // re-creating its callback each render must not churn the rail's registration.
  const openRef = useRef(onOpen)
  openRef.current = onOpen

  /** Move the spine at `from` into slot `to`, then hand the whole new order up. */
  const place = (from: number, to: number) => {
    if (
      !onReorder ||
      from === to ||
      to < 0 ||
      to >= books.length ||
      from < 0 ||
      from >= books.length
    )
      return
    const ids = books.map((b) => b.id)
    const [moved] = ids.splice(from, 1)
    ids.splice(to, 0, moved!)
    onReorder(ids)
  }

  // Registration is a LAYOUT effect so the band can reserve its constant height in the same commit
  // the rails first paint in — a band that appeared a frame later would be a layout shift, which is
  // the one thing this design exists to prevent. Registration order is document order, and that is
  // what makes "rail one" meaningful as the band's rest state.
  useLayoutEffect(() => {
    if (!reveal) return
    return reveal.registerRail(railId, openRef)
  }, [reveal, railId])

  const shownId = pointerId ?? activeId
  // The scroll handler is created once per effect run but must always measure the CURRENT pick,
  // which pointer reveals can change without touching scroll.
  const shownIdRef = useRef<string | null>(shownId)
  shownIdRef.current = shownId

  /** Publish where the picked spine is, in viewport coordinates, for the band's caret. */
  const publishCaret = (): void => {
    const el = ref.current
    const id = shownIdRef.current
    if (!reveal || !el || !id) return
    const slot = el.querySelector<HTMLElement>(`[data-spine="${CSS.escape(id)}"]`)
    if (!slot) return
    const r = slot.getBoundingClientRect()
    reveal.setCaret(railId, r.left + r.width / 2)
  }
  const publishCaretRef = useRef(publishCaret)
  publishCaretRef.current = publishCaret

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const update = () => {
      const r = el.getBoundingClientRect()
      // THE SLIDING ANCHOR (docs/audits/spine-overlay-clamp.md §4/§6), carried over unchanged from
      // fix/spine-pick-reachability — that arithmetic was correct; it was the rendering location
      // that was wrong. A fixed centre anchor has a dead zone: it can never sit closer than
      // clientWidth/2 to either content edge, so the first/last ~3 books were never scroll-pickable.
      // Mapping scroll progress across the viewport instead — anchor at the LEFT edge at scrollLeft
      // 0, the RIGHT edge at max, linear between — gives every slot a scroll position that picks it.
      // Progress is clamped for iOS rubber-band overscroll (scrollLeft exceeds [0, max] during the
      // bounce; the terminal pick should hold, not invert). A shelf that cannot scroll keeps the
      // centre anchor — same behavior as before.
      const maxScroll = el.scrollWidth - el.clientWidth
      const progress = maxScroll > 0 ? Math.min(1, Math.max(0, el.scrollLeft / maxScroll)) : 0.5
      const cx = r.left + progress * r.width
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
      publishCaretRef.current()
    }
    const onScroll = () => {
      // Scrolling a rail is the reader touching it — last-touched-wins is decided here.
      reveal?.claim(railId)
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
  }, [books, reveal, railId])

  // Publish the pick itself. Every rail publishes, owner or not: establishing a pick is not a claim
  // on the band, or page load would hand the band to whichever rail mounted last instead of to
  // rail one.
  useEffect(() => {
    if (!reveal) return
    reveal.setPick(railId, books.find((b) => b.id === shownId) ?? null)
  }, [reveal, railId, books, shownId])

  // Keep the caret under the picked spine when the pick changed without a scroll (hover, tap,
  // :focus-visible). Layout effect so the caret lands in the same frame the lift does.
  useLayoutEffect(() => {
    publishCaretRef.current()
  }, [shownId, books])

  // Whether this rail is on screen at all. The band holds its cover when the owning rail scrolls
  // away (see the branch report's argument), but the CARET is withdrawn — it claims "that cover
  // belongs to this spine", and that claim cannot be checked against a spine nobody can see.
  useEffect(() => {
    const el = ref.current
    if (!reveal || !el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      ([entry]) => reveal.setRailVisible(railId, !!entry?.isIntersecting),
      { threshold: 0 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [reveal, railId])

  return (
    <div
      ref={ref}
      data-rail={railId}
      className="flex items-end gap-1.5 overflow-x-auto pb-4 pt-4"
      style={{ scrollbarWidth: 'none' }}
      // MOUSE-ONLY, matching onPointerEnter's condition below. Touch pointers are transient: the
      // browser fires a full pointerleave chain after EVERY tap-release (measured in Chromium's
      // emulation; iOS documents the same), so an unconditional clear races the tap's trailing
      // click — tap-to-reveal survived only because its click re-set pointerId after the leave,
      // and tap-to-OPEN was a coin flip between opening and silently re-revealing, depending on
      // which state flush won. A touch reveal is dismissed by what touch actually does next
      // (another tap, or a scroll re-pick), not by the phantom leave of a finger that lifted.
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse') setPointerId(null)
      }}
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
              data-spine-picked={shown ? '' : undefined}
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
              // Each of these is the reader touching THIS rail, so each claims the band.
              onClick={() => {
                reveal?.claim(railId)
                if (shown) onOpen(b.id)
                else setPointerId(b.id)
              }}
              onPointerEnter={(e) => {
                if (e.pointerType !== 'mouse') return
                reveal?.claim(railId)
                setPointerId(b.id)
              }}
              onFocus={(e) => {
                if (!e.target.matches(':focus-visible')) return
                reveal?.claim(railId)
                setPointerId(b.id)
              }}
              title={b.title}
              // On a spine the ACCESSIBLE NAME is the load-bearing channel for state: a 26px spine
              // cannot carry a text pill, so the edge marker is a find-it-fast affordance and this
              // is the actual information. Same fixed order as everywhere else — DNF, then borrowed.
              aria-label={
                shown ? `Open ${b.title}${stateSuffix(b)}` : `Reveal ${b.title}${stateSuffix(b)}`
              }
              className="flex-none"
              style={dragIdx === i ? { opacity: 0.4 } : undefined}
            >
              {/* The picked spine lifts off the shelf — the in-row half of the cover-to-spine
                association, paired with the band's sliding caret. `translateY` only: it is
                layout-neutral, so the track's width is invariant across picks the way the
                merged invariant required, and now trivially so since nothing else moves. */}
              <span
                className="block transition-transform duration-300 motion-reduce:transition-none"
                style={{
                  ...(shown ? { transform: 'translateY(-8px)' } : undefined),
                  ...(unowned ? { opacity: 'var(--ghost-opacity)' } : undefined),
                }}
              >
                <Spine
                  book={b}
                  active={false}
                  tint={b.coverColor}
                  dnf={isDnf(b)}
                  borrowed={isBorrowedBook(b)}
                />
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
