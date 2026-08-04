import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { isBorrowedBook, isDnf, isPossessed, stateSuffix, type Book } from '@reverie/core'
import { Spine } from './Spine'
import { spineNaturalWidth } from './spineMetrics'
import { CoverImage } from './CoverImage'
import { StatePill } from './StatePill'

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
/** The revealed presentation is always 120px wide — the cover div and the active Spine agree. */
const REVEAL_W = 120
/** The flex gap between slots (`gap-1.5`). Kept in one place because SPREAD_SLOT_W depends on it. */
const SLOT_GAP = 6
/** Slot width on a SPREAD shelf: slot + gap = exactly REVEAL_W, so one book's revealed cover can
 *  never enter a sibling's slot. docs/audits/spine-overlay-clamp.md §3: on a 2-book shelf the
 *  120px reveal buried the sibling's entire slot, and because the overlay is the revealed book's
 *  tap target, the buried book had NO touch path at all. Spreading only happens on shelves whose
 *  natural content already fits without scrolling (see the effect below), so no density is lost —
 *  it spends width that was empty. */
const SPREAD_SLOT_W = REVEAL_W - SLOT_GAP

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
  // Where the reveal overlay sits, in the scroller's CONTENT coordinates (so it scrolls with the
  // track). Measured, not derived: the picked slot's offsets are only known after layout.
  const [overlayPos, setOverlayPos] = useState<{ left: number; bottom: number } | null>(null)

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

  // SPREAD: on a shelf whose natural content fits without scrolling, space the slots out so a
  // revealed cover cannot bury a sibling (audit §3 — the buried book had no touch path). Natural
  // width is COMPUTED from the same hash the spines render from, never measured, so spreading
  // can't feed back into its own condition. The sum deliberately EXCLUDES the add-cap and the
  // reorder arrows: underestimating natural content can only spread a shelf that barely scrolls
  // (harmless — the sliding anchor reaches everything on a scrolling shelf), while overestimating
  // would leave a fits-shelf buried, which is the defect.
  const [spread, setSpread] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const naturalContent =
      books.reduce((w, b) => w + spineNaturalWidth(b.id), 0) + SLOT_GAP * Math.max(0, books.length - 1)
    const update = () => {
      const r = el.getBoundingClientRect()
      // THE SLIDING ANCHOR (docs/audits/spine-overlay-clamp.md §4/§6). A fixed centre anchor has a
      // dead zone: it can never sit closer than clientWidth/2 to either content edge, so the
      // first/last ~3 books were never scroll-pickable on any version of this component. Mapping
      // scroll progress across the viewport instead — anchor at the LEFT edge at scrollLeft 0,
      // the RIGHT edge at max, linear between — gives every slot a scroll position that picks it:
      // the anchor's content-space range becomes [0, scrollWidth], a superset of every slot
      // centre. Progress is clamped for iOS rubber-band overscroll (scrollLeft exceeds [0, max]
      // during the bounce; the terminal pick should hold, not invert). A shelf that cannot scroll
      // (maxScroll 0) keeps the centre anchor — same behavior as before.
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
    }
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(update)
    }
    const recompute = () => {
      setSpread(books.length > 0 && naturalContent <= el.clientWidth)
      update()
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', recompute)
    recompute()
    setPointerId(null)
    return () => {
      el.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', recompute)
      cancelAnimationFrame(raf)
    }
    // `spread` is a dep so the pick re-runs against post-spread geometry (spreading changes slot
    // offsets and may introduce scroll range). It converges: spread depends only on books+viewport.
  }, [books, spread])

  const shownId = pointerId ?? activeId

  // Anchor the reveal overlay to the PICKED SLOT, measured — not to the scroll container's centre.
  // The centre-anchor shortcut does not hold: the pick is only centre-most when it is scroll-driven;
  // pointerId reveals (mouse hover, first tap, :focus-visible) pick arbitrary slots, and on a shelf
  // too short to scroll activeId never moves at all, so every reveal there is off-centre. Layout
  // effect, not effect: the overlay must land the same frame the pick paints, or it visibly jumps.
  //
  // The clamp is the shelf-edge rule: a 120px reveal centred on an end spine would overhang the
  // track's content edges — past the left edge it gets clipped (leftward overflow is unreachable in
  // a scroller), and past the right edge it would GROW scrollWidth (abspos descendants extend the
  // scrollable overflow region), re-creating the exact mid-gesture track mutation this overlay
  // exists to end. Clamped, the pulled book stops at the shelf's end like a physical one.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !shownId) {
      setOverlayPos(null)
      return
    }
    const slot = el.querySelector<HTMLElement>(`[data-spine="${CSS.escape(shownId)}"]`)
    if (!slot) {
      setOverlayPos(null)
      return
    }
    const centred = slot.offsetLeft + slot.offsetWidth / 2 - REVEAL_W / 2
    const left = Math.round(Math.min(Math.max(centred, 0), el.scrollWidth - REVEAL_W))
    // No border on the scroller, so offsetTop coordinates and CSS `bottom` share an origin.
    const bottom = el.clientHeight - (slot.offsetTop + slot.offsetHeight)
    setOverlayPos({ left, bottom })
  }, [shownId, books])

  return (
    // `relative` makes the scroller the reveal overlay's containing block (content coordinates,
    // scrolls with the track); `isolate` opens a stacking context so the overlay's z-index can
    // never escape the shelf and paint over the nav or a dialog. The min-height reserves the
    // revealed cover's headroom (16px shelf base + 176px cover + 8px lift + 4px slack) as a
    // CONSTANT — the overlay is out of flow, so nothing may size the container per-pick.
    <div
      ref={ref}
      className="relative isolate flex min-h-[204px] items-end gap-1.5 overflow-x-auto pb-4 pt-4"
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
          <div
            key={b.id}
            className="flex flex-none flex-col items-center self-end"
            style={spread ? { minWidth: SPREAD_SLOT_W } : undefined}
          >
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
              // On a spine the ACCESSIBLE NAME is the load-bearing channel for state: a 26px spine
              // cannot carry a text pill, so the edge marker is a find-it-fast affordance and this
              // is the actual information. Same fixed order as everywhere else — DNF, then borrowed.
              aria-label={
                shown ? `Open ${b.title}${stateSuffix(b)}` : `Reveal ${b.title}${stateSuffix(b)}`
              }
              // No `self-end` here: inside the slot's flex-COLUMN that is the horizontal axis, and
              // it right-aligned the spine within a SPREAD slot (harmless before spreading, when
              // slot width == button width) — pushing the reveal's anchor into the sibling's slot.
              // The slot's own items-center centres the spine; the slot div carries the vertical
              // self-end against the track.
              className="flex-none"
              style={dragIdx === i ? { opacity: 0.4 } : undefined}
            >
              {/* The seated spine ALWAYS renders here, at its natural width, holding its slot —
                the reveal never touches layout, so the track's width is invariant across picks.
                (Pre-overlay, the pick swapped this for a 120px cover — or widened the spine
                itself via `active` — in flow, mutating the track 70-80px mid-gesture; that is
                the both-ends-unreachable defect of docs/audits/mobile-shelf-interaction.md.) */}
              <span
                className="block"
                style={unowned ? { opacity: 'var(--ghost-opacity)' } : undefined}
              >
                <Spine
                  book={b}
                  active={false}
                  tint={b.coverColor}
                  dnf={isDnf(b)}
                  borrowed={isBorrowedBook(b)}
                />
              </span>
              {/* The reveal — the featured volume pulled forward off the shelf, the skin's accent
                pointing beneath it (the chunk-4 composed screens' shared shelf gesture). An
                OVERLAY, out of layout flow: absolutely positioned in the scroller's content
                coordinates (the nearest positioned ancestor — slot and button are static), so it
                paints over its neighbours the way a pulled book fronts them, and scrolls with the
                track. Occlusion is visual only: neighbours keep their slots and stay reachable by
                scroll. It lives INSIDE this button, so the revealed cover — wherever it paints,
                including the parts overhanging neighbour spines — is the tap target, and a tap on
                it opens THIS book (shown → onClick opens). */}
              {shown && overlayPos && (
                <span
                  data-spine-reveal={b.id}
                  className="rv-spine-lift absolute z-[2] block motion-reduce:animate-none"
                  style={{
                    left: overlayPos.left,
                    bottom: overlayPos.bottom,
                    transform: 'translateY(-8px)',
                    filter: 'drop-shadow(0 12px 14px rgba(0, 0, 0, 0.38))',
                    ...(unowned ? { opacity: 'var(--ghost-opacity)' } : undefined),
                  }}
                >
                  {b.cover ? (
                    // The reveal is a marquee surface (~120px, 2–3× DPR) — CoverImage upgrades to
                    // the FULL cover, but as an <img> it can fall back to the real original (or the
                    // skin placeholder) when the largest scan 404s or returns Google's "no image"
                    // plate; a CSS background can't. The revealed cover is 120px — CoverCard scale —
                    // so it carries the real pill rather than the edge marker. Without this the
                    // featured spine, the most prominent book on the shelf, would be the one book
                    // showing no state at all.
                    <div className="relative h-44 w-[120px] overflow-hidden rounded-md border border-line">
                      <CoverImage book={b} />
                      {isDnf(b) && <StatePill kind="dnf" className="absolute left-1 top-1" />}
                      {isBorrowedBook(b) && (
                        <StatePill kind="borrowed" className="absolute bottom-1 right-1" />
                      )}
                    </div>
                  ) : (
                    // A coverless pick still reveals — the widened active spine, exactly as before,
                    // just out of flow now.
                    <Spine
                      book={b}
                      active
                      tint={b.coverColor}
                      dnf={isDnf(b)}
                      borrowed={isBorrowedBook(b)}
                    />
                  )}
                  <span
                    aria-hidden
                    className="absolute left-1/2 bottom-[-9px]"
                    style={{
                      width: 7,
                      height: 7,
                      transform: 'translateX(-50%) rotate(45deg)',
                      background: 'var(--accent)',
                      boxShadow: '0 0 8px color-mix(in srgb, var(--accent) 55%, transparent)',
                    }}
                  />
                </span>
              )}
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
