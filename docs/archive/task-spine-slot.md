# Reverie — SPINE slot (2026-06-30)

> The first signature component of the Structural Character layer (#15). Design spine treatment:
> `design/from-design-tool/study-spine/Reverie_Theme_Studio.html` ("Spine Treatment · Specimen 02").
> Stacks on #15 — must not land before #15's real-app eyeball clears.

## What this is

A spine is its own object — a **kit of slots** every skin fills, not a rotated cover. Adds a `Spine`
slot to `SKIN_STRUCTURE` (#15), filled for Tryst + Aphelion. The old spine (a slim cover with the
cover's text) is replaced — that failed because it was cover layout at spine width.

## Spec (extracted from the specimen)

- **Anatomy**: head band · author · vertical title (writing-mode: vertical-rl; text-orientation: mixed,
  top-to-bottom) · optional head label · tail colophon · tail band.
- **Tryst**: cloth-and-leather, gilt-stamped Fraunces title (embossed), gilt head+tail bands, ❦ fleuron
  tail colophon, label folded into a gilt title panel.
- **Aphelion**: brushed metal, mono uppercase title, callsign/catalog code at the head, tick-rule bands,
  author at the tail, status-LED at the foot.
- **Constraints**: CSS/SVG only (no raster); title ≥ 13px, author/labels ≥ 9px, both modes.

## Two data-reality checks (both caught)

1. **Dimensions**: the spec wants width ← page count, height ← trim. The **Book model has neither** (no
   page count stored; trim never in exports). So both come from a **stable per-book hash** (`spineDims`)
   — deterministic, varied, never uniform. Wire `thickness` to a real page field if one is added.
2. **Past the 13px floor**: `fitSpineTitle` scales to the floor, then **truncates** with an ellipsis (the
   colophon stays anchored), so a title+subtitle monster degrades instead of breaking the spine.

## Guardrails / gate

- AA: contrast test extended to spine title / author / label across skin × mode (the text sits centred
  over the opaque card base; min sizes are normal text → 4.5 floor).
- Reduced-motion: the Aphelion status LED pulses on `.rv-anim`.
- CSS/SVG only. Gate: core + typecheck + lint + build + axe e2e green.

## Eyeball — on the real shelf, with real titles

Verdict is on the **authenticated app** (the Home priority shelf now renders these spines), both skins,
both modes, real titles of varying length (a very long one + a one-word). `/lab/structure` previews it
with real-style samples; the final call is on the product.
