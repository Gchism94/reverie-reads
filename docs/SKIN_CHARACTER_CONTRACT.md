# Skin Character — token contract (Stage 1)

Each skin is a **place, not a palette**. On top of the existing palette/font tokens, every skin sets a
small set of *character* tokens (mode-independent) in a `[data-skin='<id>']` block in
`apps/web/src/styles/tokens.css`. Components **consume** these tokens — they never hardcode shape,
type, or motion. Adding a skin's character = fill in this table; the contrast test (below) guarantees
AA automatically.

Defined for all skins as neutral defaults in the base `:root, [data-skin]` rule; **Tryst** and
**Aphelion** are the two designed skins (Stage 1). The rest inherit defaults until their stage.

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

## Guardrail (non-negotiable)
Distinctive surface, **conventional interaction**. AA contrast is never traded for texture (opaque
scrims where needed). Motion always calms under reduced-motion. Character is additive to a usable,
accessible base.
