# Visual-misalignment audit — horizontal overflow, clipped text, controls past their box

**Date:** 2026-08-15 · **Branch:** `audit/visual-overflow-sweep` · **Status:** findings 1–3 **FIXED**
in `fix/clubs-overflow-cover-placeholder`; finding 4 open.

| #   | finding                                             | status                                                  |
| --- | --------------------------------------------------- | ------------------------------------------------------- |
| 1   | `/clubs` page-level overflow at every phone width   | **fixed** — grid track + grid item, see below           |
| 2   | `CoverPlaceholder` author line cut off both ends    | **fixed** — `AUTHOR_OVERFLOW` contract                  |
| 3   | `CoverPlaceholder` title/author overlap in aphelion | **fixed as a side effect of 2** — measured, not assumed |
| 4   | `/club/:id` 3px hard clip on the title              | **open** — out of scope, lowest priority                |

**Verified after the fix, with numbers rather than "looks right":**

- `page-overflow` findings across the whole re-sweep: **6 → 0**.
- `/clubs`' only remaining findings are the two known-noise categories (the fixed sky backdrop and
  the `sr-only` skip link) — no defect findings at any width or skin.
- The author line's `left-escape` (content starting before its clipper — the "lost leading F"
  signature) went from **14px worst / 1275 flagged combos → 0**. The only `left-escape` left anywhere
  is a 2px aphelion callsign chip, unrelated and pre-existing.
- Finding 3 measured directly at hero size, before and after, by comparing the title's bottom edge to
  the author's top edge: **aphelion +3px overlap → −9px gap**. All five other designed plates already
  had gaps and kept them. The author line also still fits inside its plate (`authorBelowPlate` −22px
  at the tightest, aphelion), so the extra wrapped line did not trade a horizontal clip for a
  vertical one.

**Trigger.** A zoomed phone screenshot of `/shelves` appeared to show a shelf-header row with text
cut at its start (`"nce ›"` with nothing before it) and a tab pill leaking a sliver of colour past
its right edge. A zoomed crop is not evidence, so this measured instead of guessing.

**Harness.** `apps/web/e2e/audits/visual-overflow.audit.ts` (broad sweep) and
`shelves-trigger.audit.ts` (the trigger case), behind `playwright.audit.config.ts`. `.audit.ts`
cannot match the main config's default `testMatch`, so neither joins `pnpm e2e` — verified:
`playwright test --list` reports 0 audit tests and the same 253 tests in 33 files as before.

---

## Pass 2 — the trigger case: **NO**

`/shelves`' tab pill and shelf-header row do **not** overflow at any tested width. Measured at 375,
390 and 412 in `marrow/dark` and `tryst/dark` (the reddish-dark candidates), each element scrolled
into view and measured against the box that clips it:

| element                       | box         | clipper        | clearance       |
| ----------------------------- | ----------- | -------------- | --------------- |
| tab pill `TBRs / Collections` | 16…173 @375 | viewport 0…375 | **202px spare** |
| header row `Owned · 8 ›`      | 16…89 @375  | viewport 0…375 | **286px spare** |

Zero past-right, zero before-left, zero self-overflow in all six combinations, with a long shelf
name (`"A Shelf Whose Name Is Long Enough To Test A Header Row"`) present so a clean result could not
come from a fixture too short to reproduce anything. Screenshots confirm the numbers.

**But the instinct behind the report was right — about a different element on the same screen.** See
finding 2: the cover placeholder's author line on `/shelves` genuinely loses characters off **both**
ends, which is exactly the `"nce ›"` symptom. The crop caught a real defect and mis-attributed it.

---

## Pass 1 — findings, ranked

### 1. `/clubs` overflows the viewport at every phone width — the page pans sideways

The only **page-level** overflow anywhere in the sweep, and the most severe finding.

| skin/mode     | scrollWidth | 375       | 390       | 412       | 768 / 1280 |
| ------------- | ----------- | --------- | --------- | --------- | ---------- |
| tryst/dark    | **450px**   | overflows | overflows | overflows | fits       |
| aphelion/dark | **468px**   | overflows | overflows | overflows | fits       |

`scrollWidth` is **constant across viewport widths** — the signature of a content-driven minimum, not
a layout that merely fails to shrink. The page has a hard floor around 450px and every phone is
narrower than it. Aphelion is 18px worse (uppercase controls are wider in the same box).

The chain, widest first: `div#root` → `div.grid.gap-2.sm:grid-cols-2` →
`button.flex.items-center.gap-3.skin-panel` → `div.min-w-0.flex-1` (right edge 422 vs viewport 375)
and `span.text-[18px]` (the 📖, right edge 455).

**Why no existing guard catches it — and this is the interesting part.** `/clubs` is absent from
`no-horizontal-overflow.spec.ts`'s `ROUTES`, but it _is_ in `route-viewport.spec.ts`, which runs on
the `mobile` project at 390×844 and asserts exactly this invariant. It passes because its fixture
club is named `"Width Probe Club"` — short enough to stay under the floor. This audit's club is
`"The Overflow Book Club of Extremely Long Naming"`. That spec's own header predicted this: _"a route
whose fixture content is narrower than the viewport is guarded only as a tripwire."_ The tripwire was
never armed for `/clubs`.

**Both gaps closed alongside the fix, and both verified RED first.** `route-viewport.spec.ts`'s
fixture club is renamed to something long enough to reproduce, and `/clubs` is added to
`no-horizontal-overflow.spec.ts`'s `ROUTES` **with a club row seeded** — an empty `/clubs` is two
empty-state paragraphs and cannot overflow whatever the layout does, so adding the route without a
fixture would have added a name to the array and no coverage at all. Against the unfixed component
the two specs produced 3 failures (`scrollWidth 492 vs clientWidth 390`, and `layout viewport (558)
must not exceed the screen (390)`); against the fix, 10 passed.

**ROOT CAUSE — confirmed by reading the live layout, and the hypothesis above was only half of it.**
Measured at a 375 viewport before the fix: the grid box was a correct **343px** while its computed
`grid-template-columns` was **434.172px** — the track wider than the container holding it.

Two independent causes, both required:

1. **The grid had no column template.** A bare `grid` has no `grid-template-columns`, so the single
   implicit track is `auto`-sized, and an `auto` track floors at its item's automatic minimum size.
   Tailwind's `grid-cols-N` expands to `repeat(N, minmax(0, 1fr))` precisely to cap this; the markup
   had `sm:grid-cols-2` for ≥640px and nothing below it.
2. **The card `button` is a grid item with `min-width: auto`.** The `min-w-0` already in the markup
   is on the button's _child_. The button is itself a flex container whose text column is `flex-1`
   (basis 0), and a flex-basis-0 item contributes its **max-content** width to its container's
   min-content size — so the button's minimum was the club title's full unwrapped width. The title
   already had `truncate`; nothing above it could shrink, so it never got the chance.

Fix: `grid-cols-1` on both grids and `min-w-0` on both card buttons (`ClubsRoute.tsx`). The shared
lists grid below carried the identical markup and the identical defect — it went unreported only
because the audit fixture seeded no shared lists.

**Screenshot:** `page-overflow--tryst-dark-375--_clubs.png` — the card runs off the right edge, its
rounded right border entirely off-screen.

### 2. `CoverPlaceholder` cuts the author line off **both** ends — silently

The trigger's real counterpart. A long author name is centred inside a clipping box; when the name
exceeds the box, centring splits the overflow across both edges and the clip removes characters from
the **start** as well as the end. No ellipsis, no affordance — the text is simply wrong.

Observed on `/shelves` in tryst/dark: **`WILHELMINA EATHERSTONEHAUGH MARCHBANKS`** — the leading `F`
of `FEATHERSTONEHAUGH` is gone. Measured as 14px past the clipper on the right and 14px before it on
the left, on the same element.

Mechanism: the author `<span>` is `uppercase` with wide `letter-spacing` and no
`overflow-wrap`/`word-break`, inside a `text-align: center` panel with `overflow: hidden`. A single
unbreakable word wider than the panel overflows symmetrically.

This appears on **every route that renders a coverless book** — which, with cover fetching stubbed,
is most of them. It is one root cause, not many findings.

**Fix:** an `AUTHOR_OVERFLOW` contract spread into all **nine** designed plates' author spans (the
tenth, `plain`, already carried the shape). It pairs `overflow-wrap: anywhere` with a 2-line clamp,
and both halves are load-bearing: clamping bounds _height_ and does nothing for a single unbreakable
word wider than the box, while wrapping alone would let a long name grow downward into whatever sits
below it. Nine sites rather than the one reported, because the audit flagged three different author
spans (`span.uppercase`, `span.block.uppercase`, `span.mt-[5%].block.uppercase`) and every designed
plate carried the same shape.

**Residual, recorded not fixed:** the TITLE spans keep clamp-without-wrap, so a single unbreakable
word longer than the panel would still clip at both ends there. No such title exists in the corpus
and none appeared in the audit.

**Screenshots:** `hard-clip--tryst-dark-375--_shelves.png`, `bleed--marrow-light-375--_shelves.png`.

### 3. `CoverPlaceholder` title and author lines overlap in aphelion — FIXED as a side effect

Distinct from finding 2 and vertical rather than horizontal: in `aphelion/dark` the clamped title
paints on top of the author line — `"Deliberately…"` and `"WILHELMINA"` occupy the same pixels.

**Resolved by finding 2's fix, and this was measured rather than assumed** — the audit had only
flagged it as _likely_ the same root cause. Comparing the title's bottom edge to the author's top
edge at hero size, with the `CoverPlaceholder` change stashed and then restored:

| skin     | before           | after        |
| -------- | ---------------- | ------------ |
| aphelion | **+3px overlap** | **−9px gap** |
| tryst    | −14px gap        | −13px gap    |
| grimoire | −37px gap        | −37px gap    |
| marrow   | −10px gap        | −10px gap    |
| umbra    | −3px gap         | −3px gap     |
| almanac  | −4px gap         | −4px gap     |

Aphelion was the only one overlapping, and it is the only one that moved. The cause was the author
line overflowing its box horizontally instead of wrapping, which left the block's measured height
disagreeing with what was painted; once the name wraps and clamps, the block occupies the height it
claims.

**Measurement note worth keeping:** the first version of this check reported marrow, umbra and
almanac as +33px overlaps. They were not. Those plates wrap title _and_ author in a label-plate
`<span>` whose own `innerText` contains both, so the naive "first element whose text matches" picked
the container and called its bottom the title's bottom — manufacturing an overlap that was really
just containment. Selecting the deepest matching element cleared all three. A measurement can be
wrong in the direction of finding a defect, not only in the direction of missing one.

### 4. `/club/:id` — a 3px hard clip on the club title

`span`, content 67 cut to 64, no ellipsis. Small, real, and the same _class_ as finding 2 (text cut
with nothing to signal it) at a scale a reader may never notice. Lowest priority of the four.

---

## What was measured, and what was not

- **27 routes** (derived from `router.tsx`, not hand-kept), **5 widths** (375/390/412/768/1280),
  **590 measurements**.
- **Stage A** — all 27 routes × all 5 widths, in `tryst/dark` and `aphelion/dark`. Aphelion is the
  deliberate second: it is one of three skins with `--control-transform: uppercase`, and uppercase is
  materially wider in the same box.
- **Stage B** — the remaining 16 skin/mode combos, on the 20 worst-ranked `(route,width)` targets,
  with `/shelves`' three phone widths pinned regardless of what Stage A found.
- **NOT measured: 105 flagged `(route,width)` targets** were swept in Stage A's 2 skin/modes only,
  not all 18 — they exceeded the Stage B cap of 20. Named in full in
  `apps/web/audit-output/visual-overflow/report.md`. The full cross-product is 27 × 5 × 18 ≈ 2,400
  navigations; this run was 590 in 13.9m.
- **Fonts: 256/590 measurements had both real webfaces loaded.** The rest fell back mid-run. Real
  fonts are enabled deliberately (`stubFonts: false`) because an audit about glyph widths measured on
  fallback metrics reports a typeface nobody sees — but the miss rate means per-skin _metric_
  differences are only partly exercised. The four findings above all reproduce visually in
  screenshots, so none of them rests on that.

## Known noise in the raw report — ignore these

Two categories survive the filters and are **not** defects:

- **`sr-only` elements** (`"SKIP TO CONTENT"`, `label.sr-only "Sort"`). Screen-reader-only text is a
  1px clipped box by design; "content 151 cut to 32" is the mechanism working.
- **`div.pointer-events-none.fixed.inset-0.-z-10`** — the ambient sky backdrop, deliberately larger
  than its frame.

Both are excluded from the four findings above but still appear in the generated report; a future
revision of the probe should filter them at source.

## Method notes worth keeping

- **Measure against the nearest clipping ancestor, not the element's own box.** The obvious probe
  (`scrollWidth > clientWidth`) was written first and returned 5,000+ hits on one route, nearly all
  noise: a `<span>` inside a `truncate` parent is _supposed_ to exceed its box. What a reader can see
  is overflow that escapes every clipper between the element and the screen.
- **Never `scrollWidth > window.innerWidth`.** `route-viewport.spec.ts` established this against a
  live defect: Chromium's mobile emulation zooms out to fit an overflowing page, so `innerWidth`
  grows to meet `scrollWidth` and the check passes against the very defect it exists to catch.
  `documentElement.clientWidth` is the stable side.
- **Switch skins through the profile, not by writing `data-skin`.** ~20 components read
  `useStructure`/`useLabels`/`useVoice`, so a skin changes which bones a region has and what words it
  uses — and per-skin copy has per-skin length. An attribute swap measures a page no reader sees.
