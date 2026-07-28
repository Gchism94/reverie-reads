# Skin Character System — implementation (Code), STAGE 1c (2026-06-29)

> Append to `docs/CHARACTER_IMPLEMENTATION_TASK.md`. Continues Stage 1 (PR #5) + Stage 1b (PR #6).
> Greg eyeballed `/lab/skins` and **cleared the full-character direction** — vocabulary locked on Tryst + Aphelion.

## What this is

The **mechanical fan-out**, and it's mechanical _because_ the hard parts are done: the token contract is
complete (Stage 1 type/shape + Stage 1b texture/ornament/nameplate/marks), and the aesthetic direction has
passed a human eyeball. 1c wires the remaining components onto the **already-locked contract**. Low visual
stakes, no new character invention — if a component seems to need a token that doesn't exist, that's a **flag
to Greg**, not a silent new token.

Components to retrofit (all consume existing tokens, none introduce character):

- **Inputs + search**
- **Select + toggle**
- **Goal ring**
- **Nav**
- **Toast**
- **Full empty states**

When 1c lands, the core kit retrofit is **complete for the two designed skins** — that's the close of the
Stage 1 arc.

## Branching (learn from 1b — do NOT assume merged)

- Preferred: branch `skin-character-1c` off **main once #5 and #6 are both merged**, so the full contract is present.
- If they're not yet merged when you start: **stack the same way 1b did** — branch off `skin-character-1b`
  (PR #6's head), base PR #7 on #6. Merge order becomes **#5 → #6 → #7**. Keep the diff 1c-only.
- Flag if you'd rather rebase onto main once the stack lands.

---

## STEP 0 — no extraction needed

Everything 1c needs already exists in `tokens.css` + `docs/SKIN_CHARACTER_CONTRACT.md`. Confirm you're reading
the **post-1b** contract (texture/ornament/nameplate/mark tokens present). No new decode, no new values.

## STEP 1 — wire each component to the contract

No hardcoded generic styling. Each component pulls from the existing slots:

- **Inputs + search**: shape (`--radius-control`, `--ctl-clip` notch), type (`--control-transform`,
  `--label-*` for the field label), focus ring off `--accent`. **Affordance is the watch item** — a notched,
  textured field must still obviously read and behave as a text input.
- **Select + toggle**: same shape/type/accent tokens; states (open/checked/disabled) legible per skin × mode.
- **Goal ring**: the ring's **number uses `--numeral-font` / `--numeral-feature`** so it matches the proven
  StatNumber treatment (Fraunces old-style in Tryst vs Space Mono tabular in Aphelion) — the ring number and the
  stat numerals must read as the same world of number. Ring sweep animation rides `.rv-anim`.
  (Visual only here — this is the element that later becomes Reading Challenges; no behavior change in 1c.)
- **Nav**: shape + `--label-*` type; active/hover states; affordance intact.
- **Toast**: per-skin shape (`--radius-panel`/`--panel-fill`), accent for status; enter/exit motion on `.rv-anim`.
- **Empty states**: pull **per-skin voice** from the `@reverie/core` voice pack (`useVoice`) — empties are a
  prime voice surface; they must not fall back to generic copy. Type via `--label-*`; any illustration is
  CSS/SVG, no external images.

## STEP 2 — Tryst + Aphelion fall out of the contract

Because these consume existing per-skin token values, Tryst + Aphelion should be correct once wired. Set
explicit values only where a component genuinely has no contract slot — and if that happens, **flag it** rather
than invent.

---

## GUARDRAILS (must hold; gate stays green)

- **AA**: the registry-keyed `skinCharacter.contrast` test auto-covers new text/accent combos across skin ×
  mode — extend it to any new surface 1c introduces (input fields, toggle tracks, toast, empty-state text).
  Lower texture risk than 1b (these mostly sit on opaque surfaces already), but verify, don't assume.
- **AFFORDANCE — the headline for 1c**: inputs/search/select/toggle/nav must obviously read + behave as
  controls. Notched/textured ≠ unusable. This is the main way 1c can go wrong.
- **REDUCED-MOTION**: goal-ring sweep, toast enter/exit, any nav transition all ride `.rv-anim` and calm under
  `prefers-reduced-motion`.
- **VOICE**: empty states use `useVoice`, not hardcoded strings.
- **FRAUNCES**: permanent `document.fonts.check` e2e guard stays green.
- **PERF**: CSS/SVG only, no external images, GPU-friendly.
- **GATE**: core tests + typecheck + lint + build + the 4-skins × 2-modes axe e2e sweep all green.

## EYEBALL — light, not a re-vote

Direction's settled; 1c doesn't re-open "two worlds." Add the new components to `/lab/skins` so Greg can do a
**regression pass**: do the controls feel of-a-piece with the proven primitives, any affordance regressions, did
any generic SaaS styling leak back in. That's the whole check.

## STAGING

Land Stage 1c as **one reviewable PR**, **branch, not merged**. After it lands, the Stage 1 arc is complete on
Tryst + Aphelion. Then:

- **Stage 2**: Grimoire + Marrow expressed in the vocabulary.
- **Stage 3**: the five unbuilt skins, code-first per the sourcing decision (Greg gates; Design rescues only what reads flat).
- THEN resume Onboarding, finally built in the character vocabulary.

DELIVERABLE: inputs/search, select/toggle, goal ring, nav, toast, full empty states — all token-driven, no
hardcoded generic styling; goal-ring numerals match StatNumber; empties use `useVoice`; contrast test extended
to any new surface; gate green; new components on `/lab/skins` for the regression pass. Branch, not merged.
