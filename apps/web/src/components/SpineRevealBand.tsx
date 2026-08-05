import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react'
import { isBorrowedBook, isDnf, isPossessed, stateSuffix } from '@reverie/core'
import { CoverImage } from './CoverImage'
import { StatePill } from './StatePill'
import { createSpineRevealStore, SpineRevealCtx, type SpineRevealStore } from './spineRevealStore'

/**
 * The shared reveal band — one per page, pinned to the bottom of the viewport directly above the
 * nav, showing the picked book's cover for whichever rail the reader last touched.
 *
 * It replaces the in-row overlay that `fix/spine-shelf-overlay` shipped. That overlay was 120px
 * wide over a 29-46px slot, so it covered its neighbours BY CONSTRUCTION and clipped at both ends
 * (docs/audits/spine-overlay-clamp.md). No clamp fixes a cover that is inside the track and still
 * on top of things; the cover had to leave the row. Lifting it out also makes sibling burial
 * structurally impossible, which is why the minimum slot pitch that guarded against it is gone
 * rather than kept beside this.
 *
 * Three properties this file exists to hold:
 *  · CONSTANT HEIGHT. `BAND_H` is a fixed number and the cover box is a fixed size. Only contents
 *    change. No content-derived height, no wrapping caption, no mount-on-pick, no per-pick box
 *    animation — the four named ways to reintroduce the layout shift this design exists to end.
 *  · CONTAINMENT, not z-index tuning. The band lives inside `<main class="relative z-[1]">`, whose
 *    stacking context the nav (`fixed z-40`, a root sibling) and dialogs (portaled to <body>) both
 *    sit outside. So the band cannot paint over the nav or escape to cover a dialog whatever its
 *    own z-index is; `z-[2]` only lifts it above the rails inside main.
 *  · STICKY SCOPE. Sticky is bounded by the parent's box, so the band is rendered as the LAST flow
 *    child of the route's <section> — the one box that spans every rail on the page. A band nested
 *    inside a rail group would unpin the moment that group scrolled past, and stop serving the
 *    rails below it.
 */

/** Cover size, chosen from the addendum's measured table. 120×176 is what the in-row reveal
 *  already used and matches CoverCard's ~110-120px, which is the app's legibility baseline; the
 *  smaller options buy back under a tenth of a rail. Vertical cost against the SCROLLED-state
 *  numbers (the ones that matter — a 1538-3834px document is not read from the top): band 196px
 *  against a 772px fold and a 275px rail pitch gives (772-196)/275 = 2.1 rails per screen, against
 *  today's 2.8 and against per-rail rendering's 1.7. */
const COVER_W = 120
const COVER_H = 176
const BAND_PAD_Y = 10
const BAND_H = COVER_H + BAND_PAD_Y * 2

/**
 * Wrap a route's shelf content. Renders `children`, then the band as their last flow sibling.
 * A Fragment-level provider on purpose: it introduces no DOM box of its own, so the band lands as
 * a direct child of the route's <section> and inherits exactly that sticky scope.
 */
export function SpineRevealProvider({ children }: { children: ReactNode }) {
  const store = useRef<SpineRevealStore | null>(null)
  if (!store.current) store.current = createSpineRevealStore()
  return (
    <SpineRevealCtx.Provider value={store.current}>
      {children}
      <SpineRevealBand store={store.current} />
    </SpineRevealCtx.Provider>
  )
}

function SpineRevealBand({ store }: { store: SpineRevealStore }) {
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const bandRef = useRef<HTMLDivElement>(null)
  const caretRef = useRef<HTMLSpanElement>(null)

  // The caret moves every scroll frame; the book changes ~15 times a fling. Routing the caret
  // through React would re-render the band at frame rate to move a 7px diamond, so it is applied
  // straight to the node's transform and never touches state.
  useEffect(
    () =>
      store.subscribeCaret((x) => {
        const caret = caretRef.current
        const band = bandRef.current
        if (!caret || !band) return
        if (x == null) {
          caret.style.opacity = '0'
          return
        }
        const rect = band.getBoundingClientRect()
        const local = Math.min(Math.max(x - rect.left, 0), rect.width)
        caret.style.opacity = '1'
        caret.style.transform = `translateX(${Math.round(local)}px) translateX(-50%) rotate(45deg)`
      }),
    // `snap.hasRails` is a dependency because the band renders null before any rail registers:
    // the caret node does not exist yet, so the subscription must be re-established once it does.
    [store, snap.hasRails],
  )

  // No rails on this page yet — no band, and no height. This is data-driven (it changes when the
  // page's shelves change), never interaction-driven, so it is not the forbidden collapse-on-rest.
  if (!snap.hasRails) return null
  const book = snap.book

  return (
    <div
      ref={bandRef}
      data-spine-reveal-band
      data-band-owner={snap.railId ?? undefined}
      className="sticky z-[2] -mx-4 mt-2 sm:-mx-6"
      style={{
        height: BAND_H,
        bottom: 'calc(72px + env(safe-area-inset-bottom))',
        background: 'var(--card-solid)',
        borderTop: '1px solid var(--line)',
      }}
    >
      {/* the accent caret — the cover's claim on a particular spine. It slides with the anchor and
        withdraws (opacity 0) when the owning rail scrolls out of view, because a claim about a
        spine nobody can see is a claim that cannot be checked. */}
      <span
        ref={caretRef}
        aria-hidden
        className="absolute left-0 top-0"
        style={{
          width: 8,
          height: 8,
          marginTop: -4,
          opacity: 0,
          background: 'var(--accent)',
          boxShadow: '0 0 8px color-mix(in srgb, var(--accent) 55%, transparent)',
          transition: 'opacity 160ms ease',
        }}
      />
      <div className="flex h-full items-center justify-center">
        {book && (
          <button
            type="button"
            data-spine-reveal={book.id}
            onClick={() => store.openCurrent()}
            aria-label={`Open ${book.title}${stateSuffix(book)}`}
            title={book.title}
            className="relative block overflow-hidden rounded-md border border-line"
            style={{
              width: COVER_W,
              height: COVER_H,
              filter: 'drop-shadow(0 10px 14px rgba(0, 0, 0, 0.34))',
              ...(isPossessed(book) ? undefined : { opacity: 'var(--ghost-opacity)' }),
            }}
          >
            <CoverImage book={book} />
            {isDnf(book) && <StatePill kind="dnf" className="absolute left-1 top-1" />}
            {isBorrowedBook(book) && (
              <StatePill kind="borrowed" className="absolute bottom-1 right-1" />
            )}
          </button>
        )}
      </div>
    </div>
  )
}
