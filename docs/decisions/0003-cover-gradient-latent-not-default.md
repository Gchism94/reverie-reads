# ADR 0003 — The per-book genre gradient is built, guarded, and deliberately not exposed

**Status:** accepted · 2026-07-26
**Context:** `feat/edit-superset` (the cover-gradient half; see also `docs/A11Y_PLACEHOLDER_CONTRAST_TASK.md`)

## Decision

`coverGradient` — primary genre picks the hue family, the first subgenre modulates lightness and
saturation within it — is **implemented, AA-guarded, and wired to every existing call site**. It is
**not** exposed as a visible default, because it does not currently render, and on reflection it
should not.

**Each skin's designed placeholder plate is the intended visual identity.** Marrow's box-lid
(ash board, bone rule, chamfered paper label, oxblood tail), Hearth's linen-board, Tryst's
cloth-boards, Grimoire's vellum-boards, Aphelion's specimen-plate. These are the product's
character. A per-book genre tint applied underneath them would compete with that identity rather
than support it: nine hues fighting nine designed plates, on the same surface, at the same time.

So the derivation is retained as the **basis for a future opt-in personalization setting** — a
"colour my shelf by genre" toggle a reader turns on deliberately — not as a default anyone gets
without asking.

## What was actually observed

The gradient does not reach the screen on the surfaces that were checked. `CoverCard` sets it as
the `background` of the button that contains `CoverImage`; when a book has no cover,
`CoverPlaceholder` paints a **fully opaque** designed plate edge to edge, and when a book has one,
the `object-cover` image fills the same box. Either way the gradient is occluded.

This was established by experiment, not inspection. `coverGradient` was temporarily hardcoded to
**lime green** and the Marrow library grid re-screenshotted: the result was pixel-identical to the
real palette. A change that violent producing no visible difference is proof the layer is covered.

**Surfaces verified as non-rendering:** the library grid (Marrow/dark and Hearth/light) and the
book detail page.

### The four remaining surfaces — audited 2026-07-27

Measured by asking the browser what is actually painted at each gradient element's centre
(`elementFromPoint`): if a descendant sits on top, the gradient is occluded.

| Surface                 | Result                                  | Why                                                                                       |
| ----------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------- |
| `SeriesView`            | occluded                                | 160×241 cover boxes covered by the placeholder plate                                      |
| `BookDetailRail`        | occluded                                | 161×243 and 142×214 boxes, same                                                           |
| **Add's cover preview** | **rendered — now fixed**                | see below                                                                                 |
| `RefineAdded`           | occluded _(code-derived, not measured)_ | renders `<CoverImage>` unconditionally, which always paints an `<img>` or the placeholder |

_Method note: `RefineAdded` resisted automated measurement (reaching step two reliably needs a
completed add through the intake/dedup path). Its row above is read from the code, not observed,
and is flagged as such rather than presented as a measurement. It has not been upgraded since._

### Add's cover preview — the one escape, resolved 2026-07-26

`AddRoute.tsx` rendered the preview cover **conditionally** — `{cover && <CoverImage … />}` — so a
book with no cover yet left the gradient box empty and the tint showed through bare. Every other
surface renders `CoverImage` unconditionally, and `CoverImage` always paints something opaque
(an `<img>`, or the placeholder when the candidate chain is exhausted).

That was worse than the tint appearing nowhere: a genre colour visible in exactly one screen,
during the add flow, that vanishes the moment the book is saved reads as a bug, not a feature.

**Fixed by making the preview consistent with everywhere else** — the placeholder now draws
unconditionally, so a coverless book in the add form gets the same designed plate it will get once
saved. This was the direction chosen deliberately: the alternative (making every other surface
conditional) would have exposed the gradient app-wide, which is precisely the change this ADR
declines to make. The preview also now passes the in-progress author through, so the plate reads as
the book rather than as "Untitled".

With this, the gradient renders on **no** surface. The decision below is now uniform rather than
uniform-with-one-exception.

## Why the code is kept rather than reverted

The change is correct on its own terms and fixes two real defects in the value it computes, whether
or not that value is currently painted:

1. **The tint no longer rides on an array index.** `subgenre[0]` is whichever chip the reader
   tapped first. With the cross-genre subgenre disclosure added in the same branch, a horror book
   whose first pick is "Dark Romance" would have tinted romance.
2. **Every genre has a hue.** The previous map held seven romance-era entries and fell through to a
   romance-pink default, so an Epic Fantasy, a Space Opera and a Gothic horror all resolved to pink
   — a live mis-tint arriving by absence rather than by ordering.

It also carries a guardrail worth keeping regardless: colours are **generated inside a bounded
band** rather than hand-tuned per pair, and the contrast test asserts every genre × subgenre stop
clears AA against white type. That guardrail caught two errors during derivation — a flat lightness
band that ignored hue (literary/Romantic Comedy at 4.25:1), and a cap applied before rounding that
rounding then undid.

## Where the extension attaches later

`subgenreGradient(subgenre, genre)` in `apps/web/src/library/constants.ts` is the single seam every
surface already calls. An opt-in setting would gate at that seam or at `CoverPlaceholder`, deciding
whether the plate yields to the tint. The generated space and its guardrail are in
`packages/core/src/coverGradient.ts` and `coverGradient.contrast.test.ts`; adding a genre or a
subgenre cannot silently produce an illegible plate.

## Consequences

- No visual change ships from this work. The "100% of the library re-tints overnight" framing that
  preceded the screenshots was wrong: the CSS value changes for every book, the pixels do not.
- The opt-in setting is unscheduled and unpromised.
- **The gradient now escapes nowhere.** Add's cover preview was the sole exception and was
  reconciled on 2026-07-26 by drawing its placeholder unconditionally (above). The one visible
  change from that fix is in Add itself: a coverless book in progress shows the skin's placeholder
  plate instead of a bare tinted box.
