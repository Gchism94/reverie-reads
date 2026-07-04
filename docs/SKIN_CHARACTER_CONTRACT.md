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
| `spine` | leather / gilt bands / ❦ colophon / gilt title panel | brushed metal / tick bands / callsign / status-LED foot, mono | plain legible spine |

**Spine** (`SpineStyle`) is the first *signature component*: a book spine composed for its own narrow,
edge-on read (vertical-rl title, head+tail bands, head label, tail colophon) — NOT a rotated cover.
`Spine` (`components/Spine.tsx`) + the retrofitted `SpineShelf` render it; CSS/SVG only. Data reality:
the Book model has **no page count or trim**, so width (thickness) + height (trim) come from a stable
per-book hash (`spineDims`) — deterministic, varied, never uniform; wire `thickness` to a real page
field if one is added. Titles use `fitSpineTitle`: scale-to-fit → 13px floor → truncate (the colophon
stays anchored), so a title + subtitle monster degrades instead of breaking the spine.

**Hybrid**: the common slots are declarative parameters above; the one genuinely-bespoke emblem per skin
(Aphelion's radar cycle-ring, Tryst's fleuron) lives in the registered `SignatureRing` / `SignatureEmblem`
components. Slot components (`apps/web/src/components/Structure.tsx`: `SectionHeader`, `Frame`, `StatusTag`,
`ProgressMeter`, `SignatureRing`, `SignatureEmblem`) read `useStructure()` and take an optional `skin`
override. Neutral defaults render plain — adding a skin's bones = filling the `SKIN_STRUCTURE` table (+ a
signature component if its emblem is bespoke). Composed onto the real Home hero, a Library section header,
and the empty state; preview at `/lab/structure`. AA: section labels / readouts / tag text clear AA on the
page bg (registry-keyed contrast test); the radar sweep rides `.rv-anim`.

## Fable 5 incorporation — contract extensions (Stage I, 2026-07-02)
The design pass's slot table (`sectionHeader · panelFrame · statusTag · progressMeter · divider ·
nameplate · signatureMotif · spine · placeholderCover · voicePack` + the controls layer) matches the
shipped contract slot-for-slot. Three additive extensions, all neutral-defaulted (no skin regresses):
- **`SkinStructure.placeholder`** — placeholderCover becomes a per-skin slot (`'plain' |
  'cloth-boards' | 'specimen-plate'`, union extended per designed skin), the same registered-component
  pattern as `motif`. `CoverPlaceholder` selects the plate treatment; `'plain'` is the previous
  neutral title/author plate.
- **`SkinVoice.miss` + `SkinVoice.milestone`** — the voice pack gains the search-miss line (the
  "nothing matches" surface) and the reading-goal milestone line, completing the specimen's
  EMPTY · MISS · LOADING · MILESTONE quartet.
- **`--control-font`** — control text may split from label text (Tryst: Hanken caps labels,
  Fraunces controls). Defaults to `var(--label-font)`; `.skin-control` now reads it.

## Fable 5 incorporation — contract extensions (Stage III, 2026-07-02)
Chunks 3–4 fill the SAME slot table (audited slot-for-slot; no drift). Additive extensions, all
neutral-defaulted:
- **`--font-hand`** — Marginalia's margin hand (Caveat): annotations only, never body copy.
  Defaults to `var(--font-display)`.
- **`--sky`** — Firstlight's one gradient (vertical, night at the top), consumed by its spine,
  placeholder, and ambient glows. Defaults to a flat card-solid gradient.
- **`--mark-on-ph`** — the card-mark colour over a PLACEHOLDER scrim. The old mode-keyed rule
  ("accent in dark, white in light") assumed dark mode = dark surfaces; the **non-inverting skins**
  (Marginalia's bond page, Almanac's buff manual) keep light placeholders at night, where the accent
  can't reach AA on the mid scrim. The default preserves the old behaviour; those two skins override
  to white in dark. `CoverCard` reads the token instead of branching on mode.
- **Union growth on existing slots** (not new slots): `sectionRule` +`caret-rule | stitched |
  index-rule | dotted`, `frame` +`margin-rule | stitched-inset | record-card | sticker-ring`, `tag`
  +`drawn-mark | jar-label | index-tab | puffy-sticker`, `progress` +`page-lines | cross-stitch |
  rule-ticks | sun-rise`, `motif` +`caret | button | tab | sun`, spine `binding` +`galley | linen |
  manual | sky`, `band` +`pencil | stitched | ink-block | gel`, `colophon` +`caret | button | rule |
  sun`, `label` +`ref-no`, `placeholder` +`proof-sheet | linen-board | buff-manual | sky-mockup`.
- **The non-inverting palette pattern** — Marginalia's dark mode keeps the PAGE light (`--bg0` stays
  bond; the dark desk lives in `--vignette` + shadows), per the chunk-4 composed screen ("dark mode
  darkened the desk; the page never moved"). Almanac dark leads with its ink-block surfaces while
  the buff lives on the paper slots (spines, manuals, record cards). The `sticker-ring` frame
  re-scopes `--ink`/`--muted`/`--accent-ink` locally so white stickers hold AA at 2 a.m.
- **`PLACEHOLDER_BG_MIX` / `FG_MIX`** lowered (.18→.10, .5→.30): the plain fallback plate's accent
  pull met its first mid-luminance cards (lamplit linen, ink-block); shrinking the pull only ever
  raises contrast, so every existing skin stays safe.

## Marks semantics (MVP polish, verdict rule — non-negotiable)
One glyph, one meaning, every skin: **★ star = rating** (and only rating) · **bookmark ribbon =
priority read** (Priority TBR — `BookmarkGlyph`, filled = is-priority, outline = make-priority) ·
**♥ heart = favorite**. Each skin styles the glyphs in its own language (colour, tag silhouette,
material), but the MEANING never varies by skin. Audited across all nine × both modes at adoption:
priority marks were stars (Home chips, shelf headers, Shelves modal/list, detail-rail list rows,
the structure lab) — all now the ribbon; the Indie "your store" star became a ✓; favorites were
already hearts everywhere. Known future hazard, flagged: the Firstlight sheet assigns a gold star
to its READ mark — if that ever lands it must restyle (star is reserved for rating).

## Display renames (verdict-approved)
`folio` → **Marginalia**, `bloom` → **Firstlight**, `umbra` → **Gaslight** — display names only
(`SKINS[id].label`); the ids are stored profile keys and stay stable everywhere.

## Guardrail (non-negotiable)
Distinctive surface, **conventional interaction**. AA contrast is never traded for texture (opaque
scrims where needed). Motion always calms under reduced-motion. Character is additive to a usable,
accessible base.
