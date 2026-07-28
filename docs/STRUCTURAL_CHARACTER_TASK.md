# Reverie — implementation (Code): STRUCTURAL CHARACTER layer (2026-06-30)

> A new, cross-cutting stage on top of the completed skin system. Append to `docs/CHARACTER_IMPLEMENTATION_TASK.md`.
> Independent of the import chain (#10/#11/#13) — branch off main once that chain lands.

## The diagnosis (why this exists)

The skins adopted the **paint, not the bone**. On the real app screens, every skin renders the _same boxes in
the same places at the same sizes_ — same hero card, same nav, same goal-ring slot, same empty-state panel —
and only font, color, texture, border, and one control corner change. That's a reskin.

The Design specimens are NOT reskins of each other. Aphelion frames its card in **corner brackets**, labels the
region **"SECTOR 02 · DRIFT"** with a right-aligned readout over an **instrument tick-rule**, carries a **radar
cycle-ring**, a **segmented progress meter**, and **squared bracketed callsign tags**. Tryst divides with a
**gilt hairline centered on a ❦ fleuron** and sets its card as a **warm gilt plate**. The Aphelion specimen even
names its parts — "CALLSIGN PLATE · SECTOR LABEL · READOUT · CYCLE RING" — and the app has none of those as
distinct structures. They collapsed into the one generic card-and-label both skins share.

**Root cause**: the skin contract is a _styling_ contract — it carries values (radius, type, color, texture,
border, inset ornament). Values cannot express **composition**: which elements exist, how a section is labeled,
what motif appears. And the AA architecture deliberately kept character to "border + inset ornament, never a
wash behind text," which is correct and is exactly why the bones stayed generic. The `/lab/skins` specimen
passed the 1b eyeball because the specimen displays the full vocabulary; the real screens only consumed the
value half and were never the thing under review.

This stage adds the missing layer: **structure, per skin.** It's additive — what's on screen is good and stays.

## The architecture — extend the contract from _values_ to _slots + values_

Recommended (confirm/refine): a **hybrid structural contract**, to keep "fill the table to add a skin" true for
most of it and limit bespoke code to the one irreducible piece per skin.

- **Declarative structural config for the common slots.** Most "structural" differences are _parameters_, not
  separate components: a section header is always label + rule + optional readout — the rule is `tick-rule`
  vs `fleuron-hairline`; tags are `squared-bracket` vs `round-gold`; a frame is `corner-bracket` vs
  `gilt-plate`. Generic slot components read a per-skin structural config (keyed off `SKINS`, same pattern as
  the token registry) and render the right structure. Adding a skin = filling the structural table.
- **One bespoke signature-motif slot per skin.** The emblem that's genuinely custom — Aphelion's radar
  cycle-ring, Tryst's fleuron — is a registered per-skin component. Exactly one signature piece per skin;
  everything else stays declarative.
- Neutral defaults so unset skins render plain (no regression).

Honest tradeoff: this ships per-skin _structure_ (config + one component), not just CSS values, so a new skin
is a bit more than a color table. The hybrid keeps that cost to the signature motif; accept it — structural
distinctness is the whole point and can't come from values.

## STEP 0 — extract the real structures (gate; Tryst + Aphelion are already defined)

The two reference skins' structures exist in the `/lab/skins` specimen + the decoded export — the same source
the texture recipes came from. Pull them as specs, don't invent:

- **SectionHeader**: Aphelion tick-rule geometry + "SECTOR NN · LABEL" + right readout number; Tryst
  fleuron-centered gilt hairline + serif label + gold count ("Velvet & Vow ——— 18 titles").
- **PanelFrame / CardFrame**: Aphelion corner-bracket geometry; Tryst gilt inset plate (+ fleuron at head).
- **StatusTag row**: Aphelion squared bracketed callsigns (`[✓]RD`, `OWN`, `★FAV`); Tryst round gold marks.
- **ProgressMeter**: Aphelion segmented blocks; Tryst spice dots / fill.
- **SignatureMotif**: Aphelion radar cycle-ring; Tryst ❦ fleuron emblem.
- **Divider**: Aphelion sector tick-rule; Tryst fleuron hairline.
  Confirm real values before building. No reverse-engineering on the structural layer.

## STEP 1 — define the structural slot contract

Add the slot roles above to the contract (config schema + `SignatureMotif` component slot) and document them in
`docs/SKIN_CHARACTER_CONTRACT.md` so Grimoire/Marrow and the five code-first skins fill the same table. Neutral
defaults for every slot.

## STEP 2 — implement the slots for Tryst + Aphelion

Build the generic slot components + the two skins' declarative configs + their two signature motifs, from STEP 0.

## STEP 3 — compose REAL screens from the slots (prove first, then fan out)

Retrofit the highest-visibility _composed_ surfaces — **the home hero card, one Library section (header + card
grid), and the empty state** — to compose from the slots instead of the generic card-and-label. Prove the
structural layer there across both skins before fanning out to the rest of the app. This is "prove first" again,
but the proof surface is the **real app**, not the specimen.

---

## GUARDRAILS / GATE

- **EYEBALL ON REAL SCREENS — the headline lesson of this stage.** The 1b verdict ran on the specimen and that's
  how the gap slipped through. Put the retrofitted home + library + empty state on a route Greg can render
  **with auth/DB if needed** (or a seeded preview), Tryst vs Aphelion side by side, both modes. The verdict is
  rendered on the product, not the showcase. Do NOT call structure done off `/lab/skins` alone.
- **AA**: section labels, readouts, and tag text hit AA across skin × mode; extend the registry-keyed contrast
  test to the new structural text surfaces. Motifs are non-text.
- **AFFORDANCE**: corner brackets, plates, squared tags, etc. must not impair usability or hit targets.
- **LAYOUT**: per-skin structure must stay responsive and not break the shared grid or overflow on long
  content / small screens. Structure varies; the layout contract doesn't.
- **REDUCED-MOTION**: radar cycle-ring and any structural animation ride `.rv-anim`.
- **PERF**: CSS/SVG only, no images, GPU-friendly.
- **GATE**: core + typecheck + lint + build + the axe e2e sweep all green.

## STAGING

Land as a **focused PR, branch not merged**, scoped to: the structural contract + slots + Tryst/Aphelion +
the three proven screens. Greg eyeballs **on the real screens**. Then:

- **Fan structure to the remaining app surfaces** (detail rail, nav, stats, planner, orders) once direction's confirmed.
- **Fill the structural table for the other skins.** Where a skin's structure is inventable in code, code-first;
  where it isn't (a skin with no clear structural identity), it needs a Design reference — same code/Design
  routing as the flat-skin rescue loop, and this is very likely _why_ some skins read flat: no bone.
- Spines are the first new signature component and get their own Design treatment (separate prompt).

DELIVERABLE: a hybrid structural contract (declarative slot config + per-skin signature-motif slot); generic
slot components; Tryst + Aphelion structural configs + motifs extracted from the reference; home hero + one
Library section + empty state composed from the slots; contrast test extended; eyeball staged on the real
screens both skins/modes; gate green. Branch, not merged.
