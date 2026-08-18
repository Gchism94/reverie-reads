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

Sized on the Track B precedent (25–40 sites/batch was workable there for _mechanical_ changes; this
is riskier per site, so batches are smaller) and the PR 5 rule that **a red run must mean one thing**.

**Re-scoped 2026-08-17, and the reason is structural rather than arithmetic.** The first version of
this table keyed each batch to a different AXIS — batch 1 to a radius mechanism, 2 to a background,
3 to a radius value, 4 to a background tail plus a padding shape. Axes are properties of sites, not
partitions of them, so the batches overlapped: after batch 1 landed, **all 8** of batch 2's
remaining sites were also batch 3 sites, 21 sites were in both 3 and 4, and 5 sites were in no batch
at all. Batch 2's stated premise ("second-simplest… no background question", implying an empty diff)
had become impossible, because every one of its sites carried a hardcoded radius.

**A site is migrated all at once.** Replacing a `<div className="…">` with `<Surface tone radius pad
border className>` resolves every axis that site sits on in the same edit, so a site cannot be "in
batch 3 for its radius and batch 4 for its padding" — whichever batch reaches it first resolves
both. The table below is therefore a **disjoint partition of the 50 remaining sites**, keyed to
radius VALUE, with the other axes used to predict each batch's diff rather than to define membership.

> **The partial-migration path exists and is deliberately not used.** `radius: 'none'` emits no class
> and `className` is appended verbatim, so `<Surface radius="none" className="rounded-2xl">` is
> expressible and would adopt `Surface` while preserving a hardcoded radius — an "adopt now, fix the
> radius later" two-phase plan is genuinely available. It is rejected because the intermediate state
> launders a hardcoded radius through the escape hatch §3 reserved for the padding TAIL, and a site
> in that state _looks_ migrated while still carrying the defect the migration exists to retire. If
> phase 2 ever stalled — batch 1 stalled a week on a harness bug — the repo would hold 42 sites
> wearing the primitive and keeping the defect. That is this repo's own "dead code wearing tests"
> shape, applied to a migration.

| batch | what                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |           sites | diff expected?                                                                                                                                                                            |
| ----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0** | Build `Surface` + tests + `surface-visual.audit.ts` + the `main` baseline. **DONE.**                                                                                                                                                                                                                                                                                                                                                                                                                                                   |               0 | — Harness reached a real 0/570, but only after three causes: motion, the `feTurbulence` texture (#265), and `body`'s radial-gradient (`b3350c5`) which #265 missed.                       |
| **1** | The 25 sites on `.skin-panel`/`.skin-card`. **DONE — 0 pixels changed, verified twice.**                                                                                                                                                                                                                                                                                                                                                                                                                                               |              25 | **None, and none observed.** Radius and background already came from tokens.                                                                                                              |
| **2** | The token-radius / no-radius sites. **DONE — 0 pixels changed across 570 crops, verified across 2 observations.** Re-measuring moved this 8 → **6**: `SeriesStrip.tsx:74` is an interactive `<Link>` on `.skin-tile` (out of scope per §7 decision 3, and never among the 570 crops), and `Modal.tsx:44` carries `.rv-modal` — a RESPONSIVE radius (`24px 24px 0 0` under 640px, `var(--radius-panel)` over) that `Surface`'s enum cannot express, and it needs `forwardRef` for focus-on-open. Modal moves to the API-question batch. | **6** _(was 8)_ | **None, and none observed.** `radius="control"` emits `rounded-[var(--radius-control)]` verbatim; `radius="panel"` emits `skin-panel`, the same var `OnboardingRoute.tsx:283` set inline. |
| **3** | The **17** `rounded-2xl` sites. **Carries `IndieScreen.tsx` ×4 — see §6.**                                                                                                                                                                                                                                                                                                                                                                                                                                                             |          **17** | **Yes, per skin.** One mapping decision: `rounded-2xl` → which radius token?                                                                                                              |
| **4** | The **15** `rounded-xl` sites. Carries `IndieScreen.tsx` ×1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |          **15** | **Yes, per skin.** One mapping decision: `rounded-xl` → which token?                                                                                                                      |
| **5** | The **10**-site small-value tail: `rounded-full` 4, `rounded-3xl` 3, `rounded-lg` 3                                                                                                                                                                                                                                                                                                                                                                                                                                                    |          **10** | **Yes.** Three mapping decisions, accepted in one batch because 10 sites is cheap to attribute; split it if a diff proves ambiguous.                                                      |

**8 + 17 + 15 + 10 = 50, disjoint and complete** — measured on the tree, not derived.

**Padding and tone are resolved inside whichever radius batch owns the site, never separately.** The
21 asymmetric-padding sites distribute as batch 5 ×9, batch 4 ×8, batch 3 ×2, batch 2 ×2; they take
`pad={0}` plus `className`, exactly as batch 1's tail did. Tone likewise spans every batch (batch 3
is card 10 / bare 5 / bg0 2, for instance) and is read per site from the background it actually
paints. **Do not look for a padding batch or a tone batch — there isn't one, by construction.**

**The 5 sites that were in no batch at all**, named because they had been invisible in every version
of this table: `ClubsRoute.tsx:67`, `ClubsRoute.tsx:156`, `PlannerRoute.tsx:301`,
`ShelfRoute.tsx:152`, `ShelvesRoute.tsx:460`. All five are the same thing — a segmented-control
wrapper, `rounded-[var(--radius-control)]` + `p-1` + `border border-line`. They fell through because
they carry a token radius (so not batch 3), an ordinary tone (so not batch 4's tail) and scale
padding (so not its padding tail). They are batch 2 now, and being uniform they are the cheapest
sites in the plan. Nothing is excluded from the partition, so there is no exclusion needing a reason.

**Batch 5 (the "12 borderless kit carriers") is deleted from this table.** It was already removed by
§7 decision 2 — "not deferred, not 'batch 5 later'… **Batch 5 is removed from §5**" — and its count
had already been disproved by §2's re-measurement ("**7 borderless carriers, not 12**"; the 12 came
from a line-grep that counted a comment mentioning `.skin-tile`). The row survived both corrections
because neither propagated to the table. Three sections of one document disagreed three different
ways — §5 vs §7 on whether the batch existed, §5 vs §2 on its size, and §5 vs the tree on every
other count — and each disagreement survived several careful passes. Hence the ordering below.

### Ordering, and why it is no longer "empty-diff first"

The original line read: _"Order is deliberate: **empty-diff batches first**, so the harness earns
trust on cases where any change is a bug, before it is used on batch 3 where change is the point."_

**That principle is retained, not retired — it turned out to have one batch left.** The re-scope was
expected to kill it, since batch 2's empty-diff premise was dead and every remaining batch keys to a
hardcoded radius. Measuring the partition found otherwise: the 8 sites in the new batch 2 map to an
emitted class **identical** to what they render today, so batch 2 is genuinely empty-diff and runs
first for exactly the original reason.

**What batch 1 already bought, stated so it is not re-litigated:** `Surface` provably reproduces
token-driven output — 0 pixels changed across 570 crops, twice. Batches 3–5 do not need to re-prove
that; their diffs are read as "did the radius change the way we intended, and did nothing else
move?" The harness's value there is the second half of that question, and it is undiminished.

**After batch 2, the principle has no further batches to order** — 3, 4 and 5 all expect diffs, and
their order is by size (largest mapping decision first, so the ambiguous cases surface while
attention is highest). If a future batch turns out empty-diff, put it first again.

### Every count here is perishable, and that is the point

**A third failure mode, found by batch 2 and worth more than its count.** Batch 2's three corrections
were all MISCLASSIFICATIONS, not miscounts: a `<Link>` that a lowercase-tag filter let through; a radius
set by a bespoke responsive class (`.rv-modal`); and a radius set by INLINE STYLE
(`OnboardingRoute.tsx:283`), which `radius="none"` would have silently dropped, producing exactly the
non-empty diff this batch exists to rule out. One shape behind all three: **a classifier that reads only
`className` cannot see a radius set inline, set by a bespoke class, or living on an element the
population rule excludes for another reason.** Re-measure with the harness's own `tagSurfaces()` rule,
and read `style=` as well as `className`.

Batch 1 moved batch 2 from 18 to 8 without anyone editing a number. **Re-measure before each batch
and print what you measured.** AGENTS.md's ratchet rule says it directly — "A ratchet's budget must
be a MEASUREMENT taken from the tree, never a calculation" — and the reason a derived number is
worse than a wrong one is that it stays plausible while the tree moves underneath it, and nothing
fails. This document has now demonstrated that three times over: §5's batch-2 count (18, actually
8), §2's radius split (states 20, its own parenthetical sums to 40, the tree measures 42), and §5's
deleted batch 5 (12, actually 7, and already cut).

The extractor is a dozen lines over `apps/web/src/**/*.tsx`: §2's population rule (`border
border-line` + padded + non-interactive + not `.skin-control`/`.skin-field`), then classify each
site by its own `className` radius literal and its adjacent `style={{ background }}`. **Counts in
this table were measured that way on 2026-08-17 against `feat/surface-batch1`.**

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
own commit boundary within whatever batch it lands in — **measured 2026-08-17, that is batch 3 (4
sites: `:159`, `:308`, `:336`, `:361`, all `rounded-2xl`) and batch 4 (1 site: `:259`,
`rounded-xl`).** It carried none of batch 1's 25, which is why this caution did not apply there.

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
