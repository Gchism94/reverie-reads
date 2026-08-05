import { createContext, useContext } from 'react'
import type { Book } from '@reverie/core'

/**
 * The shared reveal band's state, held OUTSIDE React's render graph on purpose.
 *
 * docs/tasks/task-spine-reveal-band.md item 3: a page-level `useState` would re-render every rail
 * on every pick, and a pick changes ~15 times per fling (docs/audits/spine-shelf-gesture.md §1) —
 * on the collections page that is twelve rails × fifteen, the same cadence problem the band exists
 * to escape, relocated. So rails PUBLISH into this store and never subscribe to it; only the band
 * subscribes. A pick therefore re-renders exactly two things: the owning rail (which must, for its
 * own picked-spine lift and its aria-label) and the band. Non-owning rails do not re-render at
 * all — not because they are memoised, but because nothing they read has changed.
 *
 * Two channels, deliberately separate:
 *  · the React channel (`subscribe`/`getSnapshot`, driven by `useSyncExternalStore`) carries WHICH
 *    book — it changes at pick cadence, ~15×/fling.
 *  · the caret channel (`subscribeCaret`) carries WHERE the picked spine is — it changes every
 *    scroll frame, and is applied imperatively to one DOM node's transform. Routing it through
 *    React would re-render the band at frame rate to move a 7px diamond.
 */

/** What the band renders. `hasRails` is separate from `book` so the band can reserve its constant
 *  height from the first commit a rail exists in — before any pick has been computed — which is
 *  what keeps the band's appearance out of the layout-shift budget. */
export interface SpineRevealSnapshot {
  hasRails: boolean
  book: Book | null
  railId: string | null
}

/** The open handler a rail contributes, held as a ref so a route re-creating its callback each
 *  render does not churn registration. */
export type RailOpenRef = { current: (bookId: string) => void }

export interface SpineRevealStore {
  /** Rails register on mount (layout effect) and unregister on unmount. Registration order is
   *  document order, which is what makes "rail one" meaningful for the rest state. */
  registerRail(railId: string, openRef: RailOpenRef): () => void
  /** A rail's current pick. Called by every rail, owner or not — establishing a pick is not a
   *  claim to the band, or page load would hand the band to whichever rail mounted last. */
  setPick(railId: string, book: Book | null): void
  /** Last-touched-wins: a rail claims the band on genuine interaction (scroll, pointer, focus). */
  claim(railId: string): void
  /** Viewport x of the picked spine's centre, or null when the owning rail is off-screen. */
  setCaret(railId: string, x: number | null): void
  /** The owning rail's vertical visibility, from an IntersectionObserver. */
  setRailVisible(railId: string, visible: boolean): void
  subscribe(listener: () => void): () => void
  getSnapshot(): SpineRevealSnapshot
  subscribeCaret(listener: (x: number | null) => void): () => void
  /** Open the currently shown book through the OWNING rail's handler — routes open books
   *  differently (some navigate, some set a route param), so the band must not invent its own. */
  openCurrent(): void
}

const EMPTY: SpineRevealSnapshot = { hasRails: false, book: null, railId: null }

export function createSpineRevealStore(): SpineRevealStore {
  const rails = new Map<
    string,
    { order: number; book: Book | null; visible: boolean; openRef: RailOpenRef }
  >()
  const listeners = new Set<() => void>()
  const caretListeners = new Set<(x: number | null) => void>()
  let seq = 0
  let claimed: string | null = null
  let snapshot: SpineRevealSnapshot = EMPTY
  let caretX: number | null = null

  /** The owner is the last rail to be touched, or — before anything is touched, and after the
   *  toucher unmounts — the first rail in document order. That fallback IS the rest state the task
   *  specifies: rail one's current pick, which the sliding anchor has already computed at
   *  scrollLeft 0, so it is a true value rather than a placeholder. */
  const owner = (): string | null => {
    if (claimed !== null && rails.has(claimed)) return claimed
    let best: string | null = null
    let bestOrder = Infinity
    for (const [id, entry] of rails) {
      if (entry.order < bestOrder) {
        bestOrder = entry.order
        best = id
      }
    }
    return best
  }

  const recompute = (): void => {
    const railId = owner()
    const book = railId ? (rails.get(railId)?.book ?? null) : null
    const hasRails = rails.size > 0
    // Referential stability matters: useSyncExternalStore re-renders whenever the snapshot object
    // changes identity, so a new object per call would re-render the band on every store poke.
    if (snapshot.hasRails === hasRails && snapshot.book === book && snapshot.railId === railId)
      return
    snapshot = { hasRails, book, railId }
    for (const listener of listeners) listener()
  }

  /** The caret asserts "this cover belongs to that spine". When the owning rail is off-screen
   *  there is no spine to point at, so the claim is withdrawn rather than aimed at nothing. */
  const currentCaret = (): number | null => {
    const railId = owner()
    return railId && rails.get(railId)?.visible === false ? null : caretX
  }

  const pushCaret = (): void => {
    const next = currentCaret()
    for (const listener of caretListeners) listener(next)
  }

  return {
    registerRail(railId, openRef) {
      rails.set(railId, { order: seq++, book: null, visible: true, openRef })
      recompute()
      return () => {
        rails.delete(railId)
        if (claimed === railId) claimed = null
        recompute()
        pushCaret()
      }
    },
    setPick(railId, book) {
      const entry = rails.get(railId)
      if (!entry || entry.book === book) return
      entry.book = book
      recompute()
    },
    claim(railId) {
      if (claimed === railId || !rails.has(railId)) return
      claimed = railId
      recompute()
      pushCaret()
    },
    setCaret(railId, x) {
      if (railId !== owner()) return
      caretX = x
      pushCaret()
    },
    setRailVisible(railId, visible) {
      const entry = rails.get(railId)
      if (!entry || entry.visible === visible) return
      entry.visible = visible
      if (railId === owner()) pushCaret()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot: () => snapshot,
    openCurrent() {
      const railId = owner()
      const entry = railId ? rails.get(railId) : null
      if (entry?.book) entry.openRef.current(entry.book.id)
    },
    subscribeCaret(listener) {
      caretListeners.add(listener)
      // Replay the stored position immediately: the band renders null until the first rail
      // registers, so a subscriber that attaches before the caret node exists would otherwise sit
      // dark until the next scroll. The band re-subscribes once it has DOM, and this is what makes
      // the REST state show its caret rather than only post-interaction states.
      listener(currentCaret())
      return () => caretListeners.delete(listener)
    },
  }
}

/** Context + accessor live beside the store rather than in the band's component file, so that file
 *  exports components only (react-refresh/only-export-components). */
export const SpineRevealCtx = createContext<SpineRevealStore | null>(null)

/** Rails call this to publish. Returns null outside a provider, which is how a SpineShelf mounted
 *  somewhere without a band degrades to a plain spine row rather than throwing. */
export function useSpineReveal(): SpineRevealStore | null {
  return useContext(SpineRevealCtx)
}
