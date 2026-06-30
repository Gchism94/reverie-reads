# Skin Character — token contract (Stage 1)

Each skin is a **place, not a palette**. On top of the existing palette/font tokens, every skin sets a
small set of *character* tokens (mode-independent) in a `[data-skin='<id>']` block in
`apps/web/src/styles/tokens.css`. Components **consume** these tokens — they never hardcode shape,
type, or motion. Adding a skin's character = fill in this table; the contrast test (below) guarantees
AA automatically.

Defined for all skins as neutral defaults in the base `:root, [data-skin]` rule. **Tryst** +
**Aphelion** are the two design-export skins (Stage 1/1b); **Grimoire** (Fantasy · illuminated
manuscript — gold-leaf, Cormorant, vellum grain, ☉ plate, archaic voice) + **Marrow** (Horror ·
gothic dread — oxblood, Playfair, ash grain, † plate, dread voice) are filled **code-first** in
Stage 2 (no export; derived from genre + palette, eyeball-gated). The five unbuilt skins inherit
defaults until Stage 3.

## The tokens

| Token | Meaning | Default | Tryst (warm/ornate) | Aphelion (cold/precise) |
|---|---|---|---|---|
| `--accent` | signature accent for marks/ornament | `var(--gold)` | `var(--gold)` | `var(--primary)` (cyan) |
| `--radius-control` | buttons / chips / inputs silhouette | `999px` | `999px` (pill) | `2px` |
| `--radius-card` | cover card radius | `12px` | `10px` | `2px` |
| `--radius-panel` | nameplate / stat / toast panels | `14px` | `14px` | `2px` |
| `--border-width` | control/card border weight | `1px` | `1px` | `1px` |
| `--ctl-clip` | corner-notch silhouette (`clip-path`) | `none` | `none` | `polygon(…9px notch…)` |
| `--label-font` | UI label / control text font | `var(--font-sans)` | `var(--font-display)` (Fraunces) | `var(--font-mono)` (Space Mono) |
| `--label-transform` | label `text-transform` | `none` | `uppercase` | `uppercase` |
| `--label-tracking` | label `letter-spacing` | `0.04em` | `0.14em` | `0.18em` |
| `--label-weight` | label `font-weight` | `600` | `600` | `700` |
| `--numeral-font` | stat-block numerals | `var(--font-sans)` | `var(--font-display)` | `var(--font-mono)` |
| `--numeral-feature` | numeral `font-feature-settings` | `normal` | `'onum' 1` (old-style) | `'tnum' 1` (tabular) |
| `--motion-ease` | per-skin transition easing | `cubic-bezier(.4,0,.2,1)` | `cubic-bezier(.4,0,.2,1)` | `cubic-bezier(.2,0,0,1)` (snappy) |
| `--motion-duration` | per-skin transition duration | `200ms` | `180ms` | `160ms` |

## Material / ornament tokens (Stage 1b — texture · nameplate · marks)
The levers that make a skin a *place*, not a recolour. Same discipline: neutral defaults render
clean; **Tryst** + **Aphelion** set their values; the rest fill the table at their stage.

| Token | Meaning | Default | Tryst | Aphelion |
|---|---|---|---|---|
| `--ambient-texture` | app-bg material (drawn behind ALL content) | `none` | gilt-paper grain (soft-light feTurbulence) | instrument grid mesh (46px) |
| `--ambient-texture-size` | texture tile | `auto` | `180px 180px` | `46px 46px` |
| `--ambient-texture-blend` | blend over bg | `normal` | `soft-light` | `normal` |
| `--ambient-texture-opacity` | texture strength | `0` | `var(--grain-opacity)` | `0.75` |
| `--ambient-texture-mask` | radial fade (mesh) | `none` | `none` | top-anchored radial |
| `--panel-fill` | **opaque** nameplate/panel base (AA floor) | `var(--card-solid)` | inherits | inherits |
| `--ornament-frame` | inset hairline-frame / bracket colour | `transparent` | gold @30% | cyan @55% |
| `--mark-accent` | card-mark glyph accent | `var(--accent)` | gold | cyan |
| `--mark-radius` | card-mark silhouette | `var(--radius-control)` | `999px` (pill) | `2px` (squared tag) |

**AA INVARIANT (the 1b headline):** texture never buries text. The ambient texture lives *behind*
content (cards/panels are opaque); panel text always sits on the opaque `--panel-fill`. The
gilt/instrument character comes from the **border + inset `--ornament-frame` + structural ornament**
(Tryst top fleuron, Aphelion corner-brackets + status dot), never a translucent wash behind text.
The card-mark accent is used only where it clears AA (real covers, dark-mode placeholders) — it falls
back to white over a light-mode placeholder, the one solid surface where a bright accent can't reach
4.5:1. `skinCharacter.contrast.test.ts` guards all of it across skin × mode.

### Kit pieces that consume it
- `.rv-skin-texture` (in `Sky`) — the ambient material layer, static, token-driven.
- `.skin-plate` — nameplate/panel material (opaque fill + border + inset `--ornament-frame` via `::before`).
- `Nameplate` — the flagship plate; per-skin structural ornament (fleuron / corner-brackets + blink dot),
  type from the contract tokens. Pass `skin` to force a skin's ornament (gallery / eyeball).
- `CoverCard` marks — `--mark-accent` + `--mark-radius`, skin- **and** mode-aware.
- `skin-card` radius on the cover — sharp Aphelion vs soft Tryst.

### Stage 1c — control fan-out (closes the Stage 1 arc for Tryst + Aphelion)
The remaining components, all consuming the existing contract (no new character invented):
- `.skin-control` — labelled controls (buttons, selects, toggles, chips, nav actions): silhouette +
  label font/transform/weight + motion.
- `.skin-field` — free-text inputs (search): silhouette **only** (no forced uppercase / display serif —
  typed text stays as typed).
- **Focus ring** — `.skin-control` / `.skin-field` get a `:focus-visible` outline in `--accent`
  (affordance: a notched/squared control still reads + behaves as a control).
- **Goal ring** (`HomeRoute`) — number uses `--numeral-font` / `--numeral-feature` (matches `StatNumber`);
  Aphelion reads as a segmented instrument gauge (ticked track + square cap).
- **Nav** (`AppShell`) — labels via `.skin-label`; action buttons via `.skin-control`.
- **Empty states** — copy from the `useVoice` pack (`empty.heading/body/cta` + `motif`), never generic.
- **Toast** — ⚠️ *no toast component exists in the app yet.* When one is built it should use `.skin-plate`
  / `--radius-panel` + `--panel-fill`, `--accent` for status, and ride `.rv-anim`. Flagged, not invented.

## Motion keyframes (in `tokens.css`)
Per-skin ambient/feedback motion. Every animated element also carries the `.rv-anim` class, so the
existing `prefers-reduced-motion` rule calms ALL of it (the night-sky/landing pattern):
- **Tryst** — `flick` (gas-lamp glow), `shim` (page-turn loading shimmer).
- **Aphelion** — `scan` (loading scan sweep), `aphtw` (instrument twinkle), `sig-blink` (status dot).

## Voice (microcopy)
Per-skin empty / toast / loading / greeting copy lives in `@reverie/core` (`skinVoice.ts`), wired like
the existing `FieldLabels`. Tryst is sultry-warm ("Your shelves wait in the dark…", "Turning the
page…"); Aphelion is spacefarer-spare ("No signal", "Scanning"). The card-mark and ornament glyphs
ride along here too (Tryst ❦✦❧ / ♥◆✓ · Aphelion ▸⊕ / brackets).

## Components that consume the contract (Stage 1 core kit)
`Button` (primary/secondary/ghost/icon), `Chip`, `Label` (shelf/section), `StatNumber`, the book-card
marks, the detail-rail nameplate, `SkinDivider`, and the empty/toast/loading voice. New components read
the tokens; they get character for free.

## Adding a skin's character (Stage 2/3)
1. Add a `[data-skin='<id>']` block to `tokens.css` filling the table above from the skin's
   genre/palette/font.
2. Add the skin's voice + glyphs to `skinVoice.ts`.
3. Run the core contrast test (`coverPlaceholder.contrast` + `skinCharacter.contrast`) — it already
   covers the new combos across skin × mode; texture must never bury text (opaque card/scrim behind
   text — the placeholder lesson).
4. Eyeball the two-worlds + warmth test; a flat/mechanical skin gets a targeted design round.

## Structural layer (bones, not paint)
Tokens carry VALUES; they can't express COMPOSITION (which parts a region has, how it's labeled, what
emblem appears) — which is why every skin rendered the same boxes in the same places. The structural
layer adds that. A small per-skin **structural config** (`SKIN_STRUCTURE` in `@reverie/core`, keyed off
`SKINS` like the token registry) is read by generic **slot components** that render a different bone:

| Slot (`SkinStructure`) | Tryst | Aphelion | Neutral |
|---|---|---|---|
| `sectionRule` | `fleuron` (gilt hairline + ❦) | `tick-rule` | `hairline` |
| `frame` | `gilt-plate` (inset frame + ❦) | `corner-bracket` | `none` |
| `tag` | `round` (gold pill) | `squared-bracket` (`[✓]RD`) | `round` |
| `progress` | `dots` | `segmented` | `bar` |
| `motif` | `fleuron` (❦ ring + emblem) | `radar` (cycle-ring + blip) | `none` |

**Hybrid**: the common slots are declarative parameters above; the one genuinely-bespoke emblem per skin
(Aphelion's radar cycle-ring, Tryst's fleuron) lives in the registered `SignatureRing` / `SignatureEmblem`
components. Slot components (`apps/web/src/components/Structure.tsx`: `SectionHeader`, `Frame`, `StatusTag`,
`ProgressMeter`, `SignatureRing`, `SignatureEmblem`) read `useStructure()` and take an optional `skin`
override. Neutral defaults render plain — adding a skin's bones = filling the `SKIN_STRUCTURE` table (+ a
signature component if its emblem is bespoke). Composed onto the real Home hero, a Library section header,
and the empty state; preview at `/lab/structure`. AA: section labels / readouts / tag text clear AA on the
page bg (registry-keyed contrast test); the radar sweep rides `.rv-anim`.

## Guardrail (non-negotiable)
Distinctive surface, **conventional interaction**. AA contrast is never traded for texture (opaque
scrims where needed). Motion always calms under reduced-motion. Character is additive to a usable,
accessible base.
