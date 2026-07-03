# Reverie — implementation (Code): DESIGN INCORPORATION + MVP POLISH (2026-07-01)

> The Fable 5 design pass is producing a unified redesign of all nine skins, spines, placeholder covers, and the
> core components, delivered as extractable specimens in `design/from-design-tool/` (chunked: system + refined
> Tryst/Aphelion → skins 3–5 → skins 6–9 → composed screens). This task incorporates it and closes out the MVP.
> Do NOT start incorporation until STEP 0 is fully done.

## STEP 0 — clean main first (hard gate)
1. Merge both open chains down, in order: import chain **#10→#11→#13→#14→#18**, then structural line
   **#15→#16→#17**, resolving the flagged **LibraryRoute conflict** (both stacks edit the library screen from
   opposite sides).
2. **Post-merge verification on the authed app**: the "Import books" CTA AND the working shelves + placeholder
   cover are BOTH present on the library screen. A careless conflict resolution silently drops one side, and
   the green gate can't catch it — both halves passed independently before they collided.
3. Full gate green on main. Only then branch for incorporation.

## THE PRIME RULE — extraction into the existing contract, not rearchitecture
The redesign fills the architecture you built; it does not replace it. `SKINS`, the token contract,
`SKIN_STRUCTURE`, the `Spine` slot, the registry-keyed tests, the voice pack — all stay. Incorporation =
decode each specimen (the standard bundle format you've decoded three times) and update **values + structural
configs + the one signature-motif component per skin**. If a specimen implies a genuinely NEW slot, that's a
contract extension PR first (schema + neutral default + doc), then fills — flag it, don't smuggle it.
Extract real values; never guess. If something is ambiguous in a specimen, ask Greg rather than inventing.

## STAGED INCORPORATION (prove first, then fan out — per chunk)
**Stage I — system + refined Tryst/Aphelion.** Decode chunk 1; diff refined values/structures against current;
update the two reference skins (values, structures, spines, placeholder covers). These are live, proven skins —
treat this as a refinement diff, not a rebuild; anything that looks like a regression against the current
identity gets flagged to Greg with a before/after, not silently applied.
**Stage II — skins 3–5, then III — skins 6–9.** For each: fill the full token table + `SKIN_STRUCTURE` config +
signature motif + `Spine` + `PlaceholderCover` + voice-pack lines from the specimen. One PR per chunk. The
seven finally get bone — this replaces their flat code-first placeholders wholesale.
**Stage IV — composed screens.** Use chunk 4 as the reference for how slots assemble on Home hero, Library
section, detail rail, empty state — reconcile the app's composition to it where they differ.
Each stage: **branch, not merged**, staged for Greg's eyeball on the REAL authed app (not `/lab`) before the
next stage lands. For skin chunks, stage a side-by-side of each new skin's composed home + library + shelf,
both modes.

## MVP POLISH (after Stage IV, same discipline)
- **Fan structure everywhere**: every remaining surface composes from slots — nav, stats, planner, orders,
  settings, onboarding screens, import flow (Building / found / dedupe / Ready), toasts, dialogs. Zero
  surfaces left on the generic card-and-label.
- **PlaceholderCover** rendered for every coverless book, every surface covers appear.
- **Shelf** on real data across all nine skins: size variation from available fields (page-count bucket /
  stable hash where trim is absent), long/short titles, no overflow.
- **Empty states + loading lines** pull each skin's voice from the voice pack — no generic copy anywhere.
- **Sweep for dead ends**: every MVP flow (sign-in → onboarding → import → library → detail → log a read →
  stats/goal) completes without a broken or unstyled screen in all nine skins. Fix what the sweep finds; list
  anything deliberately deferred.

## GUARDRAILS (all standing, now at nine-skin scale)
- **AA**: the registry-keyed contrast test auto-covers nine skins × two modes — extend it to every new
  structural text surface, spine text at minimum sizes (13px/9px), placeholder covers, and voice copy surfaces.
- **Reduced-motion**: every skin's animated character rides `.rv-anim`.
- **Perf**: CSS/SVG only, no raster; nine texture recipes must not regress the card grid — verify on the
  heaviest skin.
- **Fonts**: extend the `document.fonts.check` e2e guard to every typeface the redesign introduces (the
  Fraunces guard pattern, generalized).
- **Voice**: no hardcoded strings where the voice pack should speak.
- **GATE** per PR: core + typecheck + lint + build + the full axe e2e sweep (all nine × both modes) green.

## MVP DEFINITION OF DONE
1. Clean main; both prior chains banked; LibraryRoute verification passed.
2. All nine skins: full identity (tokens + structure + motif + spine + placeholder + voice), extracted from the
   design pass, live on the real app.
3. Every MVP flow completes, styled, in every skin; no generic-SaaS surface remains (the specimen's two tests:
   two-worlds, not-SaaS).
4. All guardrails green at nine-skin scale.
5. Greg has eyeballed each stage on the authed app and cleared it.

DELIVERABLE: staged PRs per chunk (branch, not merged; eyeball-gated), then the polish PR(s); each with the
gate green and a real-app side-by-side staged for review. Report per stage with the same honesty as prior
stages — what landed, what was deferred, what needs Greg's eye.
