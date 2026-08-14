# Skin / component consistency — audit

**Branch:** `docs/skin-consistency-audit` (off `main@957a946`).
**Mode:** AUDIT ONLY for the findings below. No component restyling was done in the audit pass;
the implementation tracks it spawned are listed at the end with their own branches.

The owner's complaint, stated whole: _"the app's 'main card' is the strongest expression of the
design language; the rest of the app's components — buttons, inputs, panels, chips, list rows,
dialogs, empty states — don't consistently match it."_ The goal is that every component, on every
page, in every skin, reads as the same system as that card.

This document records what the audit found, **including the hypotheses it ruled out and on what
evidence** — three plausible answers were disproved by measurement or by history, and each of them
would have produced a wrong fix that looked right in review.

---

## 0. A correction that belongs at the top

**The first pass's surface measurements were wrong, and the reason is itself a finding.**

They were computed from `packages/core/src/skinTokens.fixture.ts` — the token sample the contrast
tests use — on the assumption it mirrors `tokens.css`. It does mirror it for the fields it copies,
but the field being read (`cardSolid`) is **not the surface a card paints** (see §5). Recomputing
directly from `tokens.css` moved several combos materially:

| combo         | first pass (fixture) | corrected (tokens.css) |
| ------------- | -------------------- | ---------------------- |
| `marrow/dark` | 1.128                | **1.040**              |
| `umbra/dark`  | 1.099                | **1.046**              |
| `umbra/light` | 1.093                | 1.141                  |

Every figure in this document is the corrected, `tokens.css`-derived one. The lesson generalises
past this audit: a measurement is only as good as the provenance of its inputs, and a fixture that
_describes itself_ as a mirror is an input worth verifying rather than trusting.

**Second correction: Pattern E's two "genuine violations" were both false positives.** The audit
reported `StatePill`'s `#8c8c8c` and `Nameplate`'s `rgba(40, 28, 12, 0.7)` as hardcoded colours
breaking the no-hardcoded-colours rule. Reading the surrounding code rather than the grep output
disproved both:

- **`StatePill` `#8c8c8c` is prose.** It appears once, in a doc comment, describing the historical
  composite (`rgba(0,0,0,0.45)` over white cover art) that failed AA and motivated the component.
  The component itself is fully tokenized — `STATE_PILL_TOKENS.surface / .label / .accent`. The
  grep counted a comment as code.
- **`Nameplate`'s brown is correctly scoped.** It is shading on a decorative brass rivet, and
  `PLATE` is a `Partial<Record<SkinId, PlateOrnament>>` — per-skin keyed. That rivet belongs to
  **hearth's** entry, the warm cozy skin, and its metal already uses `var(--gold)` /
  `var(--gold-deep)`. A warm-brown speck inside hearth's own ornament, rendered only in hearth, is
  correct by construction — the same category as the `rgba(0,0,0,0.4)` box-shadow on the next line,
  which the audit had already ruled defensible. Classifying them differently was inconsistent.

**Pattern E therefore has zero confirmed violations**, and its ruling is retired rather than
implemented. Both entries are kept above rather than deleted: a pattern that was proposed and
disproved is worth more to the next reader than a pattern that silently vanished.

---

## 1. The anchor — there isn't a component, and that is the finding

The audit set out to document "the main card" and standardise on it. **No such component exists.**

`CoverCard.tsx` is the most refined card-_like_ surface, but it's an image tile
(`aspect-[2/3]`, gradient, cover art) with no padding rhythm and no type scale — it cannot anchor
buttons, inputs or list rows. The surface the complaint actually describes — the padded, bordered
container behind the Add form, the Stats blocks, the Settings panels — is **a hand-copied recipe**:

```jsx
<div className="mt-4 skin-panel border border-line p-4" style={{ background: 'var(--card)' }}>
```

**47 files** contain that shape; `background: 'var(--card)'` appears **99 times** literally. There is
no `Card`, `Surface` or `Panel` component in `components/` — `Button`, `Chip`, `Label`, `Modal` and
`Switch` exist, a surface primitive does not.

### The crux question, answered

The audit was asked whether the card's treatment lives in **semantic tokens** (making the work
"apply existing tokens", small) or in **one-off values** (making it "create the token contract
first", large). The answer is neither:

> **The token contract exists and is good. The component layer that would enforce it does not.**

`docs/reference/SKIN_CHARACTER_CONTRACT.md` defines `--radius-card/panel/control`, `--label-font`,
`--motion-ease`, `--accent`, `--card`, `--line`, `--field`, `--shadow`; `skin-kit.css` provides
token-consuming utilities (`.skin-card`, `.skin-panel`, `.skin-control`, `.skin-field`,
`.skin-label`, `.skin-numeral`). None of it is enforced. **Consistency currently depends on every
author retyping the same four-part recipe correctly** — and §2 shows they don't.

---

## 2. The five divergence patterns

Grouped by pattern rather than by component, because each pattern is one fix rather than N.

**A — hardcoded radii bypass the skin's shape character. 361 vs 86, a ~4:1 ratio.**
`rounded-full` ×216, `rounded-xl` ×76, `rounded-2xl` ×33, `rounded-lg` ×22, `rounded-md` ×8,
`rounded-3xl` ×4, `rounded-sm` ×2 — against `.skin-control` ×33, `.skin-card` ×32, `.skin-panel`
×19, `.skin-field` ×2. This defeats the system's premise: Aphelion declares
`--radius-control: 2px`, but a `rounded-full` chip stays a pill in Aphelion. The skin's silhouette
does not reach most of the app.

**B — no shared surface primitive. 47 files, 99 sites.** Padding (`p-4` vs `p-3`), radius class,
border presence and elevation drift independently because nothing holds them together.

**C — no shared button. 271 raw `<button>` elements; exactly 1 file imports the `Button` component.**
Each raw button re-declares height, radius, border, background and font.

**D — elevation is effectively unused. 19 `var(--shadow)` sites.** Cards are border-defined almost
everywhere, which §3 shows is load-bearing rather than incidental.

**E — hardcoded colours, ~110 occurrences. DISPROVEN — see §0.** Every occurrence is
**defensible**: neutral alpha scrims
(`rgba(0,0,0,0.35)`) for overlays and gradients, which carry no skin identity. Two are genuine
violations of the repo's no-hardcoded-colours rule — **both were later disproved (§0)**, and are
kept here struck through so the reasoning survives:

- ~~`Nameplate.tsx` — `rgba(40, 28, 12, 0.7)`~~ — **not a violation.** Per-skin scoped to hearth's
  own ornament (§0).
- ~~`StatePill.tsx` — `#8c8c8c`~~ — **not a violation.** Prose in a doc comment; the component is
  fully tokenized (§0).

Concentrations of the defensible kind: `CoverPlaceholder` 24, `Structure` 23, `Spine` 23,
`SpineShelf` 9, `Nameplate` 7.

---

## 3. Does the anchor hold in all nine skins?

### What is and isn't covered (an earlier claim, corrected)

An earlier framing held that five skins lacked automated contrast coverage. **That is false**, and
it was checked rather than accepted: `skinCharacter.contrast.test.ts` iterates
`Object.keys(SKINS) × MODES` — **all 9 skins × both modes**, ~30 text pairs each. The four-skin
figure belongs to the **e2e axe sweep**, a different layer. There is no text-contrast coverage gap.

**There is a different, real gap, and it is precisely the property this work would standardise on.**
Every pair in that test is _text on a surface_. **Nothing anywhere asserts `--card` vs `--bg`
(surface separation) or `--line` vs `--card` (border visibility).** So the one relationship the
overhaul depends on is the one nothing measures.

### The measurements

Computed from `tokens.css`, compositing the (often translucent) `--card` over `--bg` exactly as the
browser does. A decision aid rendering all 18 combos from real values accompanies this audit.

**Card vs page background — ten of eighteen sit below 1.11:**

| weakest          | ratio     | strongest     | ratio |
| ---------------- | --------- | ------------- | ----- |
| `almanac/light`  | **1.031** | `hearth/dark` | 2.100 |
| `marrow/dark`    | **1.040** | `bloom/light` | 1.455 |
| `umbra/dark`     | **1.046** | `folio/dark`  | 1.194 |
| `aphelion/light` | 1.064     | `folio/light` | 1.166 |

**The border is doing nearly all the work of defining a card.** That makes `--line` load-bearing,
and it is why pattern D (unused elevation) is a design fact rather than an oversight.

**Border visibility (`--line` composited over the card):**

| weakest           | ratio     | alpha |
| ----------------- | --------- | ----- |
| **`marrow/dark`** | **1.147** | 0.20  |
| `grimoire/light`  | 1.354     | 0.32  |
| `aphelion/light`  | 1.363     | 0.26  |

### The named blocker

**`marrow/dark` — surface 1.040, border 1.147.** The only combo where _both_ legs are weak. Every
other skin has at least one strong leg carrying the card: `almanac/light` has the weakest surface in
the set (1.031) but the strongest border (1.987), so it holds. Standardising "card = surface +
border" on `marrow/dark` produces a container that reads as nothing.

---

## 4. Control-radius classification (Track B1)

The 361 hardcoded radius sites are **not one thing**, and migrating them as one would square
elements that must stay round.

**`rounded-full` (216):**

| bucket                                                    | count | disposition                     |
| --------------------------------------------------------- | ----- | ------------------------------- |
| (a1) decorative / artwork — SVG dots, stars, ornaments    | 54    | **stays round** — geometry      |
| (a2) circular controls — square-box icon buttons, avatars | 21    | **stays round**                 |
| (b) pill controls — chips, facets, tags, pill buttons     | 124   | **migrates** to `.skin-control` |
| (?) ambiguous at first pass                               | 17    | resolved below                  |

(a1) concentrates in `Structure` (25), `CoverPlaceholder` (7), `Spine` (6); (b) in `SettingsRoute`
(14), `SkinGalleryRoute` (9), `AddRoute` (9), `BookDetailRail` (8), `DuplicateReview` (6).

**Other radii (145):** ~95 surface-ish (panels, sheets, tiles) belong to the surface work, not the
control migration; ~50 control-ish (`h-9`–`h-12`, `--field` backgrounds, buttons) are further (b)
candidates.

### The 17, resolved

- **Segmented-control tracks (5)** — `flex rounded-full border border-line p-1` in `PlannerRoute`,
  `ShelvesRoute`, `ShelfRoute`, `ClubsRoute` ×2. **Migrate.** A track whose inner pills take
  `--radius-control` while it stays `rounded-full` disagrees with its own contents. They take the
  **raw token**, not radius-plus-padding: `--radius-control` is a single literal per skin, so
  compensating arithmetic would fight the skin rather than follow it.
- **`UpdateToast` (1)** — a pill-shaped toast. A **surface**, deferred to the surface work.
- **Progress / meter bars (11)** — **split 2 / 9**, on a measurement rather than an assumption.

### The clamp measurement

Browsers clamp `border-radius` to half the element's height, so on a thin bar `rounded-full` and a
small token radius can render **identically** — making migration pure churn. This was measured in a
real browser by pixel-comparing `rounded-full` against `2px` (Aphelion's `--radius-control`) at each
height actually used, not reasoned from the spec:

| height         | result                                      |
| -------------- | ------------------------------------------- |
| `h-[3px]`      | **identical pixels** — migration is churn   |
| `h-1.5` (6px)  | **different** — the token changes the shape |
| `h-2.5` (10px) | **different** — the token changes the shape |

**Skip the 2 `h-[3px]` sites** (`SeriesRoute`'s track and fill). **Migrate the 9** at `h-1.5`/`h-2.5`
(`MatchRoute`, `StatsRoute`, `OnboardingRoute`, `ClubRoute`) — noting these are a genuine _visual
change_ in Aphelion, the one place in the control migration that alters appearance rather than
aligning it.

**Tripwire check (control radius vs the card-surface work): clear.** `--radius-control`,
`--radius-card` and `--radius-panel` are independent literals per skin with no `var()`
cross-references, and `.skin-control` consumes only control tokens. The two tracks are decoupled and
can run in parallel.

---

## 5. `--card-solid` — the investigation, and two rejected hypotheses

`--card-solid` diverges from `--card` composited over `--bg` in four combos:

| combo         | browser paints | `--card-solid` claims | Δ            |
| ------------- | -------------- | --------------------- | ------------ |
| `marrow/dark` | `#161315`      | `#212328`             | **19**       |
| `umbra/light` | `#f8f9fb`      | `#f6f4ee`             | 13           |
| `umbra/dark`  | `#15171c`      | `#191c22`             | 6            |
| `tryst/light` | `#fdf8f4`      | `#fdf8f1`             | 3 (rounding) |

The contrast tests measure text against `cardSolid`, so for the diverging combos they verify a
surface the app never paints.

**Rejected hypothesis 1 — "it's drift; derive `--card-solid` from `--card` and delete the duplicate."**
This is the `index.html` font-boot-map shape from #207 and it looks right: `tokens.css` still
declares `--card-solid: var(--card)` as its base default, and **15 of 18 combos satisfy that
relationship exactly**. It is still wrong, and the evidence is in the history rather than the values:

- **`e01e89c`** — _"Fable 5 chunk 2 — Grimoire, **Marrow**, **Gaslight** get their bone"_ —
  deliberately lifted `--card-solid` away from `--card` for exactly the three diverging skins.
- **`880bc33`** had _earlier_ set `marrow/dark`'s `--card-solid` to **match** `--card`.

So `e01e89c` is a considered **reversal**. Deriving would have silently reverted a design decision.

**Rejected hypothesis 2 — "assert `--card-solid` equals `--card` over `--bg`."** Same disproof: they
are _meant_ to differ, so a parity assertion between them would fail correctly-authored tokens.

**What is actually true: the token outgrew its name.** `--card-solid` is now the **plate / modal /
spine** surface — `--plate`, `--spine-lo`, `--spine-hi` and `--sky` all alias it, `Modal.tsx` uses it
for modal backgrounds, and `below-fold.tsx` comments explicitly on choosing it _over_ `--card`. It is
a real independent token. The duplication worth removing is not `--card-solid` but **the fixture's
hand-copy of it** — closed by `skinTokensParity.test.ts` (126 assertions, 7 fields × 18 combos).

**Safety, recorded:** text on the real painted card clears AA in every diverging combo (ink
14.1–15.5, muted 5.6–7.4), and in each case the real surface gives _more_ contrast than the tested
one. The drift was conservative, never permissive — luck rather than design, which is the reason the
parity test exists.

**A sixth finding, distinct from the drift:** the contrast suite has **no text-on-real-card pair at
all**. Its background surfaces are only `cardSolid`, `bg0`, `accentFill` and derived washes. For 15
combos that is incidentally fine because the values coincide; for the three Fable 5 combos the real
card surface is unverified, and confirming it required a human doing arithmetic by hand.

---

## 6. Settled rulings

Recorded as decided, so the implementation tracks don't relitigate them:

1. **Card surface** — decided **skin by skin**, per combo, against the rendered decision aid. No
   global threshold is set in advance. _(Rulings pending; this section updates when they land.)_
2. **Chip radius** — **tokenize.** Runs as a parallel track; the tripwire check above cleared it.
3. **Elevation** — **opt-in accent only.** Cards stay border-defined; `--shadow` does **not** join
   the card contract.
4. ~~**`Nameplate` / `StatePill` hardcoded colours** — **bugs.** Neutralise to semantic tokens.~~
   **RETIRED.** The ruling was made on the audit's Pattern E finding, which §0 disproves: neither is
   a violation. Nothing to neutralise.

---

## 7. What this spawned

| work                                              | status                                                    |
| ------------------------------------------------- | --------------------------------------------------------- |
| Token-fixture parity (`skinTokensParity.test.ts`) | PR #211                                                   |
| Surface-separation + border-visibility coverage   | planned — folds in the §5 sixth finding                   |
| `marrow/dark` token fix                           | blocked on ruling 1                                       |
| Control-radius guard (ESLint + source scan)       | planned — precedes the migration                          |
| Control-radius migration (batches 1–4 landed)     | in progress — meter 61 controls + 25 chips                |
| Radius-without-typography kit class (§8)          | **needs an owner ruling** — blocks 25 chips + 2 nav links |
| `Surface` primitive + surface migration           | planned                                                   |
| ~~`Nameplate` / `StatePill` colour fix~~          | **retired** — no violation (§0)                           |

**Sequencing note:** the guard is built and run **before** the migration, so its failures _are_ the
migration checklist — a live progress meter rather than a hand-maintained list, and no window in
which migrated code can drift back before enforcement exists.

## 8. The open kit gap: a radius without the typography (raised by batch 4)

Batch 4 surfaced a population the kit has no class for. Of 39 shape-matches across its six files,
**11 were static `<span>` / `<div>` / `<li>` / `<p>`** — status badges, mono code chips, list rows,
empty-state boxes. Across the whole app the population is **25**.

They match `looksLikeControl` because the heuristic keys off padding and height, and a badge has
both. They are **not** false positives in the sense the tile allowlist entries were: each one really
does hardcode a radius the skin never reaches. What makes them un-migratable today is the rider —
`.skin-control` also sets `--control-font`, `--label-weight` and `--control-transform`, and
**`--control-transform` is `uppercase` in three skins** (aphelion, umbra, almanac). Migrating a
status badge would retype it; migrating Landing's `Log in` nav link would render it `LOG IN`.

Two Landing nav links sit in the same gap from the interactive side — control-shaped, genuinely
pressable, but text links whose radius exists only to shape a hover chip. They are allowlisted with
that reason rather than migrated, so **one decision covers both groups**.

**The question for the owner:** does the kit want a fourth pressable-scale class — control radius,
no typography, no motion — or should badges keep a hardcoded radius by design?

This is deliberately **not** self-resolved. `.skin-tile` was built only after a sweep established
its population and a check confirmed what it should and shouldn't carry; inventing a second class
mid-batch on a smaller sample would be the same move with less evidence behind it. Until it is
ruled on, the 25 are **counted, not excused** — they carry their own ratchet in
`skinRadiusMigration.test.ts` (`CHIP_BUDGET`, target 0), because splitting a bucket out of a meter
is precisely the move that quietly makes a number look better than it is.
