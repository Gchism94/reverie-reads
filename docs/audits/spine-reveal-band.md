# Spine reveal band audit — vertical budget, ownership, and what survives

Audited 2026-08-05 on `audit/spine-reveal-band` (off `main` @ `2c15bbf`). Audit only — no
implementation, no choice among the edge-marker options, no guard touched. Measurements from a
temporary Playwright spec (deleted before commit) at 390×844, mobile project, against a
realistic fixture: 60 books spread across read/ownership states (so all four derived shelves
populate) plus 8 twelve-book collections.

Premise taken as decided, not re-argued: the reveal moves out of the spine row into a permanent
per-shelf band above the spines, contents-only updates, viewport-clamped, sliding pick anchor
carried over unchanged.

## 1. Vertical budget — the deciding numbers, and they bite on exactly one surface

Measured today at 390×844 (`/shelves`, default tab — the four derived rails every reader gets):

| quantity                                     | measured                                                                                                  |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| spine row (track) height                     | 216px per rail (`min-h-[204]` + border-box padding; 233px on shelf detail, which adds the reorder arrows) |
| tallest seated spine                         | 184px                                                                                                     |
| rail pitch (row + its header/margins)        | **275px** (row tops at 241, 516, 792, 1066)                                                               |
| first rail's top offset                      | 241px (page header + tabs)                                                                                |
| usable fold                                  | ~772px (844 − the tab bar's 72px reservation)                                                             |
| **rails fully visible above the fold today** | **2** (241–457 and 516–732; the third peeks 52px ignoring the tab bar)                                    |

Band cost per rail = band height **B**, where B = cover height + ~12px padding. The row itself
gives back at most ~16px (the in-row reveal's lift headroom in `min-h-[204]`) — call the give-back
0–16px and take the conservative end. Projected pitch and fold count on `/shelves`:

| cover in band                       | B      | new rail pitch | rails fully visible above the fold |
| ----------------------------------- | ------ | -------------- | ---------------------------------- |
| none (today)                        | —      | 275px          | **2.0**                            |
| 82×120                              | ~132px | ~391–407px     | **1.3**                            |
| 96×144                              | ~156px | ~415–431px     | **1.2**                            |
| 120×176 (current reveal size)       | ~188px | ~447–463px     | **1.1**                            |
| 132×194 ("larger above the finger") | ~206px | ~465–481px     | **1.0**                            |

**Said plainly, as asked: a permanent band on every rail takes `/shelves` from two fully-visible
shelves to one, at every cover size worth having.** The budget driver is not the 30–50px between
size options — it is the per-rail multiplication: `/shelves` is the only surface that stacks
several SpineShelf rails in one screen (four on the derived tab, one per collection on the other
tab), so it pays B × N where every other surface pays B × 1. Shelf detail absorbs a band
trivially (321px header + 233px row + 188px band = 742px of 844, everything still above the
fold). Home pays one B per priority rail (see §7).

This is a reason to reconsider **scope**, not the direction: the same band that is obviously
affordable on shelf detail and Home is the thing that halves `/shelves`. Two shapes that would
preserve the fold there, flagged for the decision rather than chosen: one band per _page section_
shared by the rails under it (contents follow whichever rail was last touched), or the band on
detail/Home only with `/shelves` keeping a row-internal treatment. Both dilute "one per shelf,
permanent" and are exactly the kind of thing the brief said to surface now.

## 2. Band height and cover size

The trade is entirely vertical — horizontally even the 132px cover uses a third of a 390px band.
Anchors for the decision:

- **120×176 (keep current size)**: costs ~188px; the size every reader already knows from the
  in-row reveal; drops `/shelves` to 1.1 rails.
- **96×144**: costs ~156px; title text on a 96px cover at DPR 3 is still legible for most covers
  (the grid's CoverCard renders ~110–120px and is the app's legibility baseline — 96 is below
  it); buys back ~0.1 rail. The saving is real but does not change the §1 conclusion.
- **132×194 (the "appears larger above the finger" idea)**: free horizontally as predicted,
  costs ~18px over current vertically, and is the difference between 1.1 and 1.0 rails on
  `/shelves` — i.e. it is affordable exactly where the band itself is affordable (detail, Home)
  and compounds the problem exactly where the band already bites.

If the §1 scope question resolves to "band everywhere", the numbers argue for 96×144; if it
resolves to "band on single-rail surfaces", 120×176 or larger is free there.

## 3. DOM home and height ownership — the premise holds, with named hazards

Shape that satisfies "contents-only change cannot shift layout": the band is a **sibling above
the scroller inside SpineShelf's root**, `position: relative`, with a **constant fixed height (B)
reserved whether or not anything is picked**, width 100%. The cover is an absolutely-positioned
**fixed-size box** inside it, moved with `transform: translateX(...)` — paint-only, computed from
the picked slot's viewport position (slot offset − scrollLeft, re-derived on the same
rAF-debounced scroll handler the pick already uses) and clamped to `[0, viewportW − coverW]`.
Contents swap = the fixed box's `<img>` (and any caption) changes; nothing outside the band can
observe it.

Hazards that would break the premise, named as required:

- **Band height derived from content** (an unconstrained `<img>` driving height, or any
  `min-height`-only band): the first slow-loading cover reflows every shelf below it. The band's
  height must be a constant, not a consequence.
- **Caption text that wraps**: a title/author line under the cover with natural wrapping changes
  band height per pick. Fixed line count with clamp, or no text.
- **Mount-on-pick** (band rendered only while something is picked): re-introduces the exact mount
  churn the permanent band exists to kill — 15 remounts per fling, each replaying a 300ms entry
  (gesture audit §1). The band mounts with the shelf and never unmounts while books exist.
- **Animating the cover's box size per pick** ("grow on reveal"): stays inside the band's layout
  but re-rasterizes per pick at fling cadence; the flicker economics that motivated
  contents-only apply to paint too. Static box, cross-fade contents if anything.
- The 0-book shelf renders no band (data-driven, changes only when the shelf's data does) — not
  a violation.

One knock-on worth recording: with the reveal out of the row, the row's `min-h-[204]` (reveal
headroom) shrinks toward `tallest spine + padding` ≈ 200px — that is where the ~16px give-back
in §1 comes from, and if the picked-spine marker (§4) keeps the 8px lift, the give-back halves.

## 4. Edge behaviour and the cover-to-spine tie — options, not a choice

Viewport-clamping detaches the cover from its slot at the extremes by up to
`coverW/2 − slot/2` ≈ **37–46px** (measured slot widths 29–46): the terminal picks' covers sit
edge-flush while their spines are up to a cover-half-width away. The sliding anchor makes the
terminal picks _common_ (scrollLeft 0 and max always pick them), so the detached state is the
resting state at both ends — the marker is not an edge case, it is the first and last thing a
reader sees. Options, per the brief, reported without choosing:

1. **A caret that slides independently of the cover** along the band's bottom edge, positioned
   over the slot centre (its own clamp is `[0, viewportW − caretW]`, so it is exact virtually
   everywhere the cover cannot be). The existing accent diamond is this shape, relocated.
2. **A picked-spine treatment in the row** — the existing 8px lift and/or an accent tint on the
   spine itself. Reuses `rv-spine-lift`; costs the 8px headroom noted in §3.
3. **A leader line** from the cover's near corner to the slot centre — explicit at the extremes,
   near-invisible mid-track where cover and spine align.
4. **Caret + spine tint combined** (1 + 2) — redundancy for the two ends where the detachment is
   the resting state.
5. **An offset arrow on the cover's edge** pointing toward its spine when clamped — the cover
   itself communicates "mine is that way".

Interplay carried over, no new work: the anchor's progress clamp already holds terminal picks
stable through iOS rubber-band overscroll, so the marker never has to track an out-of-range pick.

## 5. Degenerate shelves — the band replaces the minimum pitch

- **1 book**: the band permanently shows the sole cover; the row is one spine. No interaction
  ambiguity; the only question is whether tapping either surface opens (an interaction-design
  choice for the implementation, not a geometry problem).
- **2–3 books (and every fits-without-scrolling shelf)**: the burial defect is **structurally
  impossible** — the cover lives in a different band, so no spine's tap target can ever be
  covered by a reveal. Which answers the brief's question directly: **the minimum slot pitch is
  redundant under the band; the band replaces that half of `fix/spine-pick-reachability` rather
  than sitting beside it.** The pitch's only purpose was un-burying sibling tap targets
  (`SPREAD_SLOT_W`'s comment says exactly this); its cosmetic side effect (evenly spaced tiny
  shelves) is a look that can be kept or dropped on its own merits, but nothing load-bearing
  remains. With the pitch gone, `spineMetrics.ts` (natural-width computation), the `spread`
  state, and the resize listener that recomputes it all go with it.

## 6. What survives of the merged work

| piece                                                            | fate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sliding pick anchor** (`update()`'s progress mapping)          | **Survives unchanged** — per the brief, the arithmetic was right; the band consumes the same `activeId`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Mouse-only `onPointerLeave`**                                  | **Survives, load-bearing** — the band renders whatever the pick state says; the tap-open race it fixed is a pick-state race, independent of where the reveal draws.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Pointer/keyboard reveal layer** (`pointerId`, hover/tap/focus) | Survives — same state, new renderer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **The content-edge clamp** (`style.left` ∈ [0, scrollWidth−120]) | **Dead code** — replaced by the band's viewport clamp in band coordinates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Minimum slot pitch + `spineMetrics.ts` + `spread`**            | **Dead** (§5) — the band replaces it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **In-row overlay + `data-spine-reveal` + `rv-spine-lift`**       | The overlay dies; the attribute moves to (or is renamed for) the band's cover; the keyframes die unless repurposed for the §4 spine-lift marker or a band cross-fade.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Invariant guard** (`spine-shelf-invariant.spec.ts`)            | **The invariant survives; most of its assertions do not.** "Track scrollWidth never changes across picks" remains true and worth asserting — trivially so, once nothing renders in the track per-pick. But the clamp-bounds check, the slot-vs-container-centre anchoring check, and every `[data-spine-reveal]`-in-track locator describe machinery the band removes — kept as-is they would fail honestly, rewritten they'd assert the band's geometry instead. Per the brief's own principle (delete a guard rather than keep one asserting something untrue): fold the surviving width-sweep assertion into the reachability suite and **delete the file**, or gut it to the width sweep alone. Both defensible; the one indefensible option is leaving it untouched. |
| **Reachability guard** (`spine-shelf-reachability.spec.ts`)      | **Survives as the load-bearing suite, with retargeting**: the scroll sweep, exact-extremes, and open-path assertions are about pick coverage and remain the point; their reveal-detection locator retargets from the in-row overlay to the band's cover, and the open path follows whatever the band's interaction model is. The **spread-pitch test is deleted** with the pitch. Tap-hittability becomes unfailable by construction (no occluder can exist) — worth keeping anyway as the regression tripwire for any future in-row rendering.                                                                                                                                                                                                                           |

## 7. Other surfaces

| mount                                          | rails                                                                                                                                       | band cost          | verdict                                                                                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/shelves`, derived tab (ShelvesRoute:307)     | **4 stacked**                                                                                                                               | B × 4              | The §1 problem lives here: 2 → 1 rails above the fold.                                                                                                   |
| `/shelves`, collections tab (ShelvesRoute:539) | one per collection                                                                                                                          | B × N              | Same per-rail multiplication; an 8-collection reader pays ~1.2–1.5k px of band.                                                                          |
| Shelf detail (ShelfRoute)                      | 1                                                                                                                                           | B × 1              | Comfortable: header + row + 188px band = 742px of 844, all above the fold.                                                                               |
| Home (HomeRoute:340)                           | one per **priority** rail (0 on the fixture — the mount is conditional on flagged lists; several flagged lists mean several bands mid-page) | B × priority count | Fine at one; a reader with three priority shelves pays ~560px, on a page already 2474px tall. Same multiplication risk as `/shelves`, reader-controlled. |
| Lab structure preview (LabStructureRoute:126)  | —                                                                                                                                           | —                  | Not a SpineShelf mount (its own rail markup); unaffected.                                                                                                |

No mount has a _hard_ vertical constraint the others lack — the difference is purely how many
rails stack per screen, which is §1's scope question wearing four different densities.

## Measured / inferred

- **Measured**: every number in §1's first table (row heights, pitch, offsets, fold counts,
  spine heights, per-surface rail counts and conditionality); slot-width range behind §4's
  detachment bound.
- **Inferred/computed**: the projected pitches and fold counts (arithmetic on measured pitch +
  band heights; the band does not exist to measure); the §3 hazards (implementation reasoning);
  §5–§6 fates (code reading of the merged branches).
- Nothing in this audit needs a device: it is layout arithmetic and code archaeology.

## Addendum — the shared band variant

Measured 2026-08-05, same branch, same fixture and viewport (390×844, 60 books, 8 collections).
Audit only; no placement or rest state chosen.

### A correction to §1 before the arithmetic

§1 assumed the spine row gives back up to ~16px once the reveal leaves it (the `min-h-[204px]`
reveal headroom). **Measurement says the give-back is 0 in practice**: the row measures 216px =
tallest spine 184 + 32px padding, so `min-h-[204px]` is not the binding constraint — content is.
The min-height only binds on a shelf whose tallest spine is under ~172px, which the 150–184px
hash range makes unlikely on any shelf of more than a few books. §1's tables quoted a range whose
upper end assumed zero give-back, so **§1's stated fold counts stand unchanged** (1.3 / 1.2 / 1.1
/ 1.0); it is the pitch that is now known to be the upper figure, not the lower. All arithmetic
below uses give-back 0.

### 1. Vertical arithmetic, shared vs per-rail

Same metric as §1 — rails fully visible = `(fold − first rail top) / pitch`, fold 772px, first
rail top 241px, rail pitch 275px (derived rails), row height 216px. A shared band inserts B once
above the rails and leaves pitch at 275.

**`/shelves`, derived group (4 rails), at the top of the page:**

| cover        | B      | per-rail pitch → rails | **shared** pitch → rails |
| ------------ | ------ | ---------------------- | ------------------------ |
| none (today) | —      | 275 → **2.0**          | 275 → **2.0**            |
| 82×120       | ~132px | 407 → **1.3**          | 275 → **1.5**            |
| 96×144       | ~156px | 431 → **1.2**          | 275 → **1.4**            |
| 120×176      | ~188px | 463 → **1.1**          | 275 → **1.2**            |
| 132×194      | ~206px | 481 → **1.1**          | 275 → **1.2**            |

**Shared improves the top-of-page count but does not restore two rails**, because B is still
subtracted from the same 531px between the page header and the fold. The gain at the current
cover size is 1.1 → 1.2 rails: real, and small.

The comparison changes completely **once the reader scrolls past the page header** — which is
where a 1538–3834px document is read. There the header's 241px is gone and the only question is
what the band costs per screen:

| state                  | today   | per-rail (B=188) | shared, scrolls away | shared, sticky |
| ---------------------- | ------- | ---------------- | -------------------- | -------------- |
| top of page            | 2.0     | 1.1              | 1.2                  | 1.2            |
| scrolled (header gone) | **2.8** | **1.7**          | **2.8**              | **2.1**        |

That table is the actual decision. Per-rail costs B on every screen forever. Shared-and-scrolling
costs nothing once scrolled — and shows nothing (§2). Shared-and-sticky costs B once per screen
rather than once per rail: 2.1 rails against today's 2.8, and against per-rail's 1.7.

**Collections group — where N is unbounded and shared wins most.** Measured: the Collections
disclosure is not a tab switch; expanding it _appends_ its rails to the same document. This
fixture's 8 collections take the page from **4 rails / 1538px** to **12 rails / 3834px**, pitch
~296px for collection rails. Band cost added to that document at B=188:

| variant  | added px              | document    | growth   |
| -------- | --------------------- | ----------- | -------- |
| per-rail | 188 × 12 = **2256px** | 3834 → 6090 | **+59%** |
| shared   | **188px**             | 3834 → 4022 | **+5%**  |

Per-rail's cost scales with the reader's collection count without bound; shared's does not. Rails
per screen in the collections region, scrolled: per-rail 772/484 = **1.6**; shared-scrolling
772/296 = **2.6**; shared-sticky (772−188)/296 = **2.0**.

### 2. Placement

Confirmed viable first: **nothing blocks `position: sticky`.** The full ancestor chain from a rail
to `<html>` is `overflow: visible`, with no `transform`, `filter`, or `contain` anywhere — the
classic sticky-killers are all absent — and the window is the scroll container (`windowScrolls:
true`, `<html>`/`<body>` overflow visible). Also confirmed: **scrolling a rail horizontally does
not scroll the page vertically** (measured `pageMoved: false`), so a pinned band genuinely stays
visible while a rail is being worked. Existing chrome to reconcile with: the bottom nav is
`position: fixed`, 53px painted, `z-40` (the page reserves 72px for it, which is the 772px fold
used throughout).

| option                                      | vertical cost                                | rail below the fold, band not                                                                                                                                     | layout shift                                                                                                                                                                                                                                                                              |
| ------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Pinned above the rails, scrolls away** | B once, top of page only                     | **The feature disappears for every rail below the first** — on a 1538–3834px document that is most of them, and it is precisely the case the band exists to serve | none — pure flow                                                                                                                                                                                                                                                                          |
| **B. Sticky only while a rail is scrolled** | B while active                               | same as C while active                                                                                                                                            | no _layout_ shift (static↔sticky are both in flow), but a **visual jump**: enabling sticky when the page is already scrolled past the band's flow position snaps it from flow position to pinned, and disabling snaps it back. Also needs a scroll-end heuristic running at fling cadence |
| **C. Sticky permanently**                   | B on every screen (2.1 rails vs today's 2.8) | band always present — the stated feature always works                                                                                                             | none — sticky reserves its space in flow; pinning is a paint-position change                                                                                                                                                                                                              |

Three properties of C worth stating precisely, since it is the option the arithmetic favours:

- **It does not change the rails' containing block.** Sticky affects only the sticky element;
  siblings are untouched. It _does_ make the band a positioned element and a stacking context, so
  the band's `z-index` has to be reconciled with `main`'s `z-[1]` and the nav's `z-40` — the band
  must sit above content and below the nav.
- **Sticky is scoped to its parent's box.** A band inside `div.mb-8` (the derived-shelves wrapper,
  measured 1149px) unpins when that wrapper scrolls past — it would stop serving the collections
  rails. Page-wide stickiness requires the band to be a child of `<section>` or higher, which is
  the same structural choice that makes it shared.
- **Accessibility hazard**: a permanently pinned band overlays whatever in-page navigation focuses
  (skip-to-content, keyboard focus scroll). Focusable content needs `scroll-margin-top` equal to
  the band's height, or focus lands underneath it.

**Options not in the brief, added as asked:**

- **D. Sticky to the bottom of the viewport, above the fixed nav.** Same arithmetic as C, and it
  puts the cover where the thumb already is — the "appears larger above the finger" intuition, and
  the physical direction of pulling a book toward you (spines above, cover below). Costs B + 53px
  of permanent bottom chrome and competes with the tab bar and the iOS home indicator.
- **E. One band per section** (derived group, collections group). Bounds N per band, and its sticky
  scope naturally matches the section wrapper that sticky would pin within anyway. Costs B × 2 on
  `/shelves`; degenerates to per-rail on single-rail surfaces exactly as the shared variant does.
- **F. Reuse each rail's existing header row** rather than adding to it — recovers part of B for
  the per-rail variant only; does not apply to shared.

### 3. Rest state

The height must be reserved in **every** option — a band that appears or grows on first pick is
exactly the layout shift the design exists to prevent. So this choice is only about what fills
already-reserved space:

| rest state                                                                                                | perceived emptiness                                                                                             | note                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Empty**                                                                                                 | Worst: B (188px at current size) of blank above the shelves on first paint, before the reader has done anything | Honest, and reads as a hole                                                                                                                                                                               |
| **First rail's first book**                                                                               | None                                                                                                            | Not an invention: the sliding anchor already picks a book at `scrollLeft 0` on every rail, and `activeId` is never null on a non-empty shelf — so this is rail 1's _true current pick_, not a placeholder |
| **Other** (most-recently-opened book; a caption-only prompt with an empty cover box; the shelf's own art) | Between the two                                                                                                 | A **collapsed strip that expands on first touch is disqualified** — it is the layout shift the premise forbids                                                                                            |

### 4. Ownership — last-touched wins

Implementable without mount churn: the band is one permanent element at page level; each
SpineShelf gains an `onPick(railId, bookId)` callback; the band's contents come from
`{railId, bookId}`. Nothing mounts or unmounts — contents swap, which is the whole point.

**The hazard is render churn, not mount churn.** If that state is a page-level `useState`, every
pick change re-renders the page subtree — all 12 rails, at the measured 15 picks per fling. The
state has to be isolated so only the band re-renders (a store the band subscribes to, or rails
memoised against a stable callback). Naming it because "no mount churn" is easy to satisfy while
still shipping 180 re-renders of 12 rails per fling.

**Page load, nothing touched**: ownership is undefined, which is exactly §3's rest state. The
natural default — rail 1 in document order — coincides with "first rail's first book".

**A second-order question the brief did not raise, flagged not chosen**: when the owning rail
scrolls out of view, does the band keep showing its pick (stale relative to what is on screen) or
hand off to the nearest visible rail? Last-touched-wins says keep; "the cover of the spine you have
scrolled to" says hand off. Invisible under placement A, unavoidable under C.

### 5. Effect on the §6 survival table

- **The sliding anchor still runs per-rail, unchanged.** Each rail keeps its own scroller, its own
  `scrollLeft`, its own pick. Shared changes only where the pick is _rendered_.
- **One structural change beyond §6**: §3 placed the band inside SpineShelf's root. Shared moves it
  out — SpineShelf stops rendering the reveal entirely and becomes a spine row plus a pick
  reporter. `data-spine-reveal` leaves the component; its props grow a callback.
- **Reachability guard — survives, with a gap the shared variant introduces.** Every fixture in
  that suite is a single-shelf `/shelf/:id` page, where shared and per-rail are structurally
  indistinguishable, so its assertions retarget exactly as §6 described and keep working. But a
  single-rail page cannot exercise ownership: **no existing assertion would catch the band showing
  the wrong rail's pick.** That is a new assertion class the shared variant requires, on a
  multi-rail `/shelves` fixture — "the band shows the last-touched rail's pick, and only that".
- **Invariant guard**: unchanged from §6's conclusion, and if anything more clearly dead — with the
  reveal outside the component, "track width does not change across picks" becomes true by
  construction rather than by design.
- **Mouse-only `pointerleave`**: still load-bearing, and it acquires the §4 ownership question — a
  hover reveal on rail A while the band shows rail B is the same conflict as scroll ownership.
