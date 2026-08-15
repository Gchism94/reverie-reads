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

**A coverage gap that IS real, recorded here so a green sweep is not misread as reassurance.** The
uppercase-on-reader-data defect (§11) is **invisible to the axe sweep**, for two independent reasons,
either of which alone would be enough:

1. **Skin coverage.** The sweep runs `tryst`, `grimoire`, `aphelion`, `marrow`. `--control-transform`
   is `uppercase` in `aphelion`, `umbra` and `almanac` — so **two of the three affected skins are
   never rendered by it at all**.
2. **What axe checks.** Even in aphelion, axe audits contrast, roles, names and structure. Casing is
   not an accessibility violation, so it would not be flagged even on a page the sweep does load.

The point generalises past this defect: "the a11y sweep is green" answers a narrower question than it
appears to, and any claim resting on it should name which skins ran and which rule would have fired.

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
   global threshold was set in advance, and the results show why that mattered.

   **RULED, 2026-08-15: 17 of 18 fine; `marrow/dark` needs a stronger border.** Measured against
   the real `tokens.css` via a headless run of `docs/audits/card-decision-aid.html` (committed
   alongside this), then cross-checked visually against zoomed per-tile screenshots rather than
   accepted on the numbers alone.

   | combo           | ruling                    | surface   | border    |
   | --------------- | ------------------------- | --------- | --------- |
   | tryst/light     | Fine                      | 1.086     | 1.547     |
   | tryst/dark      | Fine                      | 1.091     | 1.741     |
   | grimoire/light  | Fine                      | 1.072     | 1.354     |
   | grimoire/dark   | Fine                      | 1.102     | 1.420     |
   | aphelion/light  | Fine                      | 1.064     | 1.363     |
   | aphelion/dark   | Fine                      | 1.077     | 1.440     |
   | marrow/light    | Fine                      | 1.075     | 1.533     |
   | **marrow/dark** | **Needs stronger border** | **1.040** | **1.147** |
   | umbra/light     | Fine                      | 1.141     | 1.458     |
   | umbra/dark      | Fine                      | 1.046     | 1.404     |
   | folio/light     | Fine                      | 1.166     | 1.603     |
   | folio/dark      | Fine                      | 1.194     | 1.611     |
   | hearth/light    | Fine                      | 1.124     | 1.524     |
   | hearth/dark     | Fine                      | 2.100     | 1.933     |
   | almanac/light   | Fine                      | 1.031     | 1.987     |
   | almanac/dark    | Fine                      | 1.144     | 1.791     |
   | bloom/light     | Fine                      | 1.455     | 1.427     |
   | bloom/dark      | Fine                      | 1.155     | 1.712     |

   **Why `marrow/dark` alone, when its surface is not the weakest in the set.** Both legs are weak,
   but the border is the outlier — **1.147, lowest of any combo by a wide margin**. Its surface
   (1.040) is close to `almanac/light`'s **1.031**, which reads fine because ITS border (1.987, the
   strongest in the set) carries it; `umbra/dark` at 1.046 works the same way. So the pattern across
   the whole set is that a weak surface is acceptable _when the border does the separating_, and
   `marrow/dark` is the one combo where neither leg does.

   The fix is therefore **`--line`** (alpha and/or lightness), **not `--card`** — bringing this combo
   in line with how every other weak-surface combo already works, and leaving `--card` alone so the
   text-on-card contrast that depends on it downstream is untouched.

   **Where the fix lands: Track A PR 2**, token-only. Deliberately not folded in with the rulings —
   it needs a visual sign-off on the actual rendered result, not a passing number.

   **Coverage added with the rulings (Track A PR 1).** Nothing had ever asserted `--card` vs `--bg0`
   or `--line` vs the card; `skinCharacter.contrast.test.ts` read only `cardSolid`, which is not a
   stand-in (`--card` carries alpha in tryst, and `--card-solid` was deliberately lifted away from
   `--card` in `marrow/dark`, `umbra/light`, `umbra/dark`). Both legs are now guarded for all 18 at
   a regression floor set to today's measured value, with `marrow/dark` held in a named
   `KNOWN_WEAK_COMBOS` list — excluded from the pass/fail floor so the suite does not certify it as
   fine, but still guarded against drifting lower while it waits for PR 2.

2. **Chip radius** — **tokenize.** Runs as a parallel track; the tripwire check above cleared it.
3. **Elevation** — **opt-in accent only.** Cards stay border-defined; `--shadow` does **not** join
   the card contract.
4. ~~**`Nameplate` / `StatePill` hardcoded colours** — **bugs.** Neutralise to semantic tokens.~~
   **RETIRED.** The ruling was made on the audit's Pattern E finding, which §0 disproves: neither is
   a violation. Nothing to neutralise.

---

## 7. What this spawned

| work                                              | status                                                   |
| ------------------------------------------------- | -------------------------------------------------------- |
| Token-fixture parity (`skinTokensParity.test.ts`) | PR #211                                                  |
| Surface-separation + border-visibility coverage   | planned — folds in the §5 sixth finding                  |
| `marrow/dark` token fix                           | blocked on ruling 1                                      |
| Control-radius guard (ESLint + source scan)       | planned — precedes the migration                         |
| Control-radius migration (batches 1–6)            | **control meter 0** — 25 chips + 7 deferred remain       |
| Radius-without-typography kit class (§8)          | **needs an owner ruling** — blocks 25 chips + 7 controls |
| `Surface` primitive + surface migration           | planned                                                  |
| ~~`Nameplate` / `StatePill` colour fix~~          | **retired** — no violation (§0)                          |

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

## 9. Two techniques the migration produced, worth reusing

**Tag over shape: when an unambiguous signal exists, do not infer from an ambiguous one.** The meter
guesses "is this a control?" from padding and height, because a `<button>` and a `<div>` look
identical to a line-based scan. That guessing is unavoidable for buttons — and it silently cost
three textareas, which are block-padded with no fixed height and so matched no shape rule. But
`<input>`, `<textarea>` and `<select>` are not ambiguous at all: the tag _is_ the answer.
`looksLikeField` reads it directly, and the three textareas that had been invisible since the meter
was written appeared immediately. The general form: before writing a heuristic, check whether the
thing you are inferring is stated somewhere exactly. Inference applied to a signal that was already
unambiguous is pure downside — it can only lose information.

**The pass-mutant: proving a `0` means "nothing left" rather than "nothing visible."** A guard that
reports zero findings is indistinguishable from a guard that cannot see. The usual mutation — break
the code, watch the guard fail — cannot tell them apart, because both a real zero and a blind zero
stay green when nothing changes. The technique is to mutate _the guard's own vision_ and assert the
mutant **passes**: remove `looksLikeField`, and the same reverted textarea stops being caught; narrow
its tag set, and the three vanish again. A mutant that is supposed to pass sounds backwards and is
the only thing that distinguishes the two cases. Pair it with a normal failing mutant — one shows the
guard has teeth, the other shows the teeth are pointed at something real.

**A caution learned the same day, about measuring in the browser.** Verifying the migration's actual
effect showed a migrated control computing `999px` in Aphelion, where `--radius-control` is `2px` —
which reads exactly like the whole migration being inert. It was not: `.skin-control` sets
`transition-duration`, so `border-radius` **animates** on a skin change, and the measurement was
taken mid-flight. Settled values match the tokens exactly in every skin checked (tryst `999px`,
aphelion `2px`, marrow `0px`, almanac `2px`, bloom `999px`). Two further false leads came from the
harness rather than the app: `cssRules` throws a `SecurityError` on a cross-origin `file://`
stylesheet, and Vite's dev CSS is not fully enumerable through `document.styleSheets` — both make
rule-matching look empty when it is not. **Let a transitioned property settle before reading it, and
never trust a rule enumeration that returns nothing without first proving the enumerator can see
anything at all.**

## 10. The §8 population, split (asked for before any ruling)

The 32 were classified by **what the label's text is**, not how it is styled:

- **(a) DATA-BEARING** — the text comes from the reader's content or a domain data value.
- **(b) APP-AUTHORED** — the text is a string the app chose.
- **(c) STRUCTURAL** — the element has _no label of its own_; it is a container, row or tile whose
  text lives in child elements.
- **(d) GLYPH-ONLY** — the entire content is a symbol.

**They are not one population. They are four, and only one of them has a correctness argument.**

| class            | count  | what it is                                                      | does `--control-transform` matter?                                                 |
| ---------------- | ------ | --------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| (a) data-bearing | **8**  | genre/trope/mood names, join codes, club unit labels, formats   | **Yes — correctness.** Uppercasing is the app editorializing data it did not write |
| (b) app-authored | **11** | nav destinations, empty-state prose, status text, reason labels | Yes — but purely aesthetic                                                         |
| (c) structural   | **11** | review cards, list rows, stat tiles, the mobile sheet           | **No.** No text to transform                                                       |
| (d) glyph-only   | **2**  | a `✓` overlay on mood/trope cards                               | **No.** Case does not apply to a symbol                                            |

### (a) DATA-BEARING — 8

`BookDetailRoute:72` (the `Pill` component — receives genres, subgenres, series badge, intensity
glyphs, page counts) · `ClubRoute:103` (`club.joinCode`) · `ClubRoute:198` (`unitWord()`, which
interpolates the club's own `unitLabel`) · `MatchRoute:368` (banner trope tags) · `ReviewRoute:176`
(genre names) · `SharedListRoute:120` (share code) · `OwnedCopies:103` (`paperback` / `hardcover`) ·
`MoodChip:26` (mood name)

### (b) APP-AUTHORED — 11

`Landing:123`, `Landing:131`, `AppShell:326` (nav labels) · `PlannerRoute:315` (`calendar` /
`releases` tab ids) · `SearchResults:40` (“On your shelf ✓”) · `DiscoverRoute:89` (“On your shelf”) ·
`ReviewsPanel:85` and `ClubRoute:208` (“Hidden — only you can see this”) · `ReviewRoute:61`
(`REASON_LABEL` — “No cover”, “Likely duplicate”) · `ReviewRoute:218` (empty-state prose) ·
`SeriesView:99` (`badgeFor()` — “✓ Series done”, “length not set”)

### (c) STRUCTURAL — 11

`ReviewsPanel:45` · `AppShell:312` · `DuplicateReview:188` · `DuplicateReview:197` ·
`ImportSummary:13` · `SkinEvolveReveal:20` · `ReviewRoute:22` · `ReviewRoute:100` · `ClubRoute:170` ·
`SharedListRoute:139` · `SeriesArranger:100`

### (d) GLYPH-ONLY — 2

`MoodRoute:144` · `TropeRoute:176`

### The `capitalize` reading does not survive

The hypothesis was that `OwnedCopies` and `PlannerRoute` writing `capitalize` by hand is the codebase
having already hit this need and solved it locally — the same tell that justified `.skin-tile`.
Three checks, and it comes apart:

1. **They fall on opposite sides of the split.** `OwnedCopies` renders `paperback` / `hardcover`, a
   domain data value → (a). `PlannerRoute` renders `calendar` / `releases`, tab ids the app itself
   chose → (b). One population would not straddle the line the split is drawn on.
2. **What the `capitalize` is actually for is lowercase identifiers, not skin typography.** Both
   render a bare lowercase literal from an `as const` tuple. `capitalize` is fixing _the identifier's
   casing_ so it is presentable — a rendering fix that would be there with no skin system at all.
   Reading it as protection against `--control-transform` attributes an intent the code does not
   show. **This corrects the framing in PR #221**, which called these “the sharpest evidence” for §8;
   the conflict is real, but the author was not defending against it.
3. **The combination already ships.** `ClubsRoute:74` carries `.skin-control` _and_ `capitalize`
   together, migrated in batch 3, and `.skin-control` wins (it is unlayered; Tailwind utilities sit
   in `@layer utilities`) — so its `capitalize` does nothing at all. It is dead styling, which is
   itself evidence that nobody wrote these calls to defend against `--control-transform`: if they
   had, this one would have been noticed the moment it stopped working.

   > **A draft of this section claimed that site renders `chapter`/`page`/`percent` as
   > `CHAPTER`/`PAGE`/`PERCENT`, "a data value already being uppercased in production".** That was
   > wrong and is retracted. Its children are
   > `{u === 'chapter' ? 'Chapters' : u === 'page' ? 'Pages' : 'Percent'}` — app-authored literals,
   > class **(b)**, and uppercasing them is the house style. The error came from reading the
   > `as const` tuple and the `capitalize` class and **inferring the children without opening
   > them** — the same shape of mistake as the two the document already records, made while
   > arguing that others had inferred too much. The reflex to check is easiest to skip on the
   > evidence that flatters the argument you are already making.

**The genuine counter-signal points the other way.** Where the app authors a micro-label, the
codebase already reaches for uppercase deliberately: **72 hand-written `uppercase tracking-[…]`
labels** (`ImportSummary`'s stat captions, `DuplicateReview`'s “Kept”, `FilterPanel`'s group headers,
`AuthScreen`'s field labels). Against that, `capitalize` appears **5 times**, and 3 of the 5 are
lowercase-identifier fixes. So the house style is _uppercase for app-authored micro-labels_, and the
five `capitalize` calls are not a design position — they are a casing repair.

### What the split implies for the ruling (not a proposal)

The four groups do not need the same answer, and one class does not need a class at all:

- **(c) and (d) — 13 of 32 — have no typography to protect.** Nothing stops them taking
  `.skin-control`'s radius today except that the class also carries type they simply do not use.
- **(b) — 11 — is an aesthetic call**, and the 72 hand-written uppercase labels suggest the house
  answer is already “uppercase is fine here”.
- **(a) — 8 — is the only group with a correctness argument.**

Whether that warrants one new class, a token, or nothing is the owner's call.

## 11. The sweep §8 should have run first — the 231 that DID migrate

§8 asked "which sites can't migrate." The more urgent question is its inverse: **of the sites that
already migrated, how many render data-derived text in a skin whose `--control-transform` is
`uppercase`?** Every one of those is a live defect, shipped by the migration itself.

**The result is not clean. Thirteen call sites are affected**, across `.skin-control`'s 181
occurrences. `.skin-field` and `.skin-tile` are unaffected — neither sets `text-transform` (measured,
not assumed).

### The mechanism, measured

`text-transform` is an **inherited** property, so a `.skin-control` element uppercases its own text
_and every descendant that does not declare its own_. Verified against the built CSS in a browser:

| probe                          | aphelion / umbra / almanac  |
| ------------------------------ | --------------------------- |
| `.skin-control` own text       | `uppercase`                 |
| a `<b>` nested inside it       | `uppercase` — **inherited** |
| a child declaring `capitalize` | `capitalize` — protected    |
| `.skin-tile`                   | `none` — clean              |

That last row of protection is why `Toolbar`'s `grid`/`series` buttons are **safe**: they sit inside
a `.skin-control` group container, but each declares its own `capitalize`, and a declared value beats
an inherited one.

### The thirteen

**Via `components/Chip.tsx:21`** — the shared `Chip` carries `.skin-control`, so every caller
inherits the problem. This is the bulk of it, and it is the app's primary filtering surface:

| call site             | renders                             |
| --------------------- | ----------------------------------- |
| `FilterPanel:69`      | genre names                         |
| `FilterPanel:77`      | subgenre names                      |
| `FilterPanel:85`      | **the reader's own tags / tropes**  |
| `FromYourAuthors:100` | **author names** (`{name} ✕`)       |
| `FromYourAuthors:112` | **author names** (`{name} — muted`) |

**Direct `.skin-control` sites:**

| site                                   | renders                                             |
| -------------------------------------- | --------------------------------------------------- |
| `library/Toolbar.tsx:168`              | `Author: {filters.author}` — an author name         |
| `book/dialogs.tsx:649`                 | `Keep it in {oldSeries}` — a series name            |
| `book/dialogs.tsx:924`                 | `{b.title}` — a book title                          |
| `components/JustFinishedSheet.tsx:265` | `Add to ${tbr.name}` — a shelf name                 |
| `components/TropeChip.tsx:26`          | `{name}` — a trope name                             |
| `components/TropePicker.tsx:211`       | `Add “{q.trim()}”` — **text the reader just typed** |
| `routes/SeriesRoute.tsx:548`           | `…and onto {t.name}` — a series name                |
| `routes/SharedListRoute.tsx:49`        | `{b.title}` — a book title                          |

### Checked and NOT defects

- `SeriesRoute:353` (`{e.label}`, a reader-set entry label) declares `uppercase` **itself**, in all
  nine skins. Intentional, not skin drift.
- `Toolbar:140`'s children — protected by their own `capitalize`, as above.
- `StatsRoute:178` — year numbers; case does not apply.
- `SeriesRoute:226`, `OwnedCopies:65`, `BookDetailRail:159`, `BookDetailRoute:579` — all render
  app-authored label **maps** (`SERIES_STATUS_LABELS`, `OWNERSHIP_LABELS`, `FORMAT_LABEL`), not data.

### What this changes

The (a) group is not 8 waiting outside the door — it is **8 outside plus 13 already inside and
broken**. The migration did not create the `--control-transform` values, but it is what connected
them to reader data, and a book title rendering as `A COURT OF THORNS AND ROSES` in three skins is
the app editorializing content it did not write.

It also reframes what the fourth class is _for_: not "a place to put the 32 that would not fit," but
**the correct home for every control whose label is data** — which the migration has been quietly
routing into `.skin-control` for six batches.

## 12. PROPOSAL — `.skin-control-quiet` (not built; awaiting a ruling)

### The arithmetic, checked against the list

The owner's reading of §10 — "19 wanting the fourth class, 8 non-negotiably" — is **exactly right as
stated**: (a) 8 + (c) 11 = 19, with (d) 2 indifferent. Checking it against the actual sites moves one
group, in the direction that makes the proposal smaller and better-founded:

**(c)'s 11 do not need a new class. They need `.skin-card` / `.skin-panel`, which already exist.**
Every one of them is a card- or panel-scale surface — `rounded-2xl`/`rounded-xl` containers and list
rows with block padding (`ReviewsPanel:45` a review card, `AppShell:312` the mobile sheet,
`ReviewRoute:100` and `SeriesArranger:100` list rows). They landed in this population only because
the meter's shape heuristic reads `px-*` as control-ish. `.skin-card` carries **no typography
today**, so they are not blocked on anything — they are a separate, already-unblocked cleanup.

That leaves the class's genuine population:

| group                                     | n      |                                 |
| ----------------------------------------- | ------ | ------------------------------- |
| (a) un-migrated data-bearing controls     | **8**  | §10                             |
| already-migrated, currently **defective** | **13** | §11                             |
| **total**                                 | **21** | every one renders reader data   |
| (d) glyph-only                            | 2      | indifferent; either class works |

So: **21 sites, all data-bearing, 13 of them shipping wrong output today.** Narrower than 19+13, and
a stronger case than `.skin-tile` had — `.skin-tile` fixed an inconsistency, this fixes a defect.

### Name

**`.skin-control-quiet`.** A compound, deliberately: it is not a new kind of object, it is
`.skin-control` with one axis muted. `.skin-tile` earned a noun because a card-scale pressable really
is a different thing; this is the same control wearing the skin's silhouette without its voice, and a
new noun (`.skin-chip`) would misdescribe the buttons in the population (`dialogs:649`,
`JustFinishedSheet:265`) that are not chips at all.

### Exact contents

`.skin-control` minus its three typography declarations — nothing else changes, so moving a site is
behaviour-preserving on every axis except the one at fault:

```css
/* A control whose LABEL IS DATA — a genre chip, an author filter, a book title in a confirm button.
   Identical to .skin-control except that it does not impose --control-font / --label-weight /
   --control-transform, because --control-transform is `uppercase` in aphelion, umbra and almanac and
   uppercasing content the reader wrote is the app editorializing data it does not own.
   Motion IS carried, unlike .skin-tile: these are the same pressables .skin-control governs, and
   dropping it would silently retime every filter chip (Chip.tsx declares transition-colors). */
.skin-control-quiet {
  border-radius: var(--radius-control);
  transition-timing-function: var(--motion-ease);
  transition-duration: var(--motion-duration);
}
```

and it joins the existing focus-ring selector list:

```css
.skin-control:focus-visible,
.skin-field:focus-visible,
.skin-tile:focus-visible,
.skin-control-quiet:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

### Guard change 1 — the ESLint rule

`eslint-rules/no-hardcoded-control-radius.js`, one regex:

```js
const CARRIER = /\bskin-(?:control|control-quiet|field|tile)\b/
```

Note `control-quiet` must precede `control` in the alternation, or `skin-control` matches first and
the reported carrier name is wrong in the error message. **Mutation proof:** add `rounded-full` to a
`.skin-control-quiet` element → the rule errors and names `skin-control-quiet`, not `skin-control`.

### Guard change 2 — the migration meter

`skinRadiusMigration.test.ts`: same addition to its `CARRIER`, and the four §10 allowlist entries for
the (a) sites that migrate come out. **Mutation proofs:** revert one migrated site → meter 0 → 1;
drop the `control-quiet` alternative from `CARRIER` → every migrated site is re-counted, so the
number jumps by the batch size rather than by one, distinguishing "the class is recognised" from
"this one site is migrated".

### Guard change 3 — a render-time assertion, and it is cheap

The owner proposed a different shape than either static option below, and **it is better than both**:
the defect is observable at RENDER time, so given a known mixed-case input, assert the output still
matches. Checked against this repo's setup — it works, with one trap that would have silently voided
it.

**The trap: `textContent` is NOT transform-aware.** `text-transform` is a purely visual property; it
does not alter the DOM text. Measured against the built CSS in aphelion:

| read via                           | value                             |
| ---------------------------------- | --------------------------------- |
| `textContent`                      | `A Court of Thorns and Roses`     |
| **`innerText`**                    | **`A COURT OF THORNS AND ROSES`** |
| `getComputedStyle().textTransform` | `uppercase`                       |

So the obvious spelling — `expect(el.textContent).toBe(input)` — **passes unconditionally**, against
the broken build and the fixed one alike. It is a textbook proxy guard, and it would have shipped
looking like coverage. `innerText` (and Playwright's `innerText()`) resolves the transform and is the
correct reader.

**It must be e2e, not Vitest.** jsdom does not apply the skin stylesheet and its `innerText` is not
transform-aware, so the assertion only means something in a real browser with the real CSS. That is
cheap here: Playwright already runs, and **aphelion is already in the e2e skin matrix**, so an
uppercase skin costs no new browser dimension.

The shape:

```ts
// in an uppercase-transform skin, a control whose label is data renders the data unchanged
await setSkin(page, 'aphelion')
await expect(page.getByTestId('genre-chip').first()).toHaveText(/^Fantasy$/) // innerText-based
```

Playwright's `toHaveText` uses `innerText`, so the assertion sees the transform. **Zero false
positives** — it compares rendered output to a known input rather than guessing intent from syntax,
which is precisely why the static scan needed 68 waivers.

**Coverage, stated exactly.** This guard covers **all 13** sites — the 5-site `Chip` cluster _and_
the 8 direct ones — because it asserts on rendered output rather than on which component declared
what. That is the decisive advantage over the children-guard below, which does **not**.

### The children-guard, and the gap it leaves — kept for the record

The fallback, had the render-time check not worked: ban `.skin-control` on shared components that
render `{children}`. Stated plainly so it does not read as coverage it never had:

> It catches **5 of 13** — the `Chip.tsx` cluster only. The **8 direct sites** (`Toolbar:168`,
> `dialogs:649`, `dialogs:924`, `JustFinishedSheet:265`, `TropeChip:26`, `TropePicker:211`,
> `SeriesRoute:548`, `SharedListRoute:49`) name their data inline and declare no `{children}`, so
> the rule is structurally blind to every one of them. It would have left **62% of this defect
> uncovered** while reporting clean.

The purely static alternative — flag any `.skin-control` whose children contain a JSX expression —
measures **81 of 181** sites, 68 of them legitimate (`{busy ? 'Saving…' : 'Save'}`,
`{FORMAT_LABEL[f]}`). An allowlist of 68 is the dumping ground the meter's own header warns about.

**Recommendation: take the render-time guard.** It is the only one of the three that covers the whole
defect, and the trap that would have neutered it is now documented above it.

### BUILT — ruling given, shipped

`.skin-control-quiet` is in `skin-kit.css` with the contents specced above, joined to the
focus-ring selector list, and all 21 sites carry it. The interim overrides from #224 were removed as
each site moved; `uppercaseInterim.test.ts` reached 0 and was deleted with the last one, which was
the agreed completion signal rather than a hand-declared done.

**One spec detail did not survive contact.** Only the ESLint rule needed its regex changed. `\b` sits
between the `l` and the `-`, so `skin-control` already matched inside `skin-control-quiet` — the
meter only calls `.test()` and never reads the captured name, making that edit a pure no-op dressed
as a functional change. The ESLint rule DOES read the name into its message, and without the
alternative ordered before `control` it reports a class the element does not have. Mutation testing
is what separated them; the meter's regex is now annotated to say why it is deliberately unchanged.
