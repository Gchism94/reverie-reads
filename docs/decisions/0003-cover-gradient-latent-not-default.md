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

**Surfaces NOT checked:** `SeriesView`, `BookDetailRail`, Add's cover preview, and `RefineAdded`.
They may or may not expose the gradient. Anyone building the opt-in setting should start by
auditing those four rather than assuming either way.

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
- The four unchecked surfaces above are the open question, and are recorded here so the next person
  does not have to rediscover them.
