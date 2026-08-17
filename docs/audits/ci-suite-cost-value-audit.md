# CI suite cost-vs-value audit — what the seven jobs cost, and what they have actually caught

> **Status: acted on.** Three of the four recommendations are **implemented** on
> `chore/ci-suite-audit-followups` (stacked on `chore/a11y-timeout-raise` / #262): the third-party
> image stub is generalised into the shared fixture (§7.1), `e2e-mobile` is thinned to the
> viewport-sensitive spec family (§7.2), and `e2e-a11y`'s tripwires are retightened (§7.3).
> Recommendation 4 — leave `changes`, `secrets`, `gate`, `e2e` and `pgtap` alone — is **a decision
> recorded, not an action taken** (§7.4). §7.2 **overturns a documented prior decision**; the
> disagreement and the option not taken are stated there rather than buried.

Audited 2026-08-17 on `chore/ci-suite-audit-followups` (from `main` @ `1ed3d54`). Data is GitHub's
own run history via `gh run list` / `gh api .../jobs` — measured durations and conclusions, not
estimates. **Window: 2026-07-31 → 08-17, the full retained history: 184 `pull_request` runs, 19
red.** Per-job duration statistics come from the 55 most recent PR runs (Aug 13–17), which is the
range where per-job timing is complete for all seven jobs.

The audit was prompted by a real pattern, worth stating as the question it actually asked: a large
share of recent session time went to keeping the CI harness itself green rather than to the product
— the a11y dead-host saga, the visual-overflow audit harness, three specs independently flaky from
one `mode: 'system'` bug, a Docker port-bind race left unfixed by design. The question is whether
the suite's shape is proportionate to what it catches, or whether it accreted past that point.

## 1. Cost

A code PR costs **35.5 runner-minutes** (median) but only **12.8m of wall-clock**. The seven jobs
run in parallel, and `e2e` at 12.6m is the critical path.

**This governs every recommendation below.** Thinning or dropping `e2e-mobile`, `e2e-a11y` or
`pgtap` saves runner-minutes and maintenance attention; it saves **zero developer wait**. The only
lever on wall-clock is `e2e` itself, and `workers>1` is already ruled out on measured evidence in
`playwright.config.ts` — `workers=2` costs ~19m/run with one timing-sensitive failure per run, and
`workers=4` saturates the runner outright. There is no "make CI faster" recommendation available
that does not fight evidence the repo already gathered.

| job          | n   | median | p90   | max   | cap | slack at max              |
| ------------ | --- | ------ | ----- | ----- | --- | ------------------------- |
| `changes`    | 55  | 0.2m   | 0.2m  | 0.4m  | 5m  | **13×**                   |
| `secrets`    | 55  | 0.2m   | 0.3m  | 0.7m  | 5m  | **7.5×**                  |
| `gate`       | 54  | 1.5m   | 1.6m  | 1.7m  | 10m | **5.8×**                  |
| `e2e`        | 40  | 12.6m  | 13.1m | 13.4m | 20m | 1.5×                      |
| `e2e-a11y`   | 40  | 8.9m   | 22.1m | 23.1m | 30m | 1.3× → **3.6×** post-#262 |
| `e2e-mobile` | 41  | 10.7m  | 11.4m | 13.7m | 20m | 1.5×                      |
| `pgtap`      | 41  | 1.6m   | 1.8m  | 2.1m  | 10m | **4.7×**                  |

`e2e` and `e2e-mobile` caps are appropriately tight. The other five carry 3.6–13× slack. On the
cheap jobs that costs nothing but a dulled tripwire; on `e2e-a11y` it is the same defect the
`12m ceiling vs 1.3m actual` discovery found this week, and §7.3 fixes it.

## 2. What the 19 red runs actually were

| cause                                                       | runs   | share   |
| ----------------------------------------------------------- | ------ | ------- |
| **Dead third-party dependency**                             | **10** | **53%** |
| — font CDN (`fonts.spec.ts` ×4, `console-clean.spec.ts` ×1) | 5      |         |
| — cover hosts (`e2e-a11y` ×5)                               | 5      |         |
| Real product regression                                     | 4      | 21%     |
| Real formatting catch (`gate` / Prettier)                   | 3      | 16%     |
| CI infrastructure (`Set up job`, `setup-cli`)               | 2      | 11%     |
| Timing flake (spine guard on an unrelated branch)           | 1      | 5%      |
| Deliberate probe (`throwaway/type-error-coverage-check`)    | 1      | 5%      |

**Only 7 of 19 reds (37%) were real catches, and 3 of those were Prettier.** The single largest
maintenance cost across the whole suite is not any one job — it is **third-party network
dependence, at 53% of all reds, more than twice the number of real regressions caught.**

## 3. The four confirmed real catches

Each traced to a merged PR, not inferred from the spec's subject:

| spec                                                    | branch                       | PR                                                         |
| ------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------- |
| `route-viewport.spec.ts`                                | `fix/route-width-constraint` | [#140](https://github.com/Gchism94/reverie-reads/pull/140) |
| `spine-shelf-reachability.spec.ts` (stickiness)         | `polish/spine-pick-feel`     | [#148](https://github.com/Gchism94/reverie-reads/pull/148) |
| `spine-shelf-reachability.spec.ts` (stickiness, mobile) | `polish/spine-pick-feel`     | [#148](https://github.com/Gchism94/reverie-reads/pull/148) |
| `spine-shelf-reachability.spec.ts` (cover aspect)       | `fix/spine-reveal-window`    | [#149](https://github.com/Gchism94/reverie-reads/pull/149) |

All four are the SpineShelf/layout family — the same defect class that motivated `e2e-mobile`'s
existence. **Stated plainly rather than hedged: the spine and viewport guards are the
highest-value tests in the suite.** Every real product regression CI caught in 17 days was caught
by one of them.

## 4. Three premises the data contradicted

Recorded because each was believed going in and each is load-bearing for a different decision.

1. **`e2e-mobile` is not "a curated subset, not a full duplicate."** It runs **32 of `rest`'s 34
   spec files, 121 of 130 tests — 94%.** `testIgnore` excluded only `series-builder.spec.ts` and
   `shelf-regressions.spec.ts`.
2. **`e2e-mobile` is not shorter than `e2e-a11y`.** 10.7m median vs 8.9m — and 8.4m post-#262. It
   is the **second-longest job in the suite**.
3. **`e2e` is not "~17–25m."** On CI it is **12.6m median across a 12.6–13.4m range** — remarkably
   stable. The 17–25m figures are local `pnpm e2e` with no `--project`, which runs all three
   projects including the then-hanging a11y sweep. That number was measuring the a11y defect.

## 5. Per-job verdict

- **`changes` — keep exactly as-is.** Costs 11 runner-minutes across 55 runs; saved ~470 by
  skipping four heavy jobs on 14 docs-only PRs. **43:1 return**, zero maintenance, zero reds. The
  best-value job in the suite.
- **`secrets` — keep as-is.** Zero real catches in its life. For a leak scanner that is the
  _desired_ outcome, not a value failure, and at 0.2m it needs to catch one leak ever to have paid
  for itself against a pre-public repo. Watch that the full-history scan stays cheap as history
  grows.
- **`gate` — keep as-is.** 1.5m, 3 real catches. Its unit tests (2036 core + 332 web) have **never
  gone red in CI in 184 runs**, because `/gate` runs them locally before push. That is the design
  working, not waste; the CI copy is a backstop and at ~1m it is cheap insurance.
- **`e2e` — keep as-is.** Critical path, tight cap, 3 real catches, structural `workers=1` ceiling.
- **`e2e-mobile` — thin it.** See §7.2. Second-most-expensive job, 94% duplicated, and its entire
  catch record is viewport-sensitive.
- **`e2e-a11y` — keep, retighten.** Its historical catch (`6b148b7`, cross-skin AA contrast on five
  newly-swept skins) is exactly the kind of thing nothing else in the suite finds. See §7.3.
- **`pgtap` — keep, no track record yet.** 7 days old, 41 green runs, **zero real catches**, one
  infra red. At 1.6m the bar is low enough that "no catches yet" is not damning, and the
  honor-system problem it closes is real. Revisit after a month rather than crediting it now.

## 6. What this audit did **not** examine

- **Local-run catch history — the significant limitation.** CI reds capture only what slipped past
  `/gate` locally. The `listUsers()` pagination cascade, for one, was caught entirely in local runs
  and appears nowhere in this data. **CI-red counts therefore understate the suite's total value**,
  and a job with a thin CI record may still be earning its keep locally. Every conclusion above is
  about the _CI copy_ of a job, not about the tests themselves.
- Internal redundancy within the 2036 core unit tests.
- pgTAP assertion quality — only its run record.
- Dollar cost of runner-minutes.
- Whether `secrets`' full-history gitleaks scan degrades as history grows.

## 7. Recommendations, and what was done

### 7.1 Generalise the image stub into the shared fixture — **DONE**

The highest-value change available, and not a per-job question. #262 fixed this for `a11y` only;
`rest` and `mobile` load the same covers from the same 13 hosts and had gone red from the identical
class a week earlier. Moving the `resourceType`-based stub into `support/fixtures.ts`'s `page`
fixture would have prevented **10 of the 19 reds in this window** — more than every other change
combined.

Checked before writing, not assumed: three specs assert on rendered image pixels —
`discover-cover-quality.spec.ts` (reads `naturalWidth`/`naturalHeight`/`complete` to detect
degenerate Google renders), `route-viewport.spec.ts` and `spine-shelf-reachability.spec.ts`
(cover-aspect). All three serve their own dimensionally-exact fixture PNGs from routes registered
in the test body, and Playwright matches handlers in **reverse** registration order, so a
fixture-level stub registered first is matched last and never displaces them. A `stubCoverImages`
opt-out mirrors `stubFonts` for any future spec whose subject is real image delivery.

**Verified on CI run `32000050725`: all seven jobs green**, `e2e` 11.8m and `e2e-mobile` 11.5m — the
two projects that had never carried this stub before. `a11y` stayed at 8.4m with its local copy
removed, confirming the fixture reaches it.

**A local-verification detour worth recording, because it looked exactly like this change breaking
the suite.** The first full local run after the move came back **22 failed**. It was not this
change. Every failure was `422 email_exists` thrown from `admin.auth.admin.listUsers()` — a
Node-side call with no `page` object in it, which a `page.route` cannot reach — and the affected
accounts sat at rows 52/57/58/60 of 61, newest-first, past `listUsers`' default 50-per-page limit.
The fix for that (`03cea04`, `{ perPage: 1000 }`) is **stranded on the unmerged #258** and is on
neither `main` nor this branch. On CI, which builds a fresh database per run, the identical tree is
green. The tell that separated the two causes in seconds rather than a bisect: the failures were all
~150–300ms, i.e. in fixture setup, before any page load.

### 7.2 Thin `e2e-mobile` to the viewport-sensitive family — **DONE, and it overturns a prior decision**

**The disagreement, stated plainly.** `docs/audits/e2e-mobile-viewport.md` §2 set the opposite
criterion deliberately: _"run a spec on `mobile` unless its own assertions are about a desktop-only
pointer mechanic … a regression there is a real regression on a phone."_ That is a reasoned
position, not accretion, and this audit contradicts it. Three things decided it:

1. That audit's own §4 found **zero** mobile-only failures across all 83 tests at introduction, and
   concluded the CRUD/import/routing/offline-cache surface is _"provably viewport-agnostic today."_
   Re-running a provably viewport-agnostic surface is the definition of redundant.
2. In 17 days of real history, `e2e-mobile`'s only unique catches were `route-viewport` and
   `spine-shelf-reachability`. Its other three reds (`fonts` ×2, `console-clean`) duplicated
   failures `rest` caught in the **same run**.
3. It has grown from 72 tests / 2m32s at introduction to 121 tests / 10.7m — a cost the original
   decision did not price.

**The option not taken, named because the prior doc named it first.** `e2e-mobile-viewport.md` §3
pre-specified its own fallback if cost bit: _"split it off further (nightly/main-only) rather than
cutting it from PRs, since PR-time is where a mobile regression is cheapest to catch."_ That
remains a coherent alternative and would save more runner-minutes (all 10.7m). It was not taken
because it removes PR-time catching from the two specs that have **actually caught** mobile
regressions, which is the opposite of what the evidence supports. A third option — thin at PR time
**and** run the full mobile matrix nightly — is strictly better than either and is left for the
owner, since adding a scheduled workflow is a new decision, not a follow-up to this audit.

**The list, sanity-checked against what each spec asserts rather than what its name suggests.** The
audit's first draft was adjusted in two places:

| spec                                  | verdict  | why                                                                                                                                |
| ------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `spine-shelf-reachability.spec.ts`    | keep     | gesture/track-width invariants; the guard `e2e-mobile` exists for                                                                  |
| `route-viewport.spec.ts`              | keep     | per-route layout at the viewport; caught #140                                                                                      |
| `no-horizontal-overflow.spec.ts`      | keep     | page-level overflow, phone widths                                                                                                  |
| `placeholder-title-clip.spec.ts`      | keep     | text clipping at narrow widths                                                                                                     |
| `cover-card-touch-affordance.spec.ts` | keep     | touch affordance under `hasTouch`                                                                                                  |
| `scroll-restoration.spec.ts`          | keep     | `window.scrollY` across navigation — depends on whether content overflows at all                                                   |
| `shelf-header-links.spec.ts`          | **ADD**  | `boundingBox` + `page.mouse.click` at real coordinates; explicitly handles a header below the viewport bottom                      |
| `tab-routing.spec.ts`                 | **DROP** | route state vs `useState` on back-navigation. Zero viewport dependence — confirmed by reading its assertions, not by keyword score |

`series-builder.spec.ts` and `shelf-regressions.spec.ts` stay excluded exactly as before, for the
desktop-gesture reasons `playwright.config.ts` already documents.

**Latency cost of this change, stated explicitly:** a regression that manifests _only_ at 390px, in
a spec outside this family, would no longer fail the PR — it would surface whenever someone next
ran the full suite at a mobile viewport, which is now nothing automatic. There is no instance of
such a defect in 17 days of history, and the prior audit found none at introduction either. That is
the risk being accepted, and the nightly option above is the cheapest way to buy it back.

**Measured after, and the audit's own estimate was wrong.** 121 tests → 26, across 7 spec files;
`rest` untouched at 130. `e2e-mobile` on CI: **11.5m → 6.3m** (runs `32000050725` → `32000903462`,
all seven jobs green in both). The audit predicted "~8–9 runner-minutes"; the real saving is
**5.2m**, because ~1.9m of the job is fixed setup that does not shrink (checkout, pnpm install,
Playwright cache, Supabase start) and the specs kept — `spine-shelf-reachability` and
`route-viewport` — are among the slowest in the suite. The estimate is left visible rather than
edited away: it was derived from test count, and test count is not runtime.

### 7.3 Retighten `e2e-a11y`'s tripwires — **DONE**

Per-pass `test.setTimeout` **720s/240s → 240s/90s**; job `timeout-minutes` **30 → 15**.

Taken from measurement, in the shape `c157c1b` set — and from **two** independent CI runs rather
than one, since a budget from a single observation is the guess-wearing-a-ratchet's-clothes this
repo has been bitten by before:

| source                      | tryst full passes | core passes | whole job |
| --------------------------- | ----------------- | ----------- | --------- |
| CI run `31994806370` (#262) | 1.3m / 1.3m       | 28.0–28.6s  | 8.4m      |
| CI run `32000050725` (#263) | 1.2m / 1.2m       | 25.5–26.2s  | 8.4m      |
| CI run `32001881355` (#263) | 1.4m / 1.4m       | 29.6–30.6s  | 8.9m      |
| CI run `32002947099` (#263) | 1.3m / 1.3m       | 27.7–28.8s  | 8.3m      |
| local, same tree            | 47.7s / 46.2s     | 16.7–17.3s  | —         |

Both new per-pass ceilings are **~2.9× the worst value across all three runs** (84s and 30.6s), not
the median, and deliberately the same ratio so the two cannot drift apart the way 12m-vs-4m did.

**The measurement was corrected twice, and both corrections are the point.** The first draft
justified the ratio against "±3.5% variance" — the _within-run_ spread across the eight core
passes, which is not what a ceiling has to tolerate. Restating it against _between-run_ spread from
two runs gave ~8%/~12% and a 3.1× ratio. Then the third run came in slower than either
(tryst 1.4m, core 29.6–30.6s) and exceeded the "worst observed" both earlier drafts were written
against, putting the real between-run spread at **17% for tryst and 20% for the core set** and the
real ratio at 2.9×. Two runs badly understated it. The budget still clears 20% with room, and the
saturation events it exists to catch are far larger (`workers=2` ≈ 1.5×; `workers=4` blew a 600s cap
on a sweep whose normal was ~390s) — but "worst of two" was a guess wearing a measurement's clothes,
which is exactly the failure mode the ratchet rule names.

**A suspected climb, ruled out — recorded so nobody re-opens it.** The first three runs read
25.5 → 28.0 → 29.6s on the core set, monotonically, which looked like drift worth watching. The
fourth came back at 27.7s. It is variance around ~28s, not a trend. Worth keeping as a small
methodological note: three consecutive points in one direction is common enough under pure variance
that it is not evidence on its own, and the draft that flagged it was over-reading the data.

The job cap is 1.8× rather than 3.1× on purpose: it also covers fixed setup that does not scale
with a starved worker pool, so sizing it by the same ratio would make it fire first and mask which
pass went slow. The per-pass budgets are the sharp tripwire; the job cap is the backstop against a
hung runner slot.

**A related cap this audit did not touch:** `e2e-mobile` now runs 6.3m against a 20m
`timeout-minutes` — 3.2× slack, the same dulled-tripwire shape §1 flags on five other jobs. It was
left alone because §7.3's scope was `e2e-a11y`, and because one run is not yet enough measurement
to set it. It should be retightened once `e2e-mobile` has a few runs at its new size.

### 7.4 Leave `changes`, `secrets`, `gate`, `e2e`, `pgtap` alone — **decision recorded, no action**

Not an omission. Each is justified in §5 on its own measured record: `changes` at 43:1, `secrets`
as negligible-cost catastrophic-risk insurance whose zero-catch record is the desired outcome,
`gate` as a cheap local-discipline backstop, `e2e` as the critical path with a structural
parallelism ceiling, `pgtap` as too new to judge. **`pgtap` is the one to revisit** — if it is
still at zero real catches a month from now, that is a genuine finding rather than a null result,
and this section is the marker to come back to.
