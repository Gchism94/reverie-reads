# Mobile shelf interaction audit

Audited 2026-08-04 on `audit/mobile-shelf-interaction` (from `main` @ `aadb71b`). Audit only — no
fixes. Reproduction ran against the local authenticated app at a 390×844 touch viewport
(`hasTouch`, `isMobile`), 18 seeded spines on `/shelves`, via a temporary Playwright measurement
spec (deleted after the run; its full traces are quoted below).

## 1. Defect A — root cause, named and measured

**Every hypothesized shape in the brief is ruled out with computed values**, taken from the live
scroller at rest:

| Hypothesis                                 | Measured                                                                                                                                        | Verdict                               |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Track wider than scrollable extent         | `scrollWidth 866, clientWidth 358, max 508` — extent consistent                                                                                 | not it                                |
| Container padding unaccounted              | `padding: 16px 0px` — vertical only                                                                                                             | not it                                |
| Scroll-snap preventing final snap          | container `scroll-snap-type: none`; child `scroll-snap-align: none` computed                                                                    | not it — and see the dead class below |
| Transform changing paint not layout        | the reveal transform is `translateY(-8px)` ([SpineShelf.tsx:143](../../apps/web/src/components/SpineShelf.tsx#L143)) — vertical, layout-neutral | not it                                |
| (also checked) `justify-content` centering | `normal`                                                                                                                                        | not it                                |

**The mechanism that is present: the track mutates its own width during every scroll gesture.**
`SpineShelf` re-picks the centre-most spine on every scroll event
([SpineShelf.tsx:56-80](../../apps/web/src/components/SpineShelf.tsx#L56): `update()` on `scroll`
via rAF → `setActiveId`), and the picked spine **flips from a ~26-46px spine to a 120px cover**
([:157](../../apps/web/src/components/SpineShelf.tsx#L157), `h-44 w-[120px]`). Measured across one
rightward pass, the track breathed **866 → 796 → 825 → 865 px** — a ±70-80px mutation, mid-gesture,
at the viewport centre. 70-80px ≈ **2-3 spine widths, which is exactly the reported symptom size**
("the last 2-3 at BOTH ends").

On a real device the sequence is: a momentum fling computes its destination against the track _as
it was at gesture start_; the scroll-driven flip then adds ~74px ahead of (or removes it behind)
that destination while the animation runs, so the fling lands short and the far end has moved; the
next nudge re-triggers a re-flip that moves the goal again. **Both ends fail for the same reason**
— the mutation happens wherever the viewport centre is, so approaching either extreme regenerates
it. Honest limit: headless Playwright cannot run real momentum physics — synthetic touch events do
not scroll, and programmatic `scrollLeft` assignment (which re-clamps every frame) _does_ reach
both ends after repeated steps, which is itself evidence that the geometry at rest is sound and
the defect lives in the gesture/animation interaction with the width mutation. A 30-second
hand-check on device confirms it: fling to an end, watch the last spines shift away as the
centre-flip lands, then observe that arrival is only possible by repeated small drags (or not at
all under iOS's clamped momentum).

Two adjacent facts found on the way:

- **`snap-center` on the spine buttons ([:132](../../apps/web/src/components/SpineShelf.tsx#L132))
  is dead code** — no ancestor sets `scroll-snap-type`, so it computes to `none` and has never
  done anything. Whoever fixes A should delete or activate it deliberately, not inherit it.
- **The scrollbar is hidden** (`scrollbarWidth: 'none'`, [:94](../../apps/web/src/components/SpineShelf.tsx#L94)),
  so on mobile there is no visual indication that the end has not been reached — the defect is
  also invisible while it happens.

## 2. Blast radius — A is confined to SpineShelf; the app has five scrollers, two idioms

| Scroller                      | Where                                                                                                                                                                                                                             | Width-mutating?           |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| **SpineShelf** (the defect)   | mounted 4×: [ShelvesRoute:307](../../apps/web/src/routes/ShelvesRoute.tsx#L307), ShelvesRoute:539, [ShelfRoute:223](../../apps/web/src/routes/ShelfRoute.tsx#L223), [HomeRoute:340](../../apps/web/src/routes/HomeRoute.tsx#L340) | **yes** — the flip        |
| Home "Coming soon" rail       | [HomeRoute:360](../../apps/web/src/routes/HomeRoute.tsx#L360) — plain `overflow-x-auto`, fixed `w-24` children                                                                                                                    | no                        |
| Add-route "Pick a cover" rail | [AddRoute:415](../../apps/web/src/routes/AddRoute.tsx#L415)                                                                                                                                                                       | no                        |
| Lab structure preview         | LabStructureRoute:126 (lab only)                                                                                                                                                                                                  | shares SpineShelf's idiom |
| — Discover rail               | **not a scroller** — a responsive grid (`grid-cols-2 sm:3 lg:4`, DiscoverRoute:205)                                                                                                                                               | n/a                       |
| — SeriesStrip                 | **not a scroller** — a fixed prev/current/next trio                                                                                                                                                                               | n/a                       |

So: **one component owns the defect, and it is mounted on every shelf surface** (shelves overview,
shelf detail, Home's shelf). The fix is one place. The two plain rails share only the
`overflow-x-auto` + `scrollbarWidth:none` idiom and are geometrically sound — but each rolled its
own markup; there is no shared Rail component.

## 3. Defect B — what the desktop "hover" actually is (inventory, no proposal)

There is **no cover hover-highlight on desktop in the grid**. What exists:

- **Library grid (CoverCard)**: the highlight is _selection_, not hover — a click on desktop sets
  `selectedId` ([LibraryRoute:161-164](../../apps/web/src/routes/LibraryRoute.tsx#L161):
  `isDesktop ? setSelectedId(id) : navigate(...)`), and the selected card wears
  `boxShadow: '0 0 0 2.5px var(--primary), var(--shadow)'`
  ([CoverCard.tsx:64-66](../../apps/web/src/components/CoverCard.tsx#L64)) — **tokenized**
  (`--primary`, `--shadow`), with `transition-shadow` and `aria-current`. On mobile the same tap
  _navigates_, so the selection treatment is unreachable — this is the truthful form of "no touch
  equivalent": the desktop affordance is click-selection that mobile spends on navigation.
- The only true `group-hover` on a cover is the **fave toggle's reveal**
  ([CoverCard.tsx:116](../../apps/web/src/components/CoverCard.tsx#L116): `opacity-0
group-hover:opacity-100 focus-visible:opacity-100 aria-pressed:opacity-100`) — on touch, an
  unfaved book's toggle is invisible and unreachable except via `aria-pressed` once faved.
- **SpineShelf already has a full touch answer**, and it is the _same mechanism as defect A_: the
  centre-most spine flips open (scroll-position-based emphasis), plus tap-to-reveal-then-tap-to-open,
  hover reveal for mice, and `:focus-visible` reveal for keyboards
  ([SpineShelf.tsx:117-124](../../apps/web/src/components/SpineShelf.tsx#L117) — the "one rule,
  every modality" comment). The flip treatment (`translateY(-8px)` + drop shadow + accent pointer)
  is the chunk-4 composed-screens shelf gesture, shared across all nine skins.

So the design decision for B is real and open: the shelf already votes for
"centred item reads as active" — and that exact mechanism is what breaks scrolling (defect A).
Choosing it for the grid means first making it not mutate layout; choosing touch-and-hold means a
second pattern beside it. That trade-off is the owner's call, per the brief; not proposed here.

## 4. Existing touch affordances — what's reusable

- **`@dnd-kit` in SeriesArranger only** ([SeriesArranger.tsx:187-189](../../apps/web/src/series/SeriesArranger.tsx#L187)):
  `PointerSensor` with `activationConstraint: { distance: 4 }` — pointer events cover touch, so
  drag works on mobile there; 4px of movement disambiguates drag from tap (no delay/long-press
  constraint — **no long-press pattern exists anywhere in the app**; zero `onContextMenu`, zero
  hold timers). `KeyboardSensor` wired beside it. This is the app's one modern touch-drag pattern
  and the natural thing to extend.
- **SpineShelf's reorder uses native HTML5 `draggable`**
  ([SpineShelf.tsx:106-114](../../apps/web/src/components/SpineShelf.tsx#L106)) — which **does not
  fire on touch at all** (no dragstart from touch without a shim). Shelf reordering on mobile
  currently works only through the ◀▶ keyboard/tap fallbacks. Adjacent finding, same surface.
- **`active:` (touch-press) states: one file in the whole app** (SkinGalleryRoute, 2 uses). No
  cover surface has any pressed-state feedback.
- SpineShelf's tap-to-reveal-then-open is the only two-stage touch affordance and already carries
  the accessibility story (aria-label switches between "Reveal…" and "Open…").

## 5. Test coverage — A is invisible to everything that runs

- **No e2e runs in a mobile viewport.** Both Playwright projects use `devices['Desktop Chrome']`
  ([playwright.config.ts:65-66](../../apps/web/playwright.config.ts#L65)); no spec overrides
  viewport, `isMobile`, or `hasTouch` (grep: zero hits outside the deleted measurement spec).
- The shelf specs that touch `[data-spine]` (`shelf-regressions.spec.ts:371,459-460`,
  `shelf-views.spec.ts:156`) assert presence/first-item behavior — exactly the shape the brief
  predicted would miss an end-of-scroller defect. Nothing anywhere asserts that the **last** item
  of any scroller can be reached, and nothing could: the defect needs momentum physics plus the
  mid-gesture re-render, which also means a future regression test needs care to be a real test
  rather than a scrollLeft assignment that passes vacuously (this audit's own first measurement
  pass proved scrollLeft assignment reaches the ends fine).
