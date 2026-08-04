# Spine overlay clamp audit — what the clamp does, and what actually blocks the ends

Audited 2026-08-04 on `audit/spine-overlay-clamp` (off `main` @ `df8cfb4`). Audit only. All
measurements from temporary Playwright specs (deleted before commit) at the mobile project's
390×844 touch viewport against `/shelf/:id` — which, post `fix/route-width-constraint`, lays out
at true viewport width (track clientWidth 358 = 390 − 32 padding, verified in every reading
below). Fixtures: 1, 2, 3, and 36-book shelves.

## Headline

- **The shipped claim was accurate as code and oversold as prose.** The clamp
  ([SpineShelf.tsx:118-119](../../apps/web/src/components/SpineShelf.tsx#L118)) bounds the
  overlay to the track's **content** box, and measurement confirms it does exactly that — at both
  content extremes the cover renders fully inside the visible box, zero overhang. But "the pulled
  book stops at the shelf's end like a physical one" implied visibility semantics the clamp never
  had mid-scroll, and it says nothing at all about siblings. (§1, §2)
- **The device's two-book catastrophe reproduces headless, exactly** (§3): on a 2-book shelf,
  revealing book 1 renders its 120px cover at content [0,120] — book 2's entire slot ([62,91])
  is buried. This is the DESIGNED occlusion ("paints over its neighbours the way a pulled book
  fronts them") doing exactly what it was told at a density where the design premise collapses.
  Nothing is painting outside the track; the track's whole content fits under one cover.
- **The end-unreachability hypothesis under audit — cover invisible past the track edge at max
  scroll — is KILLED by measurement** (§4): the last three books' revealed covers are all fully
  visible at max scrollLeft (visible overhang 0px each). What the same fixture DID surface is the
  actual dead zone: **the scroll-driven pick can never select the first 3 or last 3 books.** At
  scrollLeft 0 the centre-most slot is index 3; at max it is index 32 (of 36). Slots 0–2 and
  33–35 are arithmetically unpickable by scrolling — the viewport centre can't get closer than
  clientWidth/2 ≈ 179px to either content edge. That count and both-endedness match the reported
  symptom exactly, on this fixture and on the device's numbers (382/2 ≈ 191px ≈ 3–4 slots). This
  mechanism predates the overlay AND the width fix — the centre-most pick has had this dead zone
  since the component's introduction, and every prior investigation measured _scrolling_ (which
  works) rather than _pick reach_ (which cannot cover the ends).

## 1. What the clamp actually does — read, then measured

The code, [SpineShelf.tsx:118-119](../../apps/web/src/components/SpineShelf.tsx#L118):

```ts
const centred = slot.offsetLeft + slot.offsetWidth / 2 - REVEAL_W / 2
const left = Math.round(Math.min(Math.max(centred, 0), el.scrollWidth - REVEAL_W))
```

Bounds are `[0, scrollWidth − REVEAL_W]` — the **content** box in scrolled coordinates. Not the
slot, not the visible window.

Measured at 390×844 (track clientWidth 358):

| quantity                           | value                                                                                                                                                                              |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| cover rendered width               | **120px**, always (`REVEAL_W`; the coverless active-spine reveal is also 120)                                                                                                      |
| slot widths (hash-sized spines)    | **29–46px** across the fixtures                                                                                                                                                    |
| overhang over the cover's own slot | **(120 − slot)/2 ≈ 37–45px each side, by design** — this is the audited screenshot's "overhangs its own slot on BOTH sides", and it is the intended occlusion, not a clamp failure |
| cover width vs track clientWidth   | 120 vs 358 — exactly one-third of the visible box                                                                                                                                  |

## 2. The extremes — no content-edge overhang, ever

36-book fixture (content 1763px, maxScroll 1405). Revealing the first and last three books each,
with the track scrolled to the relevant extreme:

| reveal                    | overlay content box                                 | visible overhang left | visible overhang right |
| ------------------------- | --------------------------------------------------- | --------------------- | ---------------------- |
| first book (scrollLeft 0) | [0, 120] — clamp active                             | 0                     | 0                      |
| 2nd book                  | [17, 137] — unclamped (fits)                        | 0                     | 0                      |
| 3rd book                  | [59, 179] — unclamped                               | 0                     | 0                      |
| 3rd-last (scrollLeft max) | [1549, 1669] — unclamped                            | 0                     | 0                      |
| 2nd-last                  | [1591, 1711] — unclamped                            | 0                     | 0                      |
| last book                 | [1639, 1759] — clamp active (1763 − 120 − rounding) | 0                     | 0                      |

The clamp accounts for rendered width correctly (`REVEAL_W` = the real 120px box), is not stale,
and applies. **At the extremes it is doing its job.**

Where a cover DOES leave the visible box is **mid-scroll**: a spine revealed while sitting near
the viewport's right edge renders its cover partly beyond the visible window — measured **35px
hidden** (overlay content [976, 1096] against a visible window ending at 1061). That region is
clipped by the scroller, reachable by a further ~35px scroll (which re-picks and replaces the
reveal). The clamp was never scrollLeft-aware and this is the honest gap between the code's claim
(content edges) and the prose's claim (the shelf's end as the reader sees it). Maximum possible:
`REVEAL_W/2 − slot/2` ≈ 37–45px.

## 3. Fewer books than the cover is wide — the two-book failure, reproduced

All three tiny shelves, measured (content < clientWidth, so no scrolling — correctly):

| shelf   | slots (content coords)     | reveal | overlay     | what it buries                                       |
| ------- | -------------------------- | ------ | ----------- | ---------------------------------------------------- |
| 1 book  | [0,45]                     | book 1 | [0,120]     | nothing — sole book                                  |
| 2 books | [0,45], [62,91]            | book 1 | **[0,120]** | **book 2's slot entirely**                           |
| 2 books |                            | book 2 | [17,137]    | book 1's slot from 17px — a 17px sliver survives     |
| 3 books | [0,45], [62,91], [113,156] | book 2 | [17,137]    | book 1 mostly, book 3 up to 137 — partial both sides |

The device screenshot is confirmed and needs no device: **on a 2-book shelf one cover lands
entirely on top of the other.** And because the overlay lives inside the revealed book's button
(the deliberate tap-target choice), the buried sibling has **no touch path at all** — tapping
anywhere on it opens the revealed book. Keyboard focus still reaches it; a finger cannot. Note
the overlay never exits the track here either (overhangs 0) — with content narrower than the
viewport, the content box sits inside the visible box and the clamp is simply idle. The defect is
not "outside the track"; it is "the designed occlusion has no lower bound on what fraction of the
shelf it may bury."

## 4. Does this explain the unreachable ends? The specific hypothesis: no. The fixture answered anyway

The question as posed — "with scrollLeft at maximum, is the last book's SPINE visible while its
revealed COVER is partly outside the visible box?" — **No.** §2's table: at max scrollLeft all
three end covers are fully visible, overhang 0. The overlay-paints-outside-the-track hypothesis
joins momentum-abort, pick oscillation, and (for this symptom) the width constraint: killed on
evidence.

What else is left is what the same measurement produced:

```
centre-most slot at scrollLeft 0:    index 3   (slots 0-2 unreachable by scroll pick)
centre-most slot at scrollLeft max:  index 32  (slots 33-35 unreachable by scroll pick)
```

The pick anchor is the viewport centre ([SpineShelf.tsx:67-68](../../apps/web/src/components/SpineShelf.tsx#L67):
`cx = r.left + r.width / 2`); scrolling moves that anchor across content positions
`[clientWidth/2, scrollWidth − clientWidth/2]` — a range that stops **179px short of each content
edge** on this fixture, ≈ 3 slots; on the device's 382px track, 191px ≈ 3–4 slots. The first and
last ~3 books can be scrolled fully into view, but the shelf's signature interaction — the
scroll-driven flip-open — can never land on them. They are permanently spines: sliver-wide,
unreadable, requiring the two-tap reveal-then-open path that nothing on the surface teaches. If
"reaching a book" means what this component's own design says it means — the centred book opens
toward you — then the ends have never been reachable, on any version of this component: the
centre-most arithmetic is unchanged from the original in-flow implementation through both merged
fixes. Every prior audit (including mine) measured whether _scrolling_ covers the track. It does.
Nobody measured whether the _pick_ covers the shelf. It doesn't.

One pointer-semantics fact worth recording because it kills a further hypothesis of mine: a real
touch `tap()` reveal **sticks** in Chromium's emulation (revealed at 120ms and still at 720ms,
aria flipped to "Open…"), identical to the `dispatchEvent('click')` control — the container's
`onPointerLeave` ([SpineShelf.tsx:135](../../apps/web/src/components/SpineShelf.tsx#L135)) does
not fire on tap-release here. Whether iOS Safari also refrains is a 15-second device check: tap
an off-centre spine — if its cover collapses back to the centre pick on its own, iOS fires
pointerleave after touchend and the two-tap open path is broken there too, which would compound
the ends story. Chromium says no; iOS is unverified.

## 5. What the invariant guard proves, given this

**Sound, and narrow — and its narrowness is exactly the shape of this audit's findings.** The
guard asserts: track scrollWidth invariant across picks; overlay `style.left` within
`[0, scrollWidth − REVEAL_W]`; overlay anchored to the slot, not the container centre. All three
were re-verified true here. None of them is violated by: a cover burying a sibling (that is
in-bounds by construction); a cover partly beyond the visible window mid-scroll (content-bounds
say nothing about scrollLeft); or a pick that can never select the end slots (not a geometry
property at all).

Should it have caught this? The two-book burial — **no, and could not have**: its fixture floor
was 36 books, and at 36 books the occlusion is the intended design; the defect only exists where
density collapses, and no assertion of the guard's kind distinguishes "designed occlusion" from
"buried sibling" without a policy about how much burial is acceptable. The dead zone — **also
no**: the guard guards layout, and the dead zone is interaction arithmetic. What the guard's
existence DID do is retire the width mechanism conclusively enough that this audit could measure
past it. Keep it as is; it holds a true invariant. The gap is that no test anywhere asserts
**reachability** — that every book on a shelf has some gesture path to being revealed and opened
— and that is the assertion a fix branch should add.

## 6. What the geometry SHOULD be — assessment, no implementation

The brief's options, measured against §2–§4:

- **Clamp the cover inside the track's visible box.** Rejected. It fixes only the 35px mid-scroll
  clip (§2's minor finding), at the cost of scrollLeft-aware re-anchoring — a re-render per
  scroll frame on top of the already-recorded remount cadence — and it detaches the cover from
  its spine (the accent pointer lies). Worse, at the ends it would drag a mid-book's cover onto
  the terminal spines, tap-shadowing exactly the books the reader is trying for.
- **Track end padding equal to half the cover's overhang (~45px).** Rejected as aimed at a
  non-defect: §2 shows the end covers already fully visible. To fix the actual dead zone by
  padding alone, the gutters must let the terminal slots reach the viewport centre — that is
  `(clientWidth − slot)/2` ≈ **170px of empty shelf at each end**, which §4's own constraint
  (density; a shelf reads as thirty spines) rules out.
- **Scale the cover to available space.** Rejected for the marquee: it shrinks the reveal exactly
  where the shelf has the most room (a 2-book shelf has 240px of empty track). Density is
  unaffected but the reveal's purpose — a readable cover — is spent.
- **What the option list missed, and what I would choose — two targeted changes:**
  1. **A sliding pick anchor** for the dead zone (§4): instead of the fixed viewport centre, map
     scroll progress to an anchor that traverses the viewport —
     `anchor = trackLeft + slot/2 + (scrollLeft / maxScroll) × (clientWidth − slot)` — so at
     scrollLeft 0 the anchor sits at the left edge (first book picked), at max it sits at the
     right edge (last book picked), and mid-track it is the centre it is today. Every book
     becomes scroll-reachable; zero layout change, zero density change, no carousel, the
     invariant untouched, and §2 already proves the end reveals render fully visible once
     picked. Degenerate case (maxScroll = 0, the tiny shelves) falls back to centre.
  2. **A minimum slot pitch on shelves whose content fits without scrolling** (§3): when
     `content < clientWidth`, there is free width by definition — distribute the 1–3 slots at a
     pitch ≥ `REVEAL_W`, so no reveal can bury a sibling. Bounded to exactly the shelves where
     "density" does not exist to be lost; a 30-book shelf is untouched. (Alternative for the same
     case: raise the reveal's lift so sibling spines stay exposed and tappable beneath it — keeps
     the books adjacent, adds vertical height; spacing is simpler and I would start there.)

  Both respect the stated constraints: ends exist and are honest (the anchor stops at the last
  book — nothing wraps), and density is preserved everywhere a reader would count spines. The
  mid-scroll 35px clip (§2) I would leave: the next scroll re-picks anyway, and every cure
  (visible-box clamping, nudge-scrolling on reveal) costs more motion than the 35px costs
  legibility. The remount-cadence flicker (gesture audit §1) is untouched by all of the above
  and remains its own branch.

## Measured / inferred / device-only

- **Measured here**: the clamp's code and its content-edge correctness at both extremes; the
  35px mid-scroll visible-box clip; the 1/2/3-book burial tables; the scroll-pick dead zone
  (indices 3 and 32 of 36); tap-reveal persistence under Chromium touch emulation.
- **Inferred**: that the dead zone is the reported "last 2-3 at each end" — the count, the
  both-endedness, and the survival across every prior fix all match, and every competing
  hypothesis is now killed on measurement, but the identification of "unreachable" with "never
  scroll-picked" is an interpretation of the reader's words, not a measurement of them.
- **Device-only**: whether iOS fires pointerleave after tap-release (breaking two-tap open — the
  15-second check in §4); nothing else in this audit needs a device.
