# Track A PR 3 — `Surface` primitive: scope

**Status:** scoping only. No component code written, no call site touched. The API and batching below
are meant to be argued with before anything is built on top of them.

**Date:** 2026-08-16 · **Branch:** `chore/check-pr-landed-guard` (doc rides along; implementation
gets its own branches)

---

## 1. The count, re-measured — the 47 files / 99 sites figure is wrong in both directions

Measured against source now, with a script rather than a grep-and-squint. The number depends
entirely on where you draw the line, so all three cuts are given and the third is the one that
matters:

| cut                                   |  sites |  files | what it is                                                                                       |
| ------------------------------------- | -----: | -----: | ------------------------------------------------------------------------------------------------ |
| every `border border-line` occurrence |    253 |     61 | includes dividers, inputs, one-off rules — not a surface population                              |
| padded **and** bordered elements      |    181 |     51 | adds a padding utility; still includes 76 `<button>`, 13 `<input>`, 4 `<textarea>`, 3 `<select>` |
| **container surfaces**                | **72** | **34** | the above minus interactive tags and minus `.skin-control` / `.skin-field` carriers              |

**72 sites across 34 files** is the real scope of a `Surface` primitive. The earlier casual figure
overstated the sites (99 → 72) and overstated the files (47 → 34), which is what you would expect
from a count that swept in buttons and fields — those are already served by `.skin-control` and
`.skin-field` and must **not** become `Surface` call sites.

Tag breakdown of the 72: `div` 55, `p` 8, `li` 6, `details` 2, `span` 1. The `p`/`li`/`details`
share matters — it rules out a `Surface` that hardcodes `<div>`.

<details>
<summary><strong>Full file list (34 files, 72 sites)</strong></summary>

|   n | file                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
|   6 | `routes/AddRoute.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
|   5 | `routes/IndieScreen.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
|   5 | `routes/ShelvesRoute.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
|   5 | `routes/DiscoverRoute.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
|   4 | `components/DuplicateReview.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
|   4 | `routes/ClubsRoute.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
|   4 | `routes/ReviewRoute.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
|   3 | `routes/PlannerRoute.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
|   3 | `routes/SettingsRoute.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
|   3 | `routes/ClubRoute.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
|   2 | `book/BookDetailRoute.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
|   2 | `book/dialogs.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
|   2 | `book/ReviewsPanel.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
|   2 | `routes/StatsRoute.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
|   2 | `routes/ShelfRoute.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
|   2 | `routes/HomeRoute.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
|   1 | `series/SeriesArranger.tsx`, `auth/AuthScreen.tsx`, `auth/WelcomeScreen.tsx`, `components/ImportSummary.tsx`, `components/AppShell.tsx`, `components/SkinEvolveReveal.tsx`, `components/CoverSheet.tsx`, `components/UpdateToast.tsx`, `components/SearchResults.tsx`, `components/CoverPicker.tsx`, `components/Modal.tsx`, `book/OwnedCopies.tsx`, `routes/SkinGalleryRoute.tsx`, `routes/LabRoute.tsx`, `routes/LabStructureRoute.tsx`, `routes/MatchRoute.tsx`, `routes/OnboardingRoute.tsx`, `routes/SharedListRoute.tsx` |

</details>

---

## 2. What actually varies across the 72

Measured, not guessed. This is what any single primitive has to absorb.

**Background — 6 distinct values.** `--card` 29, `--field` 20, **none 18**, `--card-solid` 2,
`--bg0` 2, `--chip` 1. The 18 with no background are real: a bordered, padded box that is
deliberately transparent. `--card-solid` is not interchangeable with `--card` —
`components/StatePill.tsx` and `auth/landing/below-fold.tsx` both document it as _opaque, never the
translucent scrim_, because light text must stay AA over it.

**Radius — three different mechanisms in play at once.** 14 sites carry `.skin-panel`
(`--radius-panel`), 11 carry `.skin-card` (`--radius-card`), and **47 carry neither** — of those,
27 have no radius at all and 20 hardcode a Tailwind value (`rounded-2xl` 16, `rounded-xl` 15,
`rounded-3xl` 3, `rounded-full` 3, `rounded-lg` 3, `rounded-[var(--radius-control)]` 5). The
hardcoded ones are the same defect class Track B spent 231 sites clearing; folding them into
`Surface` retires them as a side effect.

**Padding — 17 distinct combinations**, with a clear head: `p-3` 16, `p-6` 13, `p-4` 13, `p-1` 5,
`p-5` 3, then a long tail of asymmetric one-offs (`px-3 py-2`, `py-2 pl-4 pr-2`, `px-2 py-0.5`…).
A closed scale covers the head; the tail needs an escape hatch, not a bigger enum.

**Elevation — a real, token-driven axis on a small, coherent subset.**

> **Corrected 2026-08-16.** An earlier revision of this section claimed elevation was "effectively
> absent" and that the 7 shadow sites were `transition-shadow` on `CoverCard`. That was wrong, and
> wrong in an instructive way: the **count** came from the 72-site analyzer, but the **explanation**
> came from a separate grep over the 253-site `border border-line` population, where `CoverCard`
> does appear. `CoverCard` is not among the 34 files here at all. Two different populations were
> conflated and the mismatch was not noticed because the number looked plausible. The rule that
> catches this is the one already in AGENTS.md — assert the thing itself — applied to measurement:
> a count and its explanation must come from the same query.

`--shadow` is a **real per-skin × per-mode token**: 18 definitions in `tokens.css` plus one in
`brand.css`, a different `rgba` per combination. It is applied as `boxShadow: 'var(--shadow)'` —
17 occurrences across 13 files app-wide, and **7 of the 72** carry it on their own root:

| site                              | tone           | what it is                                       |
| --------------------------------- | -------------- | ------------------------------------------------ |
| `components/Modal.tsx`            | `--card-solid` | the dialog panel                                 |
| `components/AppShell.tsx`         | composite      | the mobile "more" sheet (`fixed inset-x-3 z-50`) |
| `components/UpdateToast.tsx`      | composite      | the update toast (inside a `fixed` container)    |
| `auth/AuthScreen.tsx`             | `--card`       | the auth card                                    |
| `auth/WelcomeScreen.tsx`          | `--card`       | the welcome card                                 |
| `routes/MatchRoute.tsx`           | `--card`       | the quiz card                                    |
| `components/SkinEvolveReveal.tsx` | `--card`       | the `role="status"` reveal banner                |

**No other shadow mechanism exists in the 72** — zero other `boxShadow` literals, zero Tailwind
`shadow-*` classes. So elevation is entirely on/off against one token, which is the easiest possible
shape to model.

**What distinguishes the 7 is "lifted off the page", and it splits two ways.** Three genuinely float
over content (modal, sheet, toast); four are the single dominant object on an otherwise empty screen
(auth, welcome, quiz, reveal banner). Both readings want the same shadow; neither is predicted by
layout position, which is why the first pass's overlay-vs-inline hypothesis had to be discarded —
`SkinEvolveReveal` and `MatchRoute` are ordinary inline elements.

**Elevation is NOT derivable from `tone`, but it is constrained by it.** `--card` appears on both
sides (4 raised, 25 flat), so tone cannot predict it. The implication runs one way only: **`--field`,
`--chip`, `--bg0` and bare never carry a shadow — 0 of 39.** Elevation belongs to the card family
alone.

**A related inconsistency this surfaced, worth fixing but not silently.** The three floating
surfaces all need an _opaque_ background, since content passes beneath them — and they achieve it
two different ways. `Modal` uses `--card-solid`; `AppShell`'s sheet and `UpdateToast` hand-roll
`linear-gradient(var(--card), var(--card)), var(--bg)`, each with its own comment explaining that
`--card` can carry alpha. Two spellings of "opaque card". Collapsing them onto `--card-solid` is
probably right but is a **visual change**, so it is raised here rather than folded into a mechanical
batch.

**Border — not universal, and the borderless population is far smaller than first counted.** The 72
were selected on `border border-line`. A first pass put the borderless kit carriers at 12
(`skin-panel` 3, `skin-card` 4, `skin-tile` 5) from a line-grep that counted a **comment mentioning
`.skin-tile`** as a carrier. Re-measured with the corrected opening-tag extractor:

| kit          | carriers | with `border border-line` | without | interactive |
| ------------ | -------: | ------------------------: | ------: | ----------: |
| `skin-panel` |       18 |                        16 |       2 |           2 |
| `skin-card`  |       26 |                        25 |       1 |          11 |
| `skin-tile`  |        7 |                         3 |       4 | **7 (all)** |

**7 borderless carriers, not 12 — and 5 of those are interactive `<button>`s.** Only 2 are
non-interactive containers (`components/Nameplate.tsx`, `routes/LabRoute.tsx`). `border` remains a
real axis of the API; the borderless population is not a migration target (see §7, decision 2).

---

## 3. Proposed API

Derived from §2's measured variation, not from what a card component usually has.

```tsx
type SurfaceProps = {
  /** Which surface token paints it. 'bare' = bordered + padded, no background (18 sites). */
  tone?: 'card' | 'field' | 'card-solid' | 'bare' // default 'card'
  /** Skin-driven radius. 'panel' and 'card' map to the existing kit classes. */
  radius?: 'panel' | 'card' | 'control' | 'none' // default 'card'
  /** Closed scale covering the measured head: 1→p-1, 2→p-3, 3→p-4, 4→p-5, 5→p-6. */
  pad?: 0 | 1 | 2 | 3 | 4 | 5 // default 2  (p-3, the most common)
  border?: boolean // default true
  /** Lifts the surface off the page: boxShadow: var(--shadow). 7/72 sites. See below. */
  raised?: boolean // default false
  /** The 17-combination tail — asymmetric padding etc. Escape hatch, not a second API. */
  className?: string
  /** 55 div / 8 p / 6 li / 2 details / 1 span — the element is NOT assumable. */
  as?: React.ElementType // default 'div'
} & React.HTMLAttributes<HTMLElement>
```

### `raised` — why a boolean, and why not folded into `tone`

The corrected §2 turns this from "omit the prop" into "include it", and the measured shape decides
its form:

- **A boolean, not a scale.** There is exactly one shadow token and no second step — 7 sites on
  `var(--shadow)`, zero other `boxShadow` literals, zero `shadow-*` classes. `elevation: 0 | 1 | 2`
  would invent two thirds of a system that does not exist — the same mistake the previous revision
  made, in the opposite direction.
- **Independent of `tone`, not a tone value.** The 7 span three backgrounds (`--card` x4, composite
  x2, `--card-solid` x1), so `tone: 'raised'` cannot express them. And `--card` sits on both sides
  of the split (4 raised, 25 flat), so tone cannot imply it either.
- **Constrained by `tone`, and the constraint is worth encoding.** Elevation appears only on the
  card family: `--field` / `--chip` / `--bg0` / bare are **0 for 39**. A dev-time warning when
  `raised` meets a non-card tone costs little and documents a real invariant — cheap enough to be
  worth it, not worth contorting the type signature over.
- **Default `false`.** 65 of 72 are flat, so the default is the common case; and a surface that
  silently lifts is the more surprising failure of the two.

Two deliberate omissions remain:

- **No `interactive` variant.** Buttons and fields have `.skin-control` / `.skin-field` already, and
  the whole reason the count fell from 181 to 72 is that they are a different primitive. A
  `Surface` that also does controls re-merges them.
- **`pad` is a closed scale with a `className` escape hatch**, rather than an open `pad` string.
  17 combinations is a tail, and a closed enum plus an escape hatch keeps the common case honest
  without pretending the tail is systematic.

### The 7 raised sites, expressed in this API

```tsx
<Surface tone="card-solid" raised radius="card" pad={3}>  {/* Modal — dialog panel         */}
<Surface tone="card-solid" raised pad={0} className="…">  {/* AppShell mobile "more" sheet */}
<Surface tone="card-solid" raised radius="none" …>        {/* UpdateToast — rounded-full   */}
<Surface tone="card" raised pad={5}>                      {/* Auth / Welcome cards         */}
<Surface tone="card" raised pad={4}>                      {/* Match quiz card              */}
<Surface tone="card" raised pad={2}>                      {/* SkinEvolveReveal banner      */}
```

Two of those route the composite `linear-gradient(var(--card), var(--card)), var(--bg)` background
onto `tone="card-solid"`. That is §2's inconsistency, and it is a **visual change requiring
verification per skin x mode** — the two are not guaranteed to render identically. It belongs in
batch 4 (the judgement-call batch) with a before/after diff, never in a mechanical one.

**Open question for review:** `tone` and `radius` are currently independent, but the existing kit
pairs them (`skin-panel` = panel radius, `skin-card` = card radius). Should `radius` default _from_
`tone`? Cheaper API, less expressive. I lean yes, defaulted-not-forced.

---

## 4. "Screenshot-comparison infra" — what it concretely means here

**Extend the existing audit harness; do not build something new.**
`apps/web/e2e/audits/*.audit.ts` behind `playwright.audit.config.ts` already has every hard part
solved and proven on the visual-overflow audit:

- **Skin/mode iteration that actually works** — through the profile, with the applied skin **read
  back** before anything counts, because ~20 components read `useStructure`/`useLabels`/`useVoice`
  and an attribute swap renders a page no reader sees.
- **Out of the gate by construction** — `.audit.ts` cannot match the main config's default
  `testMatch`, so a comparison run never turns `pnpm e2e` into "the audit ran".
- **Real fonts** (`stubFonts: false`) with load verification — and the visual-overflow work proved
  why that verification is not optional: a diagnosis there was silently measured against the
  _fallback_ face and produced a wrong fix.

What to add: a `surface-visual.audit.ts` that, for a fixed route list × 18 skin×mode combos,
screenshots each **`Surface` call site's bounding box** (not the full page — a full-page diff is
noise the moment any unrelated content shifts) and writes them to `audit-output/`. Run it on `main`
to capture a baseline, run it per batch, diff PNGs pixel-wise, and report **which site changed**
rather than "N pixels differ".

Two things this must not become:

- **Not a `toHaveScreenshot` snapshot gate in `pnpm e2e`.** Snapshot suites go stale, get blanket
  `--update-snapshots`, and then certify nothing. This is a discovery/diff tool run per batch, like
  the overflow sweep.
- **Not a full-page diff.** Per-site crops keep a diff attributable to a specific migration.

**Honest limit worth stating up front:** a pixel diff answers "did this change", never "is the
change correct". A genuinely-improved radius reads identical to a regression. The diff narrows where
to look; a person still rules.

---

## 5. Batching plan

Sized on the Track B precedent (25–40 sites/batch was workable there for _mechanical_ changes;
this is riskier per site, so batches are smaller) and the PR 5 rule that **a red run must mean one
thing**.

| batch | what                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |                                                                             sites | why this order                                                                                                                                                                |
| ----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0** | Build `Surface` + its unit tests + `surface-visual.audit.ts` + capture the `main` baseline. **Zero call sites migrated.** **Status: DONE. Component + 29 tests green. The harness reached a real 0 across 570 crops (not 62 — that figure was a `SURFACE_SKINS=tryst` subset), but only after THREE causes: motion, the `feTurbulence` ambient texture (#265), and `body`'s radial-gradient (`b3350c5`), which #265 missed and reported 0 without. Batch 1's precondition is met.** |                                                                                 0 | The instrument must exist and be trusted before it measures anything. A batch that ships the component _and_ migrates sites cannot tell a component bug from a migration bug. |
| **1** | The 25 sites already on `.skin-panel`/`.skin-card`. **DONE — 0 pixels changed across 570 crops, verified twice.** `tone` measured out card 10 / bare 10 / field 5.                                                                                                                                                                                                                                                                                                                  |                                                                                25 | Most mechanical: radius and background already come from tokens, so the diff should be **empty**. It was.                                                                     |
| **2** | ~~The 18 `tone="bare"` sites~~ → **8 remain**, and **all 8 also carry a hardcoded radius**, so this is now a strict subset of batch 3 and can no longer be an empty-diff batch. **Needs re-planning before it runs — see the note below.**                                                                                                                                                                                                                                          |                                                                  **8** _(was 18)_ | Ten of the original 18 were `.skin-panel`/`.skin-card` carriers and landed in batch 1.                                                                                        |
| **3** | The sites with a **hardcoded** Tailwind radius                                                                                                                                                                                                                                                                                                                                                                                                                                      | **42** _(§2 said 20; its own parenthetical sums to 40, and the tree measures 42)_ | The first batch that _should_ change pixels, per skin. Retires 42 Track-B-class hardcoded radii as a side effect.                                                             |
| **4** | The stragglers (`--card-solid` 2, `--bg0` 2, `--chip` 1, one hand-rolled gradient) **∪** the asymmetric-padding tail (21)                                                                                                                                                                                                                                                                                                                                                           |                                                                  **24** _(was 9)_ | Each needs a judgement call. **19 of the 21 asymmetric-padding sites also carry a hardcoded radius**, so most of this batch is already inside batch 3.                        |
| **5** | _Optional, separate decision:_ the 12 borderless kit carriers                                                                                                                                                                                                                                                                                                                                                                                                                       |                                                                                12 | Outside the 72. Flagged in §2 so the scope cannot quietly grow mid-migration.                                                                                                 |

### The batches are keyed to DIFFERENT AXES, they overlap, and every count above is perishable

This is the part to read before sizing any batch, because the counts alone will mislead again.

**Batch 1 is keyed to a radius mechanism** (`.skin-panel`/`.skin-card`), **batch 2 to a background**
(`tone="bare"`), **batch 3 to a radius value** (hardcoded Tailwind), **batch 4 to a background tail
plus a padding shape**. Those are four different questions asked of the same 75-site population, and
nothing makes a site answer only one of them. A site can be — and many are — in three batches at
once.

Measured on the tree after batch 1 landed, among the 50 remaining sites:

| overlap            |                           sites |
| ------------------ | ------------------------------: |
| batch 2 ∩ batch 3  | **8** — i.e. **all** of batch 2 |
| batch 3 ∩ batch 4  |                          **21** |
| batch 2 ∩ batch 4  |                               4 |
| in no batch at all |                               5 |

**The consequence for batch 2 is not cosmetic.** It is described above as "second-simplest, one
tone, no background question", which implies an empty diff. All 8 of its remaining sites carry a
hardcoded radius, so migrating them onto `Surface` changes the radius and therefore the pixels.
Batch 2 as written cannot run: it is either folded into batch 3, or re-scoped to something that is
genuinely empty-diff. **That is a planning decision and is deliberately left open here rather than
resolved by whoever noticed it.** Note also that `IndieScreen.tsx` holds 3 of the 8 — §6's
commit-boundary caution did not apply to batch 1 but applies squarely to whatever absorbs these.

**Every count in the table is accurate only as of the batches already landed.** Batch 1 moved batch
2 from 18 to 8 without anyone editing a number. The next batch will move others the same way.

**Why this went unnoticed: the counts were CALCULATED, not measured.** AGENTS.md's ratchet rule says
it directly — "A ratchet's budget must be a MEASUREMENT taken from the tree, never a calculation" —
and gives the reason a derived number is worse than a wrong one: it stays plausible while the tree
moves underneath it, and nothing fails. That rule was written about a test budget; this is the same
failure in a planning doc, which is a place nobody thought to apply it. §2's own radius split shows
the same shape a second time: it states 20 hardcoded sites while its own parenthetical breakdown
sums to 40, and the tree measures 42 — a count and its explanation from different queries, which is
precisely the error §2 corrected for elevation one paragraph earlier.

**So: re-measure before each batch, and print the number.** The extractor is a dozen lines over
`apps/web/src/**/*.tsx` — §2's population rule, then classify each site by its own `className` and
its adjacent `style={{ background }}`.

Order is deliberate: **empty-diff batches first**, so the harness earns trust on cases where any
change is a bug, before it is used on batch 3 where change is the point.

---

## 6. What the two mutation-testing incidents mean for batch size

Both prior incidents (`IndieScreen.tsx`, 6 uncommitted `.skin-control` migrations; and
`skinTokens.fixture.ts`, the uncommitted `card`/`line` additions) share one shape: **`git checkout --`
during a fast revert loop destroyed uncommitted work in a file that also held real edits.** Both are
addressed by `scripts/safe-revert.sh`, which backs up unconditionally before reverting.

Three consequences for this work specifically:

1. **`scripts/safe-revert.sh` is the default revert path for every batch. Not `git checkout --`.**
   Stated here so it is a precondition of the plan, not a thing to remember in the moment — the
   moment is exactly when it failed twice.
2. **Commit before any mutation run, and keep batches small enough that a batch is one commit.**
   Both incidents happened in files carrying many uncommitted migrations at once. A 20-site batch
   spread over 6 files is the danger shape; a committed batch makes any revert cheap.
3. **Verify with `git status --porcelain` after every revert.** Both incidents were invisible at the
   moment of loss — the mutant _did_ revert, so nothing looked wrong — and surfaced much later, once
   as a carrier count coming back 0.

`IndieScreen.tsx` carries 5 of the 72 and was the site of the first incident. Worth treating as its
own commit boundary within whatever batch it lands in.

---

## 7. Decisions — settled 2026-08-16

All four open questions are closed. Scoping ends here; Batch 0 builds.

**1. `radius` does NOT default from `tone`.** They stay independent props with their own flat
defaults (`tone` → `'card'`, `radius` → `'card'`). The tone→radius pairing only holds for
`card`/`card-solid` → `.skin-card`'s radius. There is no established kit pairing for `field` or
`bare`, and `.skin-panel`'s sites are not defined by background at all — §2 measured 18 `skin-panel`
carriers spanning several backgrounds. Deriving a mapping for the tones that do not have one would
be inventing structure from a pattern that covers part of the data, which is precisely the mistake
§2's elevation correction just fixed.

**2. The 7 borderless kit carriers are CUT from the plan entirely** — not deferred, not "batch 5
later". They carry no defect `Surface` exists to fix: they are already served correctly by their kit
classes and have no border inconsistency. The re-measurement above makes the case stronger than when
this was first raised — the population is 7, not 12, and **5 of the 7 are interactive buttons**, so
absorbing them would gain **2 sites** against 7 sites of review risk. Batch 5 is removed from §5.

**3. `Surface` does NOT absorb `.skin-tile` — permanent peer, not a future maybe.** `.skin-tile`
serves card-shaped _controls_, and `Surface`'s API excludes interactivity by design (§3). The
measurement settles it beyond the design argument: **all 7 `.skin-tile` carriers are interactive** —
6 `<button>`, 1 `<Link>`, zero containers.

> **Reconciling the count.** §7 previously said "3 sites" and §2's border breakdown said "5"; the
> real carrier count is **7**. All three numbers came from different queries: 3 = carriers that also
> have `border border-line`; 5 = a line-grep of carriers _without_ it, which counted a comment
> mentioning `.skin-tile` as a carrier; 7 = actual `className` carriers via the corrected extractor.
> **7 is the correct figure**, and the two older numbers are subsets or artifacts. Same failure mode
> as §2's elevation error — numbers from one query, described with another — which is why the
> extractor, not the grep, is now the tool of record for this doc.

**4. The `--card-solid` vs hand-rolled-gradient inconsistency IS fixed**, not merely flagged.
`Modal` uses `--card-solid`; `AppShell`'s mobile sheet and `UpdateToast` hand-roll
`linear-gradient(var(--card), var(--card)), var(--bg)`. All three collapse onto `tone="card-solid"`.
It stays in **batch 4** exactly as planned — a real visual change needing the per-skin × mode diff,
never a mechanical batch.
