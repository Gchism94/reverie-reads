# Visual-misalignment audit — horizontal overflow, clipped text, controls past their box

**Date:** 2026-08-15 · **Branch:** `audit/visual-overflow-sweep` · **Status:** findings only, nothing
fixed.

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

**Leading hypothesis, not verified:** the card `button` is a grid item, and grid items have an
automatic minimum size — the `min-w-0` is on the button's _child_, not on the button itself. Needs
confirming before any fix.

**Screenshot:** `page-overflow--tryst-dark-375--_clubs.png` — the card runs off the right edge, its
rounded right border entirely off-screen.

### 2. `CoverPlaceholder` cuts the author line off **both** ends — silently

The trigger's real counterpart. A long author name is centred inside a clipping box; when the name
exceeds the box, centring splits the overflow across both edges and the clip removes characters from
the **start** as well as the end. No ellipsis, no affordance — the text is simply wrong.

Observed on `/shelves` in tryst/dark: **`WILHELMINA EATHERSTONEHAUGH MARCHBANKS`** — the leading `F`
of `FEATHERSTONEHAUGH` is gone. Measured as 14px past the clipper on the right and 14px before it on
the left, on the same element.

Mechanism, `CoverPlaceholder.tsx:659-670`: the author `<span>` is `uppercase` with
`letter-spacing: 0.1em` and no `overflow-wrap`/`word-break`, inside a `text-align: center` panel with
`overflow: hidden`. A single unbreakable word wider than the panel overflows symmetrically.

This appears on **every route that renders a coverless book** — which, with cover fetching stubbed,
is most of them. It is one root cause, not many findings.

**Screenshots:** `hard-clip--tryst-dark-375--_shelves.png`, `bleed--marrow-light-375--_shelves.png`.

### 3. `CoverPlaceholder` title and author lines overlap in aphelion

Distinct from finding 2 and vertical rather than horizontal: in `aphelion/dark` the clamped title
paints on top of the author line — `"Deliberately…"` and `"WILHELMINA"` occupy the same pixels. The
title uses `-webkit-line-clamp: 3` with a `clamp()` font size; the author sits at `margin-top: 5%` of
a container whose height does not account for the clamped title's actual line count.

**Screenshot:** `bleed--aphelion-dark-375--_shelves.png`.

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
