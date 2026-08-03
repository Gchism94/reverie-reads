# Skin design language audit — Report 2: common-component inventory

Audited 2026-08-03 on `main` (`bc70f96`). Facts only; companion to
`skin-design-language-nav.md`, whose mechanism labels are reused here:
**M1** hardcoded-identical in a shared component · **M2** per-skin CSS attribute rules on shared
class hooks · **M3** token consumption · **M4** per-skin registered React/TS config.

One unmerged branch touches this terrain: `feat/discover-phase-a` (`bedea5a`, not on main) changes
`CoverPlaceholder`/`coverPlaceholder.ts` (monogram spine plate, 10-recipe accent space). The rows
below describe main.

## 1. The component inventory

"Derives from tokens" lists the axes actually consumed, not the palette generally.

| Component | Lives at | Token-derived today | Hardcoded-identical (M1) | Per-skin divergence beyond color |
|---|---|---|---|---|
| **Button (component)** | [Button.tsx](../../apps/web/src/components/Button.tsx) | radius, control font/case, motion (`.skin-control`); material gradient/border/shadow/notch (`.skin-btn-*`) | h-10, px-5, text-[14px], gap | **M2** — 9 CSS blocks recast primary/secondary/icon per skin ([skin-kit.css:112-425](../../apps/web/src/styles/skin-kit.css#L112-L425)): Tryst calling-card/ticket-rule/wax-seal; Aphelion machined key (notch + 0.18em); Marrow bone plaque/engraved carve/specimen pin; Gaslight brass door plate **with screwed-end pseudo-elements** (247-264); Hearth sewn-button icon (four thread-hole dots, 339-352); Almanac ink stamp **with orange notch pseudo-element** (369-377); etc. |
| **Raw buttons** | 270 `<button>` occurrences app-wide vs **one** file importing `Button` (OnboardingRoute) | those with `.skin-control` (33 uses): radius/type/motion | each site's own Tailwind sizes; many carry inline `primary→gold` gradient recipes (e.g. [LibraryRoute.tsx:42-47](../../apps/web/src/routes/LibraryRoute.tsx#L42-L47), [ThemeToggle.tsx:43-46](../../apps/web/src/components/ThemeToggle.tsx#L43-L46)) | none beyond what `.skin-control` carries |
| **Cards** | class idiom, no component: `skin-card border border-line` (30 uses / 14 files); CoverCard grid card [CoverCard.tsx:75](../../apps/web/src/components/CoverCard.tsx#L75) | `--radius-card`; marks ride `--mark-radius` (CoverCard:103-174) | `border-line` hairline + `aspect-[2/3]`; selection ring `0 0 0 2.5px var(--primary)` (65) | none — no `[data-skin] .skin-card` rules exist; a card differs across skins only by radius token + palette |
| **Panels/hero** | `.skin-panel` (19 uses); `Frame` ([Structure.tsx:260](../../apps/web/src/components/Structure.tsx#L260)) | `--radius-panel`; Frame reads `SKIN_STRUCTURE.frame` | Frame's geometry constants (8px insets etc.) | **M4** — 10 frame bones (gilt-plate → sticker-ring), but `Frame` has only **3 app call sites** (Toolbar, HomeRoute + lab) |
| **Inputs (text)** | `.skin-field` — **2 files**: [library/Toolbar.tsx](../../apps/web/src/library/Toolbar.tsx), LabRoute; all other inputs are raw Tailwind + `border-line` | radius + `--ctl-clip`; per-skin M2 recasts (guest-book line / typewriter SUBJECT line / gel-pen line — skin-kit.css:142-149, 289-295, 420-425…) | most inputs app-wide don't use it | **M2** for the 9 field treatments, where the class is applied |
| **Select** | native `<select>` idiom, e.g. [Toolbar.tsx:125-135](../../apps/web/src/library/Toolbar.tsx#L125) | `.skin-control` radius/type | `h-10 border-line px-3 text-[13px]`, `--card` bg | none |
| **Dialogs/sheets** | [Modal.tsx](../../apps/web/src/components/Modal.tsx) (20 uses / 14 files); JustFinishedSheet; CoverSheet; ExternalSearchSheet (all through Modal or same idiom) | `--card-solid` surface, `--shadow`, `--font-display` title, `.rv-modal` → `--radius-panel` ≥sm | **mobile silhouette is 24px round-top in all nine skins** ([skin-kit.css:608-615](../../apps/web/src/styles/skin-kit.css#L608)); backdrop `rgba(0,0,0,0.5)` literal (Modal:33); italic display h2; `rounded-full` close button | none besides the ≥sm radius token |
| **Pills/chips/badges** | [Chip.tsx](../../apps/web/src/components/Chip.tsx) (24 uses / 7 files); [TropeChip.tsx](../../apps/web/src/components/TropeChip.tsx) (11 uses); MoodChip; [StatePill.tsx](../../apps/web/src/components/StatePill.tsx) (via core [statePill.ts:76](../../packages/core/src/statePill.ts#L76) `STATE_PILL_TOKENS`); StatusTag ([Structure.tsx:546](../../apps/web/src/components/Structure.tsx#L546)) | Chip/TropeChip: `.skin-control` + `--chip/--chip-border/--accent-fill`; StatePill: `--card-solid`/`--ink`/`--accent-ink` + radius 4px from core const; StatusTag: `SKIN_STRUCTURE.tag` | Chip: px-3 py-1.5 text-[12.5px]; StatePill: text-[10px] bold uppercase — **its radius/case ignore `--mark-radius`/label voice** (core-owned constants) | StatusTag is **M4**: 9 tag bones (lozenge / chamfer-chip / stamp-ring / drawn-mark / jar-label / index-tab / puffy-sticker…) — but **2 app call sites** (HomeRoute + lab) |
| **Section headers** | [Structure.tsx:44](../../apps/web/src/components/Structure.tsx#L44) `SectionHeader` (6 uses / 5 files incl. lab); everywhere else the idiom is a raw `.skin-label` span (25 uses / 14 files) | `.skin-label` quartet; `SKIN_STRUCTURE.sectionRule` (10 bones: fleuron/docket/stitched/…) | raw-span sites carry their own sizes/colors | **M4** where SectionHeader is used; plain hairline or nothing where it isn't |
| **Empty states** | idiom, no component — canonical: [LibraryRoute.tsx:30-58](../../apps/web/src/routes/LibraryRoute.tsx#L30-L58) | `SignatureEmblem` (M4 motif) + **per-skin voice copy** `SKIN_VOICE` via `useVoice()` ([skin/labels.ts:20-24](../../apps/web/src/skin/labels.ts#L20)) + display italic heading | layout, sizes, the `primary→gold` CTA gradient recipe | **M4** — copy + emblem per skin; the strongest per-skin body surface that exists today |
| **Toasts** | [WriteErrorToast.tsx](../../apps/web/src/components/WriteErrorToast.tsx), [UpdateToast.tsx](../../apps/web/src/components/UpdateToast.tsx) | colors (`--accent-ink` border, card-over-bg, `--shadow`) | `rounded-2xl` literal; layout | none |
| **Tabs/segmented** | one instance: Library grid/series toggle [Toolbar.tsx:138-163](../../apps/web/src/library/Toolbar.tsx#L138) | `.skin-control` shell + `--radius-control` on segments, `--accent-fill` active | h-10, p-1, text-[12.5px] | none |
| **Toggle** | [Switch.tsx](../../apps/web/src/components/Switch.tsx) (4 uses / 2 files) | `--radius-control` (track + knob), `--field` | `primary→gold` gradient recipe when on; white knob literal (`bg-white`) | none |
| **List rows** | idiom: `skin-card border-line px-3 py-2.5` rows (e.g. [DiscoverRoute.tsx:143](../../apps/web/src/routes/DiscoverRoute.tsx#L143); SeriesRoute rows) | `--radius-card` + palette | paddings/sizes per site | none |
| **Cover placeholder** | [CoverPlaceholder.tsx](../../apps/web/src/components/CoverPlaceholder.tsx) (via CoverImage — 26 uses / 21 files) | accent recipe + `color-mix` colors from core [coverPlaceholder.ts](../../packages/core/src/coverPlaceholder.ts); `--ph-*` plate palette | plate geometry per variant | **M4 at full strength** — 9 designed plates (`SKIN_STRUCTURE.placeholder`, [skinStructure.ts:134-144](../../packages/core/src/skinStructure.ts#L134)) |
| **Spines** | [Spine.tsx](../../apps/web/src/components/Spine.tsx) (SpineShelf, ShelvesRoute, ShelfRoute) | `--spine-hi/lo/sheen/muted/title/emboss` + `SKIN_STRUCTURE.spine` (binding/band/colophon/label) | anatomy constants | **M4 at full strength** — 9 bindings, 8 band styles, 9 colophons, 6 label kinds |
| **Nameplate** | [Nameplate.tsx](../../apps/web/src/components/Nameplate.tsx) — **2 call sites** (BookDetailRail + lab) | `.skin-plate` material (`--panel-fill`, `--ornament-frame`, `--border-width`) | plate paddings | **M4** — per-skin `PLATE` ornament map, all nine filled ([Nameplate.tsx:35-241](../../apps/web/src/components/Nameplate.tsx#L35)) |
| **Progress** | `ProgressMeter` ([Structure.tsx:741](../../apps/web/src/components/Structure.tsx#L741)) — 2 call sites (HomeRoute + lab) | `SKIN_STRUCTURE.progress` (10 bones: vertebrae/thread-board/cross-stitch/sun-rise/…) | geometry | **M4**, thinly deployed |
| **FAB** | mobile only, in the nav ([AppShell.tsx:366-379](../../apps/web/src/components/AppShell.tsx#L366)) | color stops | `rounded-full` + gradient recipe | none |
| **BackLink** | [BackLink.tsx](../../apps/web/src/components/BackLink.tsx) (13 uses / 7 files) | none — unstyled, caller passes className | — | none |

### The structural observation the table keeps repeating

The M4 structural system (`SKIN_STRUCTURE`, [skinStructure.ts:160-289](../../packages/core/src/skinStructure.ts#L160) —
**all nine skins have full rows**; the comment at 158-159 saying "the other seven inherit
NEUTRAL_STRUCTURE" is stale) is richest exactly where deployment is thinnest: Frame 3 call sites,
StatusTag 2, ProgressMeter 2, SignatureRing 2, Nameplate 2 — while the high-frequency surfaces
(cards 30, chips 24+11, modals 20, raw buttons 270) ride M1 + M3 only. The spine and the cover
placeholder are the two components where M4 reaches every reader routinely (every shelf,
every coverless book).

## 2. Cohesion at the nav/body seam, per skin

Method: report 1 §§1-4 (nav voice) held against this inventory (body voice). "Shares type voice"
is factual in all nine — `.skin-label`/`--font-display` govern both sides. The seams are shape,
material, and motion. One line each, as observed:

- **Tryst** — nav: brass rail + wax-seal-adjacent gilt gradients; body: 999px-pill controls and 12px cards agree, but the ticket-rule secondary and guest-book field (M2) appear nowhere in the nav's footer controls, which are generic 70%-card washes. Seam: **modest — material idiom thins from brand block to footer.**
- **Grimoire** — nav: incipit band + quatrefoil divider; body: 2px cartouche controls, ruled-incantation secondaries. Seam: **nav items' 10px pills and 16% wash sit against a 2px/8px manuscript body; the illuminated-border Frame exists (M4) but reaches 3 call sites.**
- **Aphelion** — nav: engraved tick rail; Add = the notched machined key (the one full-material nav control); body: 2px radii, mono labels, corner brackets. Seam: **smallest of the nine** — the M1 10px item radius and 24px mobile sheet are the only round things in an otherwise machined skin.
- **Marrow** — nav: carved lintel + fractured divider (its two strongest objects anywhere in the app); body: 0px/2px cuts, engraved carve buttons. Seam: **the nav ornaments outclass every body surface, while the nav's own items/sheet/FAB are the roundest things in the skin** (report 1 §6).
- **Gaslight** — nav: slate rule + brass pin; body: typewriter mono labels, screwed brass door-plate CTA (M2). Seam: **the pin/screw hardware motif exists at exactly two places (chrome, primary button) and nothing between them; everything else is generic hairline boxes.**
- **Marginalia** — nav: proof-red slug rule; body: pencilled corrections, caret rules, drawn marks (M4 tags — 2 call sites). Seam: **proof-red appears in the nav rail and the secondary underline, but the body's dominant chrome is untinted `border-line` boxes; the editor's-desk conceit lives mostly in low-traffic M4 slots.**
- **Hearth** — nav: stitched runner; body: no-uppercase labels, 999px pills, dashed-thread secondaries, sewn-button icons. Seam: **stitching appears in the rail and in `.skin-btn-secondary`/`.skin-field` dashes, but cards/rows/dialogs have no thread idiom; bouncy motion tokens never reach the nav (M1 motion).**
- **Almanac** — nav: full-bleed ink band; body: 2px radii, 700-weight Archivo labels, orange-notch stamp CTA, index-tab tags (M4 — 2 call sites). Seam: **the ink-band/index-tab system is the skin's signature and exists in the chrome + two Structure slots; the everyday body (cards, chips, selects) is indistinguishable from a generic 2px-radius skin.**
- **Firstlight** — nav: gel dot run; body: no-uppercase Karla, 999px gel pills, sticker-ring icons, dark-only stars. Seam: **gel/sticker material reaches buttons (M2) but not cards/sheets; the 24px `rv-modal` is actually closest to this skin's native shapes — the one skin where the M1 constants agree with the body.**

## 3. The token vocabulary — every axis `SKIN_TOKENS`/tokens.css can express today

From the full custom-property census of [tokens.css](../../apps/web/src/styles/tokens.css)
(§ counts = how many skin/mode blocks define it):

- **Color** (the bulk): page (`--bg0/--bg1/--bg`), surfaces (`--card/--card-2/--card-solid/--field/--chip/--chip-border/--plate/--paper/--paper-ink/--panel-fill`), ink (`--ink/--muted/--accent-ink`), brand/accents (`--primary/--on-primary/--accent/--accent-fill/--violet/--blue/--gold/--gold-deep/--tertiary/--secondary`), lines (`--line/--hair/--ornament-frame`), ambient (`--star/--fog/--vignette/--glow-a..d`), material sub-palettes (`--cta-hi/lo/ink/border`, `--seal-*` Tryst, `--spine-hi/lo/sheen/muted/title/emboss`, `--ph-a/b/c/ink/muted/glow`, `--slate/--thread/--rubric/--sky/--desk-edge`, `--mark-on-ph/--mark-accent`).
- **Typography**: four family roles (`--font-display/-sans/-mono`, folio-only `--font-hand`, one `--font-body`); the label voice quartet (`--label-font/-transform/-tracking/-weight`); control type (`--control-font/-transform`); numerals (`--numeral-font/-feature`).
- **Shape**: `--radius-control/-card/-panel`, `--mark-radius`, `--ctl-clip` (a full clip-path — the only non-radius silhouette axis), `--border-width` (defined once, in the shared block).
- **Elevation**: `--shadow`, `--cta-shadow`.
- **Motion**: `--motion-ease`, `--motion-duration` — two axes total; no per-role or per-distance scale.
- **Texture**: `--ambient-texture/-size/-opacity/-blend/-mask` (data-URI SVG or gradient per skin), `--grain-opacity`; **no shipped surface mounts `.rv-skin-texture` outside /lab** (report 1 §5).
- **State**: `--ghost-opacity`.

What the vocabulary has **no axis for** (observed absences, not judgments): spacing/density,
type sizes, border style (solid/dashed/double is per-skin CSS only), per-component radii beyond
the three roles, ornament placement/composition (that is `SKIN_STRUCTURE`'s job), and any second
motion role. Divergences that exceed the vocabulary are implemented as M2 CSS blocks
(skin-kit.css) or M4 registries — the four-mechanism split in report 1 §0 is exactly the shape of
this gap.

## 4. The contrast-registry surface (what a redesign must not break)

Registry-keyed suites in `packages/core` — each enumerates `SKINS` × both modes and fails when a
new skin lacks a token row:

| Suite | Guards |
|---|---|
| [skinCharacter.contrast.test.ts](../../packages/core/src/skinCharacter.contrast.test.ts) | the kit's text-on-surface pairs: ink/muted on card + card-2; plate text on `--panel-fill`; accent eyebrow on plate; trope-chip both states; typed text in `--field`; section-header readout + accent StatusTag text on bg; taste-tier three-tier text on card; spine title/author minimums on `--card-solid`; Fable-5 designed-surface pairs |
| [coverPlaceholder.contrast.test.ts](../../packages/core/src/coverPlaceholder.contrast.test.ts) | placeholder glyph recipe over every accent (4 on main; 10 on the unmerged branch) + the paper-label plates (`PAPER_TOKENS`, six skins) |
| [coverGradient.contrast.test.ts](../../packages/core/src/coverGradient.contrast.test.ts) | generated cover-gradient space vs plate type |
| [moodChip.contrast.test.ts](../../packages/core/src/moodChip.contrast.test.ts) | mood chip ink-on-card + accent-ink ring/dot |
| [ownershipControl.contrast.test.ts](../../packages/core/src/ownershipControl.contrast.test.ts) | selected ownership pill + borrowed badge |
| [seriesArranger.contrast.test.ts](../../packages/core/src/seriesArranger.contrast.test.ts) | series-index arranging rows |
| [spineTint.contrast.test.ts](../../packages/core/src/spineTint.contrast.test.ts) | per-book cover tint vs spine title/author on every recorded binding |
| [statePill.contrast.test.ts](../../packages/core/src/statePill.contrast.test.ts) | the borrowed/DNF pill (`--ink` on `--card-solid`) — the surface axe structurally cannot measure |

Not registry-guarded: the nav (no contrast suite reads its washes/active states), buttons'
`.skin-btn-*` materials as such (only their text-pair proxies in skinCharacter), toasts, Modal,
Switch. The e2e axe sweep covers four skins × both modes across the route list including the nav
([a11y.spec.ts:364-380](../../apps/web/e2e/a11y.spec.ts#L364)).

## 5. Blast radius — call-site counts (apps/web/src, `.tsx`)

| Surface | Files | Occurrences |
|---|---|---|
| `.skin-control` | 17 | 33 |
| `.skin-card` | 14 | 30 |
| `<CoverImage` | 21 | 26 |
| `.skin-label` | 14 | 25 |
| `<Chip` | 7 | 24 |
| `<Modal` | 14 | 20 |
| `.skin-panel` | 10 | 19 |
| `.skin-numeral` | 6 | 15 |
| `<Label`/`<StatNumber` | 2 | 15 |
| `<BackLink` | 7 | 13 |
| `<TropeChip` | 5 | 11 |
| `<StatusTag` | 2 | 8 |
| `<Button` (component) | 1 | 7 |
| `<SectionHeader` | 5 | 6 |
| `.skin-btn-primary` | 4 | 5 |
| `<StatePill` | 2 | 5 |
| `<SkinDivider` | 3 | 4 |
| `<Switch` | 2 | 4 |
| `<Frame` | 3 | 3 |
| `.skin-plate` | 3 | 5 |
| `<Spine` | 2 (SpineShelf:165 + lab) — SpineShelf itself renders on ShelvesRoute/ShelfRoute | 2 |
| `<Nameplate`, `<ProgressMeter`, `<SignatureRing`, `<SignatureEmblem`, `<MoodChip`, `<TasteTier`, `<CoverPlaceholder` | 2 each | 2 each |
| `.skin-field` | 2 (Toolbar + lab) | 2 |
| `.rv-modal` | 1 (Modal) | 1 |
| `.rv-chrome` | 1 (AppShell) | 2 |
| raw `<button>` | — | 270 |
| raw `rounded-*` utilities | — | 369 total (216 `rounded-full`, 76 `rounded-xl`, 33 `rounded-2xl`, 22 `rounded-lg`, 22 others) |

Reading the two raw counts against the kit counts: shape decisions live in Tailwind literals at
~11× the rate they live in the radius tokens (369 raw radii vs 33 `.skin-control` + 30
`.skin-card` + 19 `.skin-panel`), and interactive elements bypass the Button component ~38:1
(270 raw buttons vs 7 uses in 1 file) — though 33 of those raw sites reclaim the skin voice via
`.skin-control` classes.
