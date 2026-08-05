import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { isBorrowedBook, isDnf, isPossessed, stateSuffix, type Book } from '@reverie/core'
import { Spine } from './Spine'
import { CoverImage } from './CoverImage'
import { StatePill } from './StatePill'

/**
 * A horizontal shelf of book spines — each a real per-skin Spine (gilt-bound Tryst · brushed-metal
 * Aphelion), sized book-to-book. The spine nearest the sliding pick anchor magnifies IN THE ROW,
 * dock-style: it scales toward cover size while its neighbours are DISPLACED ASIDE — moved, not
 * covered. docs/research/in-row-expansion.md is the feasibility basis; the two audits it cites are
 * the failure history this mechanism must not repeat:
 *
 *  · NOT the in-flow swap (attempt 1): that mutated scrollWidth mid-gesture, so momentum computed
 *    its destination against a track whose end then moved. Transforms do not reflow — layout boxes
 *    here never change, and the pick arithmetic below deliberately reads offset* geometry (layout
 *    space, transform-independent) so magnification cannot feed back into its own anchor.
 *  · NOT the absolute overlay (attempt 2): a 120px box over a 36px slot buried siblings by
 *    construction. Here neighbours are translated aside and keep their own hit regions and a11y
 *    nodes — hit-testing follows the transformed box (CSS Transforms L1), so the magnified spine
 *    is tappable at its enlarged rectangle and a displaced neighbour is tappable where it moved.
 *  · NOT the naive dock either: in Blink/WebKit a transformed child crossing the scroll
 *    container's END edge extends scrollWidth (CSSWG #9458 — observed behavior; the START edge
 *    trims and contributes nothing). A rightward neighbour push would reintroduce the momentum
 *    bug through a different door. The RESERVED SLACK below is the recipe that avoids it: static
 *    leading/trailing spacers, part of scrollWidth from the first frame, sized above the peak
 *    expansion delta, so every transformed box stays inside the natural content bounds and
 *    scrollWidth is a constant that momentum computes against correctly.
 *
 * The choreography is driven imperatively — per-frame style writes from the scroll handler's rAF,
 * never through React state. React renders only when the PICK changes (aria-labels), ~15×/fling;
 * the transforms move at frame rate without a single re-render.
 */

/** Magnified (cover) size — the same 120×176 every reveal in this app has used. */
const MAG_W = 120
const MAG_H = 176
/** Reserved slack at each end of the track. Must exceed the peak transformed overhang at the end
 *  edge (≈ (MAG_W − minSpine)/2 ≈ 47px plus neighbour falloff spill); the guard instruments
 *  scrollWidth per frame to prove this size holds. Static, rendered from the first frame, and
 *  never mutated — that is the entire momentum contract. */
const SLACK = 96
/** Gaussian falloff width (px, content space). At slot pitch ~44px the immediate neighbour sits
 *  at t≈0.29 and the next at t≈0.007 — only the 1–3 items nearest the anchor deviate
 *  meaningfully, which is the density constraint (~10 spines per screen at rest). */
const SIGMA = 28
/** The picked item's lift, folded into the same transform (translateY · t). */
const LIFT = 8

type SlotNodes = { art: HTMLElement; cover: HTMLElement }

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
  // Pointer/keyboard pick, layered over the scroll-driven pick: shelves too short to scroll never
  // move activeId, so hover / :focus-visible / first-tap must be able to pick a spine too.
  const [pointerId, setPointerId] = useState<string | null>(null)
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  const shownId = pointerId ?? activeId
  const shownIdRef = useRef<string | null>(shownId)
  shownIdRef.current = shownId
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

  const nodesCache = useRef(new WeakMap<HTMLElement, SlotNodes>())
  const nodesFor = (slot: HTMLElement): SlotNodes | null => {
    const cached = nodesCache.current.get(slot)
    if (cached && cached.art.isConnected) return cached
    const art = slot.querySelector<HTMLElement>('[data-mag-art]')
    const cover = slot.querySelector<HTMLElement>('[data-mag-cover]')
    if (!art || !cover) return null
    const nodes = { art, cover }
    nodesCache.current.set(slot, nodes)
    return nodes
  }

  /**
   * THE CHOREOGRAPHY. Everything READS offset* geometry — layout space, which transforms cannot
   * touch — so the wave can never perturb its own inputs. Everything WRITES transforms and
   * opacities — paint space, which layout cannot see — so the wave can never perturb scrollWidth
   * either, provided every transformed box stays inside the slack (the guard's job to prove).
   *
   * Magnification centre: the PICKED slot's centre when the pick is pointer-pinned (tap, hover or
   * focus picked an off-anchor spine), else the sliding anchor itself — the wave tracks the finger
   * during a scroll and the tapped book when tapped.
   *
   * prefers-reduced-motion: the falloff wave is replaced by a binary state — the picked item at
   * full magnification, everything else exactly at rest, values snapping only when the pick
   * changes. No intermediate scale/translate wave ever plays.
   */
  const choreograph = (): void => {
    const el = ref.current
    if (!el) return
    const slots = el.querySelectorAll<HTMLElement>('[data-spine]')
    const n = slots.length
    if (n === 0) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // The wave centres on the PICKED slot's own centre — not on the raw anchor. The anchor
    // CHOOSES the pick (nearest slot), but it can sit up to half a pitch from that slot's centre,
    // and a wave centred there leaves the picked book at ~70-90% magnification with a half-faded
    // cover after every scroll settles. Centring on the pick means the picked book is always
    // fully open (t = 1 exactly, cross-fade complete) and neighbours fall off from IT; during a
    // scroll the wave's centre steps slot-to-slot as the pick hands over, which is the flip-book
    // reveal — each book pops open in turn — rather than a glide where nothing is ever fully open.
    const maxScroll = el.scrollWidth - el.clientWidth
    const progress = maxScroll > 0 ? Math.min(1, Math.max(0, el.scrollLeft / maxScroll)) : 0.5
    let cx = el.scrollLeft + progress * el.clientWidth
    const picked = shownIdRef.current
    if (picked) {
      const pickedSlot = el.querySelector<HTMLElement>(`[data-spine="${CSS.escape(picked)}"]`)
      if (pickedSlot) cx = pickedSlot.offsetLeft + pickedSlot.offsetWidth / 2
    }

    // Pass 1: magnification factor and the width each slot's scale visually adds.
    const t = new Array<number>(n)
    const sx = new Array<number>(n)
    const sy = new Array<number>(n)
    const added = new Array<number>(n)
    let total = 0
    for (let i = 0; i < n; i++) {
      const s = slots[i]!
      const w = s.offsetWidth
      const h = s.offsetHeight
      const centre = s.offsetLeft + w / 2
      const d = centre - cx
      let ti = Math.exp(-(d * d) / (2 * SIGMA * SIGMA))
      if (reduced) ti = s.dataset.spine === shownIdRef.current ? 1 : 0
      t[i] = ti
      sx[i] = 1 + (MAG_W / w - 1) * ti
      sy[i] = 1 + (MAG_H / h - 1) * ti
      added[i] = w * (sx[i]! - 1)
      total += added[i]!
    }

    // Pass 2: displacement — each slot shifts by (width added before it + half its own) minus half
    // the total, so growth splits symmetrically around the wave: left neighbours end near
    // −total/2, right neighbours near +total/2, the wave's centre near 0. The slack absorbs the
    // halves at the ends; nothing is ever pushed past it.
    let cum = 0
    for (let i = 0; i < n; i++) {
      const s = slots[i]!
      const nodes = nodesFor(s)
      const dx = cum + added[i]! / 2 - total / 2
      cum += added[i]!
      if (!nodes) continue
      const ti = t[i]!
      // The transform goes on the BUTTON itself, not an inner wrapper. getBoundingClientRect does
      // not include descendants, so a wrapper-level transform left the button's reported box at
      // its layout position while its visuals moved aside — and everything that aims at the box
      // (a hit-test runner, a keyboard focus ring, scrollIntoView) aimed at a spot the magnified
      // neighbour was now painting over. Transforming the button keeps box, focus ring and
      // visuals in agreement; hit-testing follows the transformed box (CSS Transforms L1).
      s.style.transform = `translate(${dx.toFixed(2)}px, ${(-LIFT * ti).toFixed(2)}px) scale(${sx[i]!.toFixed(4)}, ${sy[i]!.toFixed(4)})`
      s.style.zIndex = String(1 + Math.round(ti * 8))
      // Cross-fade spine → cover across the top half of the magnification, so the distorted
      // mid-transition cover is never prominent.
      const fade = Math.min(1, Math.max(0, ti * 2 - 1))
      nodes.art.style.opacity = String(1 - fade)
      nodes.cover.style.opacity = String(fade)
    }
  }
  const choreographRef = useRef(choreograph)
  choreographRef.current = choreograph

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const update = () => {
      // THE SLIDING ANCHOR (docs/audits/spine-overlay-clamp.md §4/§6), carried over unchanged — a
      // fixed centre anchor can never sit closer than clientWidth/2 to either content edge, so
      // the first/last ~3 books were never scroll-pickable. Progress maps the anchor across the
      // viewport: left edge at scrollLeft 0, right edge at max, clamped for iOS rubber-band
      // overscroll. All distances are OFFSET geometry — transform-independent — so the
      // magnification wave cannot oscillate its own pick.
      const maxScroll = el.scrollWidth - el.clientWidth
      const progress = maxScroll > 0 ? Math.min(1, Math.max(0, el.scrollLeft / maxScroll)) : 0.5
      const cx = el.scrollLeft + progress * el.clientWidth
      let best: string | null = null
      let bd = Infinity
      el.querySelectorAll<HTMLElement>('[data-spine]').forEach((s) => {
        const d = Math.abs(s.offsetLeft + s.offsetWidth / 2 - cx)
        if (d < bd) {
          bd = d
          best = s.dataset.spine ?? null
        }
      })
      setActiveId(best)
      choreographRef.current()
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

  // Pointer picks move the wave's centre without a scroll event; re-choreograph in the same frame
  // the pick's aria flips, so the magnified state and the accessible state agree.
  useLayoutEffect(() => {
    choreographRef.current()
  }, [shownId, books])

  return (
    <div
      ref={ref}
      className="flex items-end gap-1.5 overflow-x-auto pb-4 pt-4"
      style={{ scrollbarWidth: 'none' }}
      // MOUSE-ONLY, matching onPointerEnter's condition below. Touch pointers are transient: the
      // browser fires a full pointerleave chain after EVERY tap-release (measured in Chromium's
      // emulation; iOS documents the same), so an unconditional clear races the tap's trailing
      // click — tap-to-pick survived only because its click re-set pointerId after the leave, and
      // tap-to-OPEN was a coin flip between opening and silently re-picking. A touch pick is
      // dismissed by what touch does next (another tap, or a scroll re-pick), not by the phantom
      // leave of a finger that lifted.
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse') setPointerId(null)
      }}
    >
      {/* RESERVED SLACK, leading. Static from the first frame. The leading spacer is for visual
        completeness (start-edge overhang is trimmed, not counted toward scrollWidth); the
        trailing twin is the momentum contract (end-edge overhang would extend it). Never
        conditional, never resized. */}
      <div aria-hidden className="flex-none self-end" style={{ width: SLACK }} />
      {books.map((b, i) => {
        const shown = b.id === shownId
        // Spines you don't have in hand (wishlist / unset) sit ghosted on the shelf — a TBR shelf
        // is mostly books you don't own yet. A borrowed book is in hand, so it never ghosts.
        // Artwork-only dim (--ghost-opacity); the title stays in the aria-label.
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
              // One rule, every modality: a not-yet-picked spine's first activation picks it; the
              // picked spine opens. Mouse hover picks before the click lands (click opens); touch
              // gets tap-to-pick then tap-to-open; keyboard picks on focus, Enter opens.
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
              className="relative flex-none"
              style={{
                transformOrigin: '50% 100%',
                willChange: 'transform',
                ...(dragIdx === i ? { opacity: 0.4 } : undefined),
              }}
            >
              {/* The magnification target is the BUTTON (see the choreography's comment on why —
                boxes, focus rings and visuals must agree). Its LAYOUT box is the natural spine
                size and never changes; the choreography writes transform/z-index imperatively.
                The cover fills the same box — distorted at rest, where it is invisible
                (opacity 0), and exactly 120×176 at full magnification, where the cross-fade
                completes. */}
              <span
                className="relative block"
                style={unowned ? { opacity: 'var(--ghost-opacity)' } : undefined}
              >
                <span data-mag-art className="block">
                  <Spine
                    book={b}
                    active={false}
                    tint={b.coverColor}
                    dnf={isDnf(b)}
                    borrowed={isBorrowedBook(b)}
                  />
                </span>
                <span
                  data-mag-cover
                  aria-hidden
                  className="pointer-events-none absolute inset-0 overflow-hidden rounded-[3px] border border-line"
                  style={{ opacity: 0 }}
                >
                  <CoverImage book={b} thumb />
                  {isDnf(b) && <StatePill kind="dnf" className="absolute left-1 top-1" />}
                  {isBorrowedBook(b) && (
                    <StatePill kind="borrowed" className="absolute bottom-1 right-1" />
                  )}
                </span>
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
      {/* RESERVED SLACK, trailing — the load-bearing half (see the leading spacer's comment). */}
      <div aria-hidden className="flex-none self-end" style={{ width: SLACK }} />
    </div>
  )
}
