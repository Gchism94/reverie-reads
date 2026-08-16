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

**Elevation — effectively absent.** 7 of 72 mention shadow, and inspection shows they are
`transition-shadow` on `CoverCard`, not a resting elevation. **There is no elevation system to
model.** A `Surface` should not invent one.

**Border — not universal.** The 72 were selected on `border border-line`, but 12 kit-class carriers
exist _without_ it (`skin-panel` 3, `skin-card` 4, `skin-tile` 5). So `border` is a real axis, and
those 12 are a second population the primitive should eventually absorb — out of scope for the first
pass, noted so the count doesn't silently grow later.

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
  /** The 17-combination tail — asymmetric padding etc. Escape hatch, not a second API. */
  className?: string
  /** 55 div / 8 p / 6 li / 2 details / 1 span — the element is NOT assumable. */
  as?: React.ElementType // default 'div'
} & React.HTMLAttributes<HTMLElement>
```

Three deliberate omissions, each because the data says so:

- **No `elevation`/`shadow` prop.** §2: there is no resting elevation anywhere in the 72. Adding the
  prop would invite a design decision nobody has made.
- **No `interactive` variant.** Buttons and fields have `.skin-control` / `.skin-field` already, and
  the whole reason the count fell from 181 to 72 is that they are a different primitive. A
  `Surface` that also does controls re-merges them.
- **`pad` is a closed scale with a `className` escape hatch**, rather than an open `pad` string.
  17 combinations is a tail, and a closed enum plus an escape hatch keeps the common case honest
  without pretending the tail is systematic.

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

| batch | what                                                                                                                      | sites | why this order                                                                                                                                                                                                                                               |
| ----: | ------------------------------------------------------------------------------------------------------------------------- | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **0** | Build `Surface` + its unit tests + `surface-visual.audit.ts` + capture the `main` baseline. **Zero call sites migrated.** |     0 | The instrument must exist and be trusted before it measures anything. A batch that ships the component _and_ migrates sites cannot tell a component bug from a migration bug.                                                                                |
| **1** | The 25 sites already on `.skin-panel`/`.skin-card`                                                                        |    25 | Most mechanical: radius and background already come from tokens, so the diff should be **empty**. A non-empty diff here means `Surface` itself is wrong — the cheapest possible place to learn that.                                                         |
| **2** | The 18 `tone="bare"` sites (bordered, padded, no background)                                                              |    18 | Second-simplest, one tone, no background question.                                                                                                                                                                                                           |
| **3** | The 20 sites with a **hardcoded** Tailwind radius                                                                         |    20 | The first batch that _should_ change pixels, per skin. Retires 20 Track-B-class hardcoded radii as a side effect. Must be its own batch precisely because a non-empty diff is expected here — bundling it with 1 or 2 would make their emptiness unreadable. |
| **4** | The 9 remaining stragglers (`--card-solid`, `--bg0`, `--chip`, asymmetric padding tail)                                   |     9 | Each needs a judgement call; small batch, per-site notes.                                                                                                                                                                                                    |
| **5** | _Optional, separate decision:_ the 12 borderless kit carriers                                                             |    12 | Outside the 72. Flagged in §2 so the scope cannot quietly grow mid-migration.                                                                                                                                                                                |

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

## 7. What is deliberately not decided here

- Whether `radius` should default from `tone` (§3).
- Whether the 12 borderless kit carriers join this migration or a later one (§2, batch 5).
- Whether `Surface` absorbs `.skin-tile` (3 sites, `--radius-card`) or leaves it as a peer.
