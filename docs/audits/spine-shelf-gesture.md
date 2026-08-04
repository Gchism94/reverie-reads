# Spine shelf gesture audit — what still blocks the ends, and what flickers

Audited 2026-08-04 on `audit/spine-shelf-gesture` (off `fix/spine-shelf-overlay` @ `819ff7e`, which
is deliberately unmerged — this audits the world as it now stands). Audit only. Instrumentation ran
against the local authenticated app at the mobile project's 390×844 touch viewport via temporary
Playwright specs (deleted before commit); gestures were CDP `Input.synthesizeScrollGesture` with
`gestureSourceType: 'touch'`, including runs with `preventFling: false`, which produces a real
compositor momentum tail in Chromium. Every number below is from those runs unless marked inferred.

**Taken as established, not re-litigated: track `scrollWidth` is invariant across pick transitions.**
Re-confirmed incidentally throughout — zero width change across 28 remounts of instrumented
gesturing.

## Headline

Three mechanisms, not one:

1. **The flicker is remount cadence** — the reveal overlay unmounts and remounts on every
   slot-boundary crossing, ~every 36px of scroll, each mount replaying the 300ms lift animation and
   creating a fresh full-size `<img>`. Measured, monotonic, no oscillation. (§1)
2. **On `/shelf/:id` the ends are geometrically unreachable at this viewport, and the overlay fix
   was never the mechanism there**: `mx-auto max-w-5xl` on a column-flex item disables flex
   stretch, so the section lays out at its content's width (capped 1024px) instead of the
   viewport's 390 — the shelf's own scroller ends up 883–992px wide inside a 390px screen, its
   scroll range **zero** below ~25 books and ~618px short at 36, with the deficit pushed to
   page-level horizontal panning. Pre-existing on `main`; reproduced there during the overlay
   branch. `/shelves` and Home do not widen. (§3)
3. **On the sound surfaces, the lab cannot reproduce any end-blocker** — programmatic scroll,
   synthetic drags, and true compositor flings all reach the exact theoretical maximum through
   every remount. The remount-aborts-momentum hypothesis is **killed in Chromium** and remains
   open only for iOS WebKit, where §6's device script discriminates it directly. (§4)

## 1. The flicker — measured mechanism

Instrumented trace over three 450px touch drags on `/shelves` (the geometrically sound surface),
MutationObserver on the track, animation and scroll listeners:

- **28 overlay remounts, 14 `rv-spine-lift` animation replays, 49 scroll events** across ~1350px —
  one remount per ~36px of travel, i.e. every slot-boundary crossing. A single fling produced 15.
- **Zero oscillation.** Every transition in the trace is `new-pick` — adjacent picks never trade
  the centre-most claim back and forth; scroll is monotonic and each boundary is crossed once. The
  flicker is not jitter; it is legitimate re-picking at gesture frequency.
- **The pick does not perturb its own input**: all 36 slot `offsetLeft`s are byte-identical before
  and after an overlay mount (the overlay is out of flow, as designed).
- Each remount is a **fresh DOM subtree**: the mount replays the 300ms lift animation from
  `translateY(0)`, and mounts a **new full-size `<img>`** (`CoverImage` without `thumb` — the
  overlay asks for the largest scan). In the lab the image is a stubbed 1×1 so paint is instant;
  on a real device each remounted cover pays request-or-cache plus decode, so mid-gesture the
  reveal is a strobing chain of lift-restarts and part-loaded covers. The animation-replay and
  fresh-img parts are measured; their on-device visual severity is inferred.
- At the track's ends there is a compounding case: successive end picks CLAMP to the same overlay
  `left`, so the overlay remounts **in place** — a pure pulse (replayed lift, no movement) exactly
  where the reader is trying to finish a scroll.

The flicker is therefore new **as a symptom** but not as a mechanism: the pre-fix component swapped
the picked spine in flow at the same cadence. What changed is that the swap is now a remount that
(a) replays an entry animation the old transition-based lift never replayed mid-scroll, and (b)
rebuilds the `<img>` each time. The overlay made the per-pick cost _visible_.

## 2. Does the pick feed back into scroll or geometry? No — enumerated

A pick change causes, in full: the overlay unmount/mount pair; `aria-label` text changes on two
buttons (`Reveal ↔ Open`); a second render via the anchoring `useLayoutEffect`
(`setOverlayPos`). That is everything.

- Grep across `SpineShelf`/`Spine`/`CoverImage`/`StatePill` and the three stylesheet layers: zero
  `focus()`, `scrollIntoView`, `scrollTo`, `scrollLeft =` writes, `will-change`, `contain`,
  `content-visibility`, `scroll-snap`, `scroll-margin`, or `scroll-padding` (the dead `snap-center`
  was removed by the overlay branch; computed `scroll-snap-type: none`, `scroll-padding: auto`
  confirmed live).
- `overflow-anchor` computes to `auto` (anchoring is armed), but **zero backward scrollLeft jumps**
  were observed across all instrumented gestures — no anchoring correction fires.
- Focus never moves: the overlay is a span inside the already-focused-or-not button; no element
  gains focus on mount.

## 3. What blocks the ends NOW — it depends on the surface

**On `/shelves` and Home, nothing measurable.** The track lays out at real viewport width
(clientWidth 358–374 at 390). Programmatic max scroll = `scrollWidth − clientWidth` exactly, both
directions (733/733 and back to 0 on the 36-book fixture; 1103/1103 on the overview). Synthetic
drags and true flings also reach it (§4). Per the brief's own instruction: on these surfaces the
geometry is sound, so **the blocker — if the device still shows one here — is in the gesture
layer**, and only §6 can catch it.

**On `/shelf/:id`, the geometry is broken at the page level, and was before the overlay fix.**
Measured ancestor chain at 390×844:

| books | section width | track clientWidth | track scrollWidth | inner scroll range |
| ----- | ------------- | ----------------- | ----------------- | ------------------ |
| 18    | 915           | 883               | 883               | **0**              |
| 24    | 1024          | 992               | ~1010             | ~18                |
| 36    | 1024          | 992               | 1725              | 733                |

Mechanism: `ShelfRoute`'s `<section className="mx-auto max-w-5xl …">` is a flex item of
`<main className="flex flex-1 flex-col">`. Per the flex spec, **auto cross-axis margins disable
`align-items: stretch`** — and in a column container, `mx-auto`'s margins are the cross axis. The
section therefore sizes to its content's max-content width, capped only by `max-w-5xl` (1024px),
and the shelf's `overflow-x-auto` never engages against the real viewport: the _page_ overflows
horizontally instead (`document.documentElement.clientWidth 390`, body scrollWidth 915–1024;
Chromium's mobile emulation zooms out to fit, `window.innerWidth` 915/1024). At 18 books the
"scroller" has **nothing to scroll** — the entire shelf is laid flat into a page 2.3× the screen,
and reaching the far books is entirely a page-pan/zoom problem. At 36 books the inner scroller
maxes out with ~618px of shelf still beyond it.

This reproduces identically on `main` before the overlay work (verified during
`fix/spine-shelf-overlay` by stashing the fix and re-measuring on the untouched component), and it
is what broke Playwright's coordinate-space clicking during that branch's guard work. It affects
exactly four routes — `ShelfRoute`, `DiscoverRoute`, `MoodRoute`, `TropeRoute` (the only users of
`mx-auto max-w-5xl`) — of which ShelfRoute is the only SpineShelf surface. `/shelves` and Home
have plain `px-4` sections and lay out correctly; that is why the original mobile audit, which
measured on `/shelves`, saw a sound 358px track.

Consequence for the symptom: **if the device test ran on a shelf detail page, the persistent
unreachability is this**, it long predates the overlay fix, and no scroller-level change could
have fixed it. If the device test ran on `/shelves` or Home, this mechanism is not in play there
and §4/§6 carry the question.

## 4. Can a remount abort a fling? Killed in Chromium; open on iOS

Real compositor flings (`preventFling: false`):

- **Real app, `/shelves`**: a 220px drag at 2500px/s flung from x=72 to x=770 — ~3.2× the drag
  distance — through **15 overlay remounts**, with a smooth decaying tail (samples 747→770 over
  the final 200ms). Momentum ran to natural decay; no remount stopped it.
- **Minimal repro** (40 slots, SpineShelf's exact idiom: scroll → rAF → re-pick → remove/insert an
  absolutely-positioned animated overlay): fling with remounts reached the hard max (614/614, 9
  remounts); the identical page with remounts disabled also reached 614. **Identical outcomes.**
  The gesture in the remount variant also began _on_ the overlay element itself, which was then
  removed mid-gesture — touch-target removal did not break the fling either.

So in Chromium the hypothesis is dead: a remount inside the scroll container neither aborts nor
shortens momentum, including when the removed node is the touch target. **This does not clear iOS
WebKit** — its momentum scrolling is a different implementation with a history of halting on DOM
mutation, and no lab here runs it (Playwright's WebKit build has no CDP and no momentum physics
either). §6's steps decide it on the phone.

## 5. What the overlay fix actually achieved — honestly

- **Layout invariance is real and held under instrumentation**: zero track-width change across
  every gesture, drag, and fling in this audit. The guard's claim stands.
- **It was necessary**: the pre-fix component measurably breathed 70–80px mid-gesture (the
  original audit's 866→796→825), and no gesture layer can land reliably on moving geometry.
- **It was not sufficient**, and on the shelf detail page specifically it was likely **aimed past
  the dominant mechanism**: ShelfRoute's widening (§3) made the ends unreachable there regardless
  of anything inside the scroller, before and after the fix. On the sound surfaces, whatever still
  blocks a real finger is invisible to Chromium (§4) and needs §6.
- It introduced the remount-per-pick presentation cost that makes the flicker visible (§1) — the
  per-pick _cadence_ always existed; the entry animation and img rebuild per pick are new.

## 6. On-device instrumentation — exact steps

Requires: iPhone + Mac, Safari → Settings → Advanced → Web Inspector on the phone, then
Mac Safari → Develop → \<phone\> → the page.

**Step 0 — identify the surface.** Note which page the failing gesture is on (`/shelves`, Home, or
`/shelf/…`). This alone splits §3 from §4.

**Step 1 — paste in the Web Inspector console on the failing page:**

```js
;(() => {
  const el = [...document.querySelectorAll('div')].find(
    (d) => getComputedStyle(d).overflowX === 'auto' && d.querySelector('[data-spine]'),
  )
  const log = []
  const t0 = performance.now()
  const rec = (tag) =>
    log.push({
      tag,
      t: Math.round(performance.now() - t0),
      x: Math.round(el.scrollLeft),
      pageX: Math.round(window.scrollX),
    })
  el.addEventListener('scroll', () => rec('scroll'), { passive: true })
  el.addEventListener('touchend', () => rec('TOUCHEND'), { passive: true })
  window.addEventListener('scroll', () => rec('PAGESCROLL'), { passive: true })
  new MutationObserver((ms) => {
    for (const m of ms)
      for (const n of m.addedNodes) if (n.dataset && n.dataset.spineReveal) rec('REMOUNT')
  }).observe(el, { childList: true, subtree: true })
  window.__log = log
  console.log('armed', {
    trackClientWidth: el.clientWidth,
    trackScrollWidth: el.scrollWidth,
    innerScrollRange: el.scrollWidth - el.clientWidth,
    visualViewport: Math.round(window.visualViewport?.width ?? -1),
    layoutViewport: document.documentElement.clientWidth,
  })
})()
```

**Read the `armed` line first — it may already be the answer:**

- `trackClientWidth` far above `visualViewport` (e.g. 883 vs 390) → **§3 is the mechanism on this
  surface**: the shelf is laid out wider than the screen and its own scroller cannot reach what the
  page has clipped. `innerScrollRange: 0` is the extreme form (the scroller has nothing to scroll).
- `trackClientWidth` ≈ `visualViewport` → geometry is sound here; continue.

**Step 2 — one hard fling toward the right end, then `copy(window.__log)` and read:**

- Find the `TOUCHEND` entry. If `scroll` entries **continue** after it, decaying over ~1s, and the
  final `x` ≈ `innerScrollRange` → momentum is alive and reaches the end; the reported symptom
  needs re-observation (and §1's flicker may be _reading_ as unreachability).
- If `scroll` entries **stop within a frame or two of a `REMOUNT`** while `x` is well short of
  `innerScrollRange`, repeatedly → **iOS momentum is being killed by the remount**; §4's Chromium
  acquittal does not transfer, and the mechanism is confirmed on the engine that matters.
- If `PAGESCROLL` entries appear while swiping the shelf → the gesture is going to the page, not
  the scroller — §3's widening in action.

**Step 3 — the zero-code control**, only if Step 2 implicated remounts: on Home, fling the
"Coming soon" rail (a plain scroller, no remounts, same page/engine) end to end. If it reaches its
end while the shelf beside it cannot, the remount mechanism is isolated on-device with no build
needed.

If a definitive A/B is wanted beyond that, the one-line diagnostic patch is to hard-code
`shownId = books[0]?.id` in `SpineShelf` on a throwaway local branch (freezing the pick kills all
remounts); that is a fix-adjacent change this audit did not make and does not authorize.

## Measured / inferred / device-only, explicitly

- **Measured here**: remount cadence and animation-replay counts; no oscillation; no geometry
  perturbation; no anchoring corrections; sound end-geometry on `/shelves`/Home; the ShelfRoute
  widening, its flex mechanism, its book-count table, and its presence on `main`; fling-through-
  remounts on Chromium, app and minimal repro, including touch-target removal.
- **Inferred**: the on-device visual severity of the flicker (animation replay + fresh full-size
  `<img>` decode per pick — mechanism measured, perception inferred); that ShelfRoute widening
  presents on a real iPhone as pan/zoom contention (layout math measured, Safari's presentation
  of it not observed here).
- **Device-only**: whether iOS WebKit momentum survives remounts (§4's Chromium result does not
  transfer); which surface the reported failure lives on; anything about "both ends" symmetry,
  which no lab mechanism above fully explains on the sound surfaces.
