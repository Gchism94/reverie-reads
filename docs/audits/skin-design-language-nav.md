# Skin design language audit — Report 1: the nav, deconstructed

Audited 2026-08-03 on `main` (`bc70f96`). Facts only; file:line for every claim. The companion
component inventory is `skin-design-language-components.md`.

## 0. The architecture fact everything else hangs on

**There is one nav, not nine.** `AppShell.tsx` renders a single desktop sidebar
([AppShell.tsx:83-230](../../apps/web/src/components/AppShell.tsx#L83-L230)), a single mobile top
bar (233-247), and a single mobile bottom tab bar + More sheet (279-398), for all nine skins. No
skin has its own nav component, and the nav component itself contains **zero** skin conditionals —
`grep`ing AppShell for `data-skin`, `useEffectiveSkin`-driven branching on identity finds only two
reads: the skin's display label for the "Choose skin" button (39-43) and `chromeLine` for the brand
block (86-87, 137).

Per-skin nav character arrives through **four distinct mechanisms**, and every per-skin claim below
names which one carries it:

| # | Mechanism | Where | Nature |
|---|---|---|---|
| M1 | Hardcoded-identical in the shared component | `AppShell.tsx` Tailwind classes + inline styles | Same in all nine skins; changing it changes all nine at once |
| M2 | Per-skin CSS attribute rules on shared class hooks | `[data-skin='x'] .rv-chrome`, `[data-skin='x'] .skin-btn-*` in [skin-kit.css](../../apps/web/src/styles/skin-kit.css) | One renderer, nine CSS blocks; a skin missing its block falls to a neutral base rule |
| M3 | Token consumption | `.skin-label`, `.skin-control` classes + `var(--…)` inline | Reachable from tokens.css; retuning a skin's tokens re-voices the nav with no component change |
| M4 | Per-skin registered React config | `SKINS[id].chromeLine` ([skins.ts:40](../../packages/core/src/skins.ts#L40)), `SkinDivider`'s `MOTIFS` record ([SkinDivider.tsx:7](../../apps/web/src/components/SkinDivider.tsx#L7)) | A typed per-skin table consumed by one renderer — same pattern as `SKIN_STRUCTURE` |

M1 and M2 are the architecturally opposite findings the brief asked to keep separate:
**hardcoded-identical** (M1) means no skin can differ there today; **skin-conditional CSS** (M2)
means each skin already owns a slot and fills it independently.

## 1. The shared skeleton (M1 — identical in all nine skins)

### Shape language
- Nav items: `rounded-[10px]` rectangles ([AppShell.tsx:45-46](../../apps/web/src/components/AppShell.tsx#L45-L46), the `navBase` string). This is a **literal 10px**, not `--radius-control` — in Marrow (radius 0) and Aphelion (radius 2) the nav item is the roundest rectangle in the skin; in Tryst/Hearth/Bloom (999px pill controls) it is the squarest.
- Collapse button: `rounded-[10px]` (218).
- Brand tile: `rounded-[9px]` square, 34×34 (117).
- Skin-swatch dot: `rounded-[4px]` (177).
- Mobile More sheet: `rounded-2xl` panel (312), `rounded-xl` items (326).
- Mobile FAB: `rounded-full` 44px circle (370).
- Nothing in the nav is a non-rounded-rectangle silhouette **except** what M2 draws under the brand (§3) — the shell itself has no notch, chamfer, or cut in any skin.

### Border and shadow idiom
- Sidebar: one right hairline `1px solid var(--line)` over a translucent blur wash — `color-mix(in srgb, var(--card) 64%, transparent)` + `backdrop-blur-lg` (100-105).
- Active nav item: a 16% primary wash + a 2px inset left bar — `background: color-mix(in srgb, var(--primary) 16%, transparent); boxShadow: inset 2px 0 0 var(--primary)` (63-70). Identical treatment in all nine; only `--primary` varies (M3).
- Footer: `border-t` hairline in `--line` (161-163).
- Tab bar: `border-t` in `--line` over `color-mix(in srgb, var(--bg) 84%, transparent)` + blur (354-361).
- More sheet: `border-line` + `var(--shadow)` (312-318). `--shadow` is per-skin (M3).
- FAB: `var(--shadow)` + a hardcoded `linear-gradient(135deg, var(--primary), var(--gold))` (370-375). The gradient *recipe* is M1; its two stops are M3.
- Brand tile: same hardcoded `primary→violet` gradient recipe + `var(--shadow)` (118-123).

### Type
- Item labels wear `.skin-label` (75) → `--label-font/-transform/-tracking/-weight` (M3; per-skin values in §2). The tab-bar labels do too (272, 338, 392).
- Brand wordmark: `var(--font-display)`, weight 600, italic on mobile (131-133, 238-239) — the skin's display face by token.
- Sizes are M1 literals: items `text-[13.5px] font-medium` (46), icons `text-[14px]` in a `w-5` cell (72), chromeLine `text-[10px]` (136), footer controls `text-[12px]` (170, 190, 203), tab labels `text-[11px] font-semibold` inside the `tabLink` string (257-258), tab icons `text-[17px]` (269).
- `tabLink` also hardcodes `uppercase tracking-[0.08em]` (258) on the container. The label `<span>` inside carries `.skin-label`, whose own `text-transform`/`letter-spacing` govern the label's rendered case and tracking (text-transform does not cascade into an element that sets its own; letter-spacing inherits but is overridden by `--label-tracking`). Net: the hardcoded `uppercase tracking-[0.08em]` governs no visible label text in skins whose `--label-transform` is `none` (Hearth, Bloom).
- Nav icons are Unicode glyphs from the `NAV` table (14-26), token-colored text — no raster, no SVG, same glyph set in all nine skins.

### Motion
- Sidebar collapse: `transition-[width] duration-200 ease-out motion-reduce:transition-none` (100) — **hardcoded 200ms/ease-out, not `--motion-duration`/`--motion-ease`**. The nav does not participate in the skin motion tokens.
- Nav links / tab links: `transition-colors` (46, 258) with no explicit duration — Tailwind's default 150ms `cubic-bezier(0.4,0,0.2,1)`, again outside the motion tokens. (The one nav element that *does* ride skin motion is the Add button, via `.skin-control` — see §4.)
- The More sheet has no open/close transition — it conditionally mounts (309).
- No nav-owned animation exists. Ambient motion (star twinkle) belongs to `Sky`, mounted at the route root ([RootRoute.tsx:77](../../apps/web/src/routes/RootRoute.tsx#L77)), behind the whole app, not the nav.

### Density and rhythm
- Sidebar: `px-3.5 py-4`, width 248 expanded / 76 collapsed (100-102); items `px-3 py-2.5` with `gap-0.5` between (46, 51); icon cell `w-5` + `gap-3` to the label (46, 72).
- Footer controls: `h-9`, `gap-1.5/gap-2` (165-213); Add button `h-10` (150).
- Tab bar: 5-column grid (363), items `pb-1.5 pt-2` (258); FAB raised `-translate-y-3` (370).
- All of it identical across skins; no per-skin density axis exists anywhere in the nav.

## 2. What the nav takes from tokens (M3), per skin

The nav's token diet: `--card --bg --line --muted --ink --primary --violet --gold --on-primary
--shadow --accent-fill --font-display` + the `.skin-label` quartet + (Add button only) the
`.skin-control`/`.skin-btn-primary` sets. The per-skin values that change the nav's *voice* (from
[tokens.css](../../apps/web/src/styles/tokens.css) character blocks at lines 119, 147, 178, 206,
241, 269, 299, 332, 368, and the mode blocks from 399 on):

| Skin | Brand/display face | Label voice (`.skin-label`) | Motion tokens (unused by nav shell) |
|---|---|---|---|
| Tryst | Fraunces | Hanken Grotesk · uppercase · 0.16em · 600 | 180ms · standard |
| Grimoire | Cormorant Garamond | Spectral · uppercase · 0.16em · 600 | 220ms · softened |
| Aphelion | Space Grotesk | **Space Mono** · uppercase · 0.18em · 700 | 160ms · sharp |
| Marrow | Playfair Display | Libre Franklin · uppercase · 0.14em · 600 | 240ms · decel-heavy |
| Gaslight (umbra) | Libre Caslon Text | **Courier Prime (mono)** · uppercase · 0.12em · 600 | 200ms · standard |
| Marginalia (folio) | EB Garamond | EB Garamond · uppercase · **0.22em** · 600 | 220ms · softened |
| Hearth | Bitter | Varela Round · **none** · 0.02em · 600 | 220ms · **bouncy** (1.3 overshoot) |
| Almanac | Source Serif 4 | Archivo · uppercase · 0.12em · **700** | 140ms · standard |
| Firstlight (bloom) | Baloo 2 | Karla · **none** · 0.04em · 700 | 200ms · **bouncy** (1.4 overshoot) |

(Font stacks: tokens.css mode blocks; loaded pairings [skin/fonts.ts:7-27](../../apps/web/src/skin/fonts.ts#L7-L27).)

So the nav's per-skin *typography* is fully tokenized; its per-skin *shape and motion* are not —
shape is M1-hardcoded (10px items) and motion is M1-hardcoded (200ms/150ms), while the skins'
own `--radius-*`/`--motion-*` tokens sit unused by the shell.

## 3. The per-skin nav ornament: `.rv-chrome` (M2) + `SkinDivider` (M4) + `chromeLine` (M4)

The brand block is the one place the nav is *materially* different per skin. Three coordinated
pieces:

**The chrome rail** — `[data-skin] .rv-chrome::after/::before` in skin-kit.css (base 437-440:
neutral hairline). Per skin:

| Skin | Material (skin-kit.css) | Construction |
|---|---|---|
| Tryst | brass rail, 443-457 | 4px `repeating-linear-gradient` gilt striping, inset ring shadow, 1px radius |
| Aphelion | engraved instrument edge, 460-477 | 5px vertical tick pattern (`repeating-linear-gradient 90deg`) + accent hairline base |
| Grimoire | incipit band, 480-493 | rubricated thick-thin pair: 2px `--rubric` over 1px `--gold` |
| Marrow | **carved lintel, 496-509** | 6px slate **slab gradient** cut by `clip-path: polygon(4px 0, calc(100% - 4px) 0, 100% 100%, 0 100%)` — a chamfered solid, the only clip-path in any skin's chrome |
| Gaslight | office wall, 512-538 | 2px slate rule **plus a second pseudo-element**: a 5px brass pin (radial dot, inset shadow) at the right end — the only two-part chrome |
| Marginalia | cover slug, 541-554 | 1.5px proof-red rule over 1px pencil hairline |
| Hearth | table runner, 557-571 | 2px stitched dash run (`repeating-linear-gradient`, `--thread`), 0.75 opacity |
| Almanac | ink band, 574-586 | 6px solid `--cta-lo` block, full-bleed (left/right 0 — like Marrow's, wider than the others' inset 2px) |
| Firstlight | sticker edge, 589-605 | 2px gel dot run (`repeating-linear-gradient`, accent at 70%) |

**The divider** under the brand ([AppShell.tsx:143](../../apps/web/src/components/AppShell.tsx#L143)) —
`SkinDivider`'s `MOTIFS: Record<SkinId, ReactNode>` ([SkinDivider.tsx:7](../../apps/web/src/components/SkinDivider.tsx#L7)):
nine hand-drawn SVG rules (Tryst filigree + lozenge, Grimoire thick-thin quatrefoil, Aphelion
orbital, Marrow's fractured out-of-true hairline, etc.), stroked in the skin's tertiary tone.

**The room name** — `chromeLine` per skin ([skins.ts:53,64,75,86,99,110,121,132,143](../../packages/core/src/skins.ts#L53)):
"The standing invitation / Liber bibliothecae / // Archive / The specimen archive / The night
office / Uncorrected proof / The kitchen table / Field library · Ref index / Up too late".

## 4. The Add button — the one nav control on the M2 material system

Sidebar "Add a book" is `skin-control skin-btn-primary` (150) — the only nav element that rides the
per-skin button material ([skin-kit.css:93-99](../../apps/web/src/styles/skin-kit.css#L93-L99) base:
`--ctl-clip` notch, `--cta-hi/lo` gradient, `--cta-border`, `--cta-shadow`; per-skin recasts §2 of
report 2). In Aphelion it is the notched machined key with 0.18em engraving (153-155); in Marrow
the square bone plaque (202-205). It is also the only nav element whose motion comes from
`--motion-ease/duration` (via `.skin-control`, skin-kit.css:11-12).

The mobile FAB is **not** this: it is the M1 hardcoded `rounded-full` `primary→gold` gradient circle
(370-375) in every skin — Marrow's phone FAB is a round gold-gradient button in a skin whose CSS
comment reads "Everything cut, never round" (skin-kit.css:201).

Footer controls (skin swatch / Settings / sign-out / ThemeToggle) are `.skin-control border
border-line` over a 70% card wash (170-207, [ThemeToggle.tsx:22-24](../../apps/web/src/components/ThemeToggle.tsx#L22-L24))
— token radius + label voice, no per-skin material block.

## 5. Texture and ornament inventory, nav-wide

- Per-skin: chrome rail (§3), divider motif (§3), Add-button material (§4). That is the complete list.
- The sidebar surface itself carries **no** skin texture: `--ambient-texture` (the `.rv-skin-texture`
  layer, skin-kit.css:57-68) is mounted only in `/lab` ([LabRoute.tsx:185](../../apps/web/src/routes/LabRoute.tsx#L185)) —
  in the shipped app **no surface mounts the ambient texture layer at all**, nav or body.
- The starfield (`Sky`, star density per skin, [skins.ts:32](../../packages/core/src/skins.ts#L32),
  [Sky.tsx](../../apps/web/src/components/Sky.tsx)) sits behind everything at the root
  ([RootRoute.tsx:77](../../apps/web/src/routes/RootRoute.tsx#L77)); the translucent sidebar blurs
  it, which is the only way ambient signature reaches the nav.

## 6. Marrow: what its nav does that its own buttons, cards, and dialogs do not (observed)

1. **A carved object ornament.** The lintel (skin-kit.css:496-509) is a solid with a gradient face
   and a chamfer *cut into its silhouette* (clip-path), hung under the wordmark. No body surface
   gets an equivalent: Marrow cards are `.skin-card` → 2px-radius bordered rectangles
   (tokens.css:206 block, `--radius-card: 2px`); the body's closest relative is the `chamfer-tray`
   Frame ([Structure.tsx:328](../../apps/web/src/components/Structure.tsx#L328)), used at **3 call
   sites app-wide** (see report 2 counts), vs the lintel present on every screen.
2. **A broken line.** The nav divider is Marrow's fractured rule — two hairlines out of true
   ([SkinDivider.tsx marrow motif](../../apps/web/src/components/SkinDivider.tsx)). Body section
   rules render the same idea only through `SectionHeader` (`sectionRule: 'fractured'`,
   [skinStructure.ts:203](../../packages/core/src/skinStructure.ts#L203)) — 6 call sites; every
   other body divider is a plain `border-line` hairline.
3. **Its display face at small scale with a room name.** The brand block sets Playfair + the
   "The specimen archive" line; body cards name books in body sans except where `Nameplate`
   (2 call sites) is used.
4. And the inversions, stated for completeness: Marrow's nav *items* are rounder (10px, M1) than
   any Marrow button (0px) or card (2px); its phone dialogs (`rv-modal`, skin-kit.css:608-610) and
   More sheet (`rounded-2xl`, AppShell:312) are 24px/16px soft-rounded; its FAB is a circle with a
   gold gradient. The skin's strongest statements in the nav are M2/M4 slots; its strongest
   contradictions are M1 constants.

## 7. Summary table — tokenized vs hardcoded, per nav property

| Property | Mechanism | Reachable from tokens? |
|---|---|---|
| Item/sheet/FAB radii | M1 literals (10px/2xl/xl/full) | No |
| Sidebar/tab-bar washes + hairlines | M1 recipe over M3 colors | Colors yes, recipe no |
| Active-item treatment (16% wash + inset bar) | M1 recipe over `--primary` | Color yes, treatment no |
| Label type voice | M3 (`.skin-label`) | Yes — all four axes |
| Brand/display type | M3 (`--font-display`) | Yes |
| Type sizes/weights/paddings | M1 literals | No |
| Collapse + link motion | M1 (200ms/150ms defaults) | No — `--motion-*` unused |
| Add button material + motion | M2 + M3 | Yes (via `.skin-btn-primary` slot) |
| Chrome rail | M2 (`[data-skin] .rv-chrome`) | No — raw per-skin CSS, not tokens |
| Divider motif | M4 (React record) | No — drawn SVG per skin |
| Room name | M4 (`SKINS.chromeLine`) | Registry, yes |
| FAB gradient / brand-tile gradient | M1 recipe (`primary→gold` / `primary→violet`) | Stops yes, existence no |
| Ambient texture on nav | absent (token exists, unmounted) | Token exists; no consumer |
