# In-Row Focused-Item Expansion in a Horizontal Touch Scroller: Feasibility and Implementation for SpineShelf

## TL;DR

- **Yes, in-row expansion (Option A) is genuinely feasible** — but _not_ via the naive "displace neighbors rightward" dock pattern, which reintroduces your momentum bug: in Chrome (Blink) and Safari (WebKit), a transformed child that crosses the scroll container's **right/end edge does increase `scrollWidth`**. It only stays invariant if transformed bounds are kept inside a **statically reserved padding/slack** or the growth is confined to the vertical axis.
- **Two winning mechanisms:** (1) keep your native `overflow-x:auto` scroller and drive per-item `transform` choreography (scale + _inward/slack-absorbed_ neighbor displacement) with reserved leading/trailing `scroll-padding`, so `scrollWidth` is a static maximum that momentum computes against correctly; or (2) hand momentum to a **translate-based, physics-owning library (Embla Carousel, MIT)** whose scroll-progress tween recomputes the target continuously against its own fixed-slot model, so "momentum vs. stale layout" cannot occur by construction.
- **Occlusion is solved by displacement, not overlay:** unlike your failed absolute-overlay attempt, neighbors slide _aside_ (each keeps its own hit region and a11y node), and hit-testing follows the transformed visual box, so the magnified spine is tappable and buried siblings no longer exist.

## Key Findings

**1. The crux CSS rule (this is what killed the naive dock idea).** The CSS Working Group resolved (telecon of April 19–20, 2017) that "Overflow bounds that are computed at the end of layout can increase (but not decrease) by paint-level effects such as transforms." [w3](https://lists.w3.org/Archives/Public/public-css-archive/2017Apr/0619.html) Chrome and Safari compute a scroll container's scrollable overflow using each child's **transformed position only** (Firefox unions untransformed + transformed). Consequence: if you magnify the anchored spine and push its right-hand neighbors _outward toward the track's end_, the transformed right edge extends `scrollWidth` — exactly the "layout width mutates mid-gesture" class of failure from your first attempt, just relocated from reflow to overflow computation. This behavior is asymmetric: content pushed past the **start (left) edge is trimmed and contributes nothing**, while content past the **end (right) edge does contribute**. (This is the CSSWG's own observed-interop finding in still-open issue #9458, opened by David Baron in Oct 2023; the specs remain contradictory, so treat it as current observed behavior.)

**2. The invariance recipe.** Keep `scrollWidth` a static maximum by never letting the peak-expanded transformed bounds exceed the natural content width. Concretely: reserve static inline padding/`scroll-padding` sized to the maximum expansion delta (≈120−36 ≈ 84px, or half that per side if displacement is symmetric); displace left-neighbors leftward (free — trimmed at the start edge) and right-neighbors into the reserved trailing slack. Because that padding is part of `scrollWidth` and is **known up front and never mutated during the gesture**, a momentum fling computes its destination against the correct, final track length. This directly answers your Area-4c hypothesis: yes, static inline/`scroll-padding` cleanly gives the end item's expanded form room without breaking momentum.

**3. Hit-testing follows the transformed box (this fixes your Attempt-2 failure).** Per CSS Transforms Level 1, pointer events and hit-testing are performed against the element's transformed shape, so the magnified spine is tappable at its visual (enlarged) rectangle. Critically, in the transform-choreography model neighbors are **moved aside, not covered**, so every book retains its own hit target and its own DOM/accessibility node — eliminating the "buried sibling has no touch path" problem that made the overlay approach fatal, including on 1–3-book shelves.

**4. Library-owned physics dissolves the problem entirely.** Embla Carousel applies transforms via inline styles animated by a spring-based `requestAnimationFrame` system and computes snap/target positions from its **own fixed-slot layout model**, not the DOM scroll track. Its official "Scale" example scales an _inner_ node per slide by distance from center (it explicitly warns against transforming the slide/container box itself). Because the engine recomputes the momentum target continuously against invariant slot widths, the "destination computed against stale layout" bug cannot recur. This is the single most robust way to get in-row magnification with correct momentum.

**5. CSS scroll-driven animations are now a real option for a 2026 mobile PWA.** `animation-timeline: scroll()/view()` shipped in Chrome/Edge 115+ (July 2023) and **Safari 26 (Sept 2025)**, with threaded (compositor) scroll animations added in Safari 26.4 and progress-accuracy/`animation-play-state` bug fixes in Safari 26.5 (June 2026); Firefox still sits behind the `layout.css.scroll-driven-animations.enabled` flag in stable as of Firefox 152 (June 2026), though it's on by default in Nightly and is a named Interop 2026 priority. Global support is 82.58% per caniuse (mid-2026) — close to but not yet Baseline, precisely because Firefox stable hasn't flipped the switch. For a mobile web target (iOS Safari + Android Chrome) this is viable as a progressive enhancement: each spine gets a per-item timeline that peaks its scale at the anchor, transform-only keyframes keep layout invariant, and it runs zero-JS-per-frame on the compositor. Same end-edge `scrollWidth` caveat applies; mitigate with reserved padding + `transform-origin`.

## Details

### Why Option A failed before, and what actually changes

Your two prior failures map cleanly onto two distinct CSS facts:

- **Attempt 1 (in-flow swap)** mutated real layout (`scrollWidth`) mid-gesture → momentum destination computed against a track length that then moved → end books unreachable. Correct diagnosis; any approach that reflows during scroll is dead.
- **Attempt 2 (absolute overlay)** put a 120px opaque box over a 36px slot as the top hit-target → structural occlusion and dead siblings. Also correct; overlays that cover siblings will always bury them.

The transform-choreography model is categorically different from both: `transform` "does not affect the flow of the content surrounding the transformed element," so no reflow occurs (fixing Attempt 1's mechanism), and neighbors are translated aside rather than covered (fixing Attempt 2's mechanism). **The one residual trap** is the overflow-computation rule in Key Finding 1 — a purely rightward neighbor push still nudges `scrollWidth` in Blink/WebKit. That is why the reserved-slack recipe (Key Finding 2) is mandatory, not optional.

### The math (dock displacement curve)

The macOS-dock magnification is a bell curve. A common, well-tested formulation (used by the Build UI / Magic UI / unlumen React docks) is a Gaussian: `scale = (magnification − 1) × exp(−d² / (2 × distance²)) + 1`, where `d` is the pixel distance from each item's center to the anchor and `distance` controls falloff width. For SpineShelf, the anchor is your existing `progress = scrollLeft / maxScroll` mapped across the viewport, so `d` = (item center in viewport space) − (anchor x). Each item derives:

- a scale for the anchored transition spine→cover, and
- a `translateX` equal to the cumulative half-width added by all items between it and the anchor, split so left items go left and right items go right.

To keep density (the "reads as a shelf" requirement of ~10 thin spines/screen), only the 1–3 items nearest the anchor deviate meaningfully from 36px; the falloff returns others to baseline quickly. Reserved padding absorbs the peak displacement so the summed rightward translate never crosses the end edge.

### Handling the ends

At the first/last item the displacement wave must be one-directional (nothing to push past the shelf edge). Dock implementations clamp the curve at the array bounds; the standard fix is to add static leading/trailing `scroll-padding` (or an empty spacer of the max-expansion width) so the terminal item's expanded form has room _inside_ the existing scrollable range. Because this padding is static and part of `scrollWidth` from the first frame, it does not perturb momentum — the exact property your gesture needs.

### transform-origin trick and its limit

The classic dock cheat is to magnify on the **vertical axis with `transform-origin: bottom`**, so icons grow _upward_ and neighbors never need horizontal displacement — this keeps `scrollWidth` perfectly invariant. It's a clean fit for icon docks. **It only partially fits SpineShelf**, because a cover (~120×176) is genuinely _wider_ than a spine (~36×184), so some horizontal growth is unavoidable; you cannot fake width with pure vertical scale. Practically: grow height/scale with `transform-origin: bottom` for the vertical component (free), and handle the horizontal component via the reserved-slack displacement above. Do not rely on `overflow-clip-margin` to let the enlarged spine bleed out — it is not Baseline (unsupported in Safari), so if you need the cover to visibly exceed the row you must either reserve vertical room or use a non-scrolling overlay layer that renders only the _visual_ enlargement while the real hit-target/slot stays in-row.

### Which JS approach owns momentum vs. rides native scroll

| Approach                                       | Momentum model                                                         | Keeps your native scroller + anchor logic?                                            |
| ---------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Hand-rolled transform choreography             | Rides native `overflow-x:auto` momentum                                | **Yes** — minimal change; keep `scrollLeft/maxScroll` anchor, add per-item transforms |
| Motion (motion.dev) `useScroll`+`useTransform` | Rides native scroll; transforms via motion values (no React re-render) | **Yes** — wraps your existing scroller                                                |
| CSS scroll-driven animations                   | Rides native scroll; compositor-driven                                 | **Yes** — pure CSS, zero JS/frame                                                     |
| Embla Carousel                                 | **Owns** physics (spring rAF, translate-based)                         | No — replaces the scroller; re-derive anchor from Embla progress API                  |
| GSAP Draggable + InertiaPlugin                 | **Owns** physics fully                                                 | No — replaces the scroller                                                            |
| Swiper (coverflow + freeMode)                  | Owns physics (translate); freeMode+coverflow momentum is buggy         | No — replaces the scroller                                                            |

### Constraint scorecard (approaches × constraints)

| Constraint                        | Native + transform (hand-rolled) | Native + CSS scroll-driven | Embla (owns physics) | GSAP Draggable+Inertia      |
| --------------------------------- | -------------------------------- | -------------------------- | -------------------- | --------------------------- |
| Layout invariance (`scrollWidth`) | ✅ with reserved slack           | ✅ with reserved slack     | ✅ by construction   | ✅ by construction          |
| Momentum correctness              | ✅ (static track)                | ✅ (native)                | ✅ (recomputed)      | ✅ (owned physics)          |
| End reachability                  | ✅ (scroll-padding)              | ✅ (scroll-padding)        | ✅ (`loop:false`)    | ✅ (bounds)                 |
| Tap targets preserved             | ✅ (displaced, not covered)      | ✅                         | ✅                   | ✅                          |
| Density (~10 spines)              | ✅ (local deviation)             | ✅                         | ✅                   | ✅                          |
| A11y / keyboard / SR              | ✅ (DOM order intact)            | ✅                         | ✅ (W3C pattern)     | ⚠️ manual                   |
| Bundle size                       | 0 (or ~4.6–34KB if Motion)       | 0                          | ~7KB gzip            | larger                      |
| License vs AGPL-3.0               | n/a                              | n/a                        | ✅ MIT               | ✅ free (custom permissive) |
| Browser support 2026              | ✅ universal                     | ⚠️ ~83%, FF flagged        | ✅ universal         | ✅ universal                |

### Library-by-library assessment

- **Embla Carousel** — MIT-licensed (per the official repo: "Embla is MIT licensed 💖"); ~7KB gzipped and dependency-free (PkgPulse 2026: "Embla: ~7KB gzipped … powers shadcn/ui Carousel"). Adoption is large: `embla-carousel-react` shows 28,779,668 weekly downloads on Socket's package analysis, and the core `embla-carousel` package (8.6.0) shows 8,677,210 weekly downloads / 8,084 GitHub stars on npmtrends. First-class React 18 hook (`useEmblaCarousel`). Spring-based rAF physics, translate-based, `dragFree` gives momentum, no `loop` gives real ends (matches your no-wrapping constraint). Official Scale example is exactly the distance-from-center tween. **Top library pick.** Risk: you replace native scroll and re-derive the sliding anchor from `scrollProgress`/`slidesInView`/engine location; slide-size changes mid-animation reset it, so scale the _inner_ node only (documented, expected).
- **GSAP Draggable + InertiaPlugin** — Now 100% free including all formerly-paid Club plugins, per GSAP's official v3.13 release blog ("Thanks to Webflow, GSAP is now 100% FREE including ALL of the bonus plugins!"), effective April 30, 2025 per Webflow, covering the core library, SplitText, MorphSVG, DrawSVG, ScrollTrigger, ScrollSmoother, and Inertia, with commercial use permitted. Owns physics via `InertiaPlugin` (VelocityTracker → flick-scroll with snap). Maximum control, solves momentum by owning it. Risk: larger footprint, more manual wiring, its license is a permissive custom license (not OSI/MIT) though free — acceptable alongside AGPL.
- **Splide** — MIT, ~12KB gzip, TypeScript, strong a11y (W3C Carousel pattern, live regions, reduced-motion). Has active-slide scaling examples. Good, lighter-featured fallback if you want a batteries-included accessible slider.
- **Keen-Slider** — MIT, ~5KB, no deps, `detailsChanged` + per-slide `distance` API for per-slide scale/opacity; native-feeling touch. Good minimal option.
- **Swiper** — MIT, but modular ~25–45KB. Coverflow does scale/rotate on centered slide; however `freeMode` + `coverflow` momentum is a known-buggy combination (the fling bypasses the momentum transition, per Swiper issue #5779). Not recommended for your momentum-critical case.
- **Flickity** — GPLv3 for open-source use (commercial license otherwise, $25/dev and up). **License is compatible** with your AGPL-3.0 app (GPLv3 and AGPLv3 are FSF-compatible). But it's an older jQuery-era library; prefer Embla.
- **Motion / Framer Motion** — MIT. React build ~31–34KB gzip (≈4.6KB with `LazyMotion` + `m`), framework-agnostic ~12KB. `useScroll(container)` + `useTransform` per item drive scale/x from `scrollXProgress` as **motion values outside React render**, so no re-render churn — well-suited to driving 10–36 items at frame rate on the GPU. Explicitly avoid its layout (FLIP) animations mid-scroll (you don't want those). Profile on a real mid-range Android; keep to transform/opacity only.

### CSS-only paths

- **Scroll-driven animations:** per-spine `view-timeline`/`scroll-timeline`, transform-only keyframes, peak scale at the anchor. Compositor-driven, zero JS/frame — the theoretical ideal. Ship behind `@supports (animation-timeline: view())` with the plain-spine state as the fallback; Firefox users (flagged) simply see static spines.
- **`scroll-snap`:** `scroll-snap-type: x` + `scroll-snap-align: center` gives you a stable "picked" item without JS and pairs naturally with your center anchor. Transforms don't trigger re-snap (they don't change layout), so dynamic magnification coexists with snapping. Consider `proximity` (not `mandatory`) so dense browsing isn't over-constrained.

## Recommendations

**Stage 1 — Prototype the invariance recipe on your existing scroller (lowest change, highest leverage).** Keep `overflow-x:auto` and the `scrollLeft/maxScroll` anchor. Add: (a) static leading/trailing `scroll-padding`/spacers sized to the max expansion delta; (b) per-item `transform: translateX() scale()` driven by the Gaussian curve, with `transform-origin: bottom` for the vertical component; (c) symmetric neighbor displacement (left = free, right = into reserved slack). **Instrument `scrollWidth` every frame during a fling on real iOS Safari and Android Chrome** — it must remain constant. Drive transforms with Motion motion values or a hand-rolled rAF loop to avoid React re-renders.

- **Go/no-go threshold:** if instrumented `scrollWidth` deviates by even 1px mid-gesture, or the last 1–3 books become unreachable, the reserved slack is undersized or displacement is leaking past the end edge — increase trailing padding to ≥ peak rightward displacement, or clamp the curve harder near the end.

**Stage 2 — If native-scroll invariance proves fragile cross-browser, switch to Embla Carousel.** Adopt `useEmblaCarousel({ dragFree: true, loop: false, watchResize: false })`, scale the inner node per slide via the Scale-example tween keyed off `emblaApi.scrollProgress()`/slide positions, and re-derive your anchor from Embla's progress. This trades "keep native scroll" for "momentum can't break by construction." Budget ~7KB.

- **Switch trigger:** choose this the moment Stage 1 shows unavoidable `scrollWidth` jitter on a target browser, or when hit-testing/occlusion edge cases on 1–3-book shelves can't be resolved with displacement alone.

**Stage 3 — Layer CSS scroll-driven animation as a progressive enhancement** once the interaction model is settled, to offload the magnification to the compositor on Safari 26+/Chrome and shed JS work on low-end Android. Gate with `@supports`; keep the JS path as the universal fallback.

**Accessibility (all stages):** keep every book a real focusable element with `tabindex` and an accessible name; ensure keyboard focus moves the anchor (focus → scroll-into-view → magnify), honor `prefers-reduced-motion` by disabling the scale/translate and snapping directly to the picked cover, and verify a screen reader still reads each spine in DOM order (displacement is visual only, so order is preserved).

## Caveats

- **The overflow/transform interop is not fully specified** — CSSWG issue #9458 is still open, and Chrome/Safari behavior is empirically derived from test cases, not a settled algorithm. Treat cross-engine `scrollWidth`-under-transform behavior as "current observed," and keep the frame-by-frame instrumentation in your test suite as a regression guard.
- **Firefox differs** (unions untransformed + transformed positions), but for a mobile PWA the dominant engines are WebKit/iOS and Blink/Android, so this is low-risk; still, don't rely on desktop-Firefox behavior matching.
- **`overflow-clip-margin` is not Baseline** (no Safari support); don't build a bleed-out-of-row visual dependency on it.
- **Swiper's freeMode+coverflow momentum bug** is documented (issue #5779); avoid that specific combination.
- **A cover is inherently wider than a spine**, so some horizontal growth is unavoidable — pure vertical `transform-origin:bottom` magnification (the cleanest invariance trick) cannot fully deliver the spine→cover reveal on its own; the reserved-slack horizontal displacement is the load-bearing part of the design.
- **Density vs. reveal is a real trade-off**: reserved slack slightly reduces how many spines fit per screen, but because it's static it doesn't harm momentum — tune the falloff so only 1–3 items near the anchor deviate.
