# Adding a mobile viewport to the e2e suite

`chore/e2e-mobile-viewport`, off `main` @ `79ea917` (`docs/audits/mobile-shelf-interaction.md`).
Both Playwright projects were `devices['Desktop Chrome']`; this branch adds a touch-viewport third
project and reports what running the existing suite through it actually finds.

## 1. The descriptor, and why it isn't `devices['iPhone 13']` verbatim

```ts
{
  ...devices['iPhone 13'],
  viewport: { width: 390, height: 844 },
  defaultBrowserType: 'chromium',
}
```

- **390×844** is the exact viewport the mobile-shelf-interaction audit measured against, not
  `iPhone 13`'s stock `390×664` (Safari's own chrome eats 180px of the 844 screen height in that
  descriptor). Pinning the viewport keeps this project's numbers comparable to that audit's.
- `isMobile`, `hasTouch`, the iPhone UA and `deviceScaleFactor: 3` come from the descriptor as-is
  — that's the "iPhone-class touch" half of the ask.
- **`defaultBrowserType` is forced back to `'chromium'`.** `devices['iPhone 13']` sets it to
  `'webkit'`, and Playwright's `browserName` fixture reads that field directly
  (`playwright/lib/index.js:194-195`) — spreading the device unmodified would silently switch the
  engine. CI only installs Chromium (`ci.yml:149/224`, `playwright install --with-deps chromium`);
  adding WebKit as a second engine is a real decision (extra install step, extra CI minutes, a
  second set of platform quirks to own) and not one this branch makes by accident. If a real
  Safari-specific defect surfaces later, that's grounds to open the WebKit question deliberately.

## 2. Which existing specs run on both projects

**Criterion:** run a spec on `mobile` unless its own assertions are _about_ a desktop-only pointer
mechanic. Everything else — forms, CRUD, imports, routing, offline cache, cover sourcing — drives
the app through the same `click`/`fill`/`goto` primitives regardless of viewport, and a regression
there is a real regression on a phone. Two files fail that test and stay desktop-only:

| File                        | Why excluded                                                                                                                                                                                                                                                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `series-builder.spec.ts`    | Its drag test drives `page.mouse.move/down/up` directly — a literal desktop mouse gesture, not `SeriesArranger`'s touch-capable dnd-kit `PointerSensor` exercised through touch input. Passing here would prove the mouse path works, which is already proven; it says nothing about touch.                    |
| `shelf-regressions.spec.ts` | Its drag-hijack guards (`draggable={false}` on cover `<img>`s, `dragTo` reorders) are about `SpineShelf`, whose mobile behavior is the subject of `docs/audits/mobile-shelf-interaction.md` and reserved for `fix/spine-shelf-overlay`. This branch was explicitly told not to add or modify shelf assertions. |

Both files were still **run once** against the mobile viewport as a one-off probe (§4) to see
whether excluding them from the permanent project was hiding anything — it wasn't, for a reason
worth stating plainly there.

`a11y.spec.ts` stays out of the `mobile` project's `testMatch` and out of `rest`'s scope, unchanged
— it already sweeps four skins × both modes and adding a viewport axis to that is its own scope
decision, not a side effect of this one. It was also run once as a probe (§4).

Every one of the other 21 spec files runs on `mobile` unmodified, no `testIgnore` beyond the two
above and `a11y.spec.ts` itself.

## 3. Wall-clock cost

Measured locally, fresh DB (`db:reset && db:seed`) once, `E2E_WORKERS` unset (default 1), retries 0:

| Project                                                                               | Tests | Time       |
| ------------------------------------------------------------------------------------- | ----- | ---------- |
| `mobile` (permanent)                                                                  | 72    | **2m 32s** |
| `series-builder` + `shelf-regressions` at mobile viewport (probe only, not permanent) | 9     | 32s        |
| `a11y.spec.ts` at mobile viewport (probe only, not permanent)                         | 2     | 3m 17s     |

For reference, `playwright.config.ts`'s own historical measurements at workers=1 (desktop):
`rest` ≈ 1.9m, `a11y` ≈ 4.4m, total ≈ 6.3m.

**This does lengthen the suite** — `mobile` at 2m32s is roughly as expensive as the entire existing
`rest` project — but `e2e` and `e2e-a11y` already run as two parallel CI jobs on separate runners,
specifically so a11y's ~55-58% share of wall-clock isn't serialized with everything else
(`ci.yml`'s own comment on that split). Added as a **third parallel job** the same way, `e2e-mobile`
rides alongside `e2e-a11y` rather than extending the critical path: it's faster than `e2e-a11y`
locally, so the pipeline's bottleneck stays wherever it already was. **Proposal implemented on this
branch:** a new `e2e-mobile` job, structurally identical to `e2e-a11y` (own runner, own Supabase
stack, `--project=mobile`), running on every PR — not added to required status checks yet, mirroring
how `e2e-a11y` itself was introduced as non-required until it had run for real on a few PRs. If GH
runner cost or queue time turns out to disagree with the local measurement, the fallback is the
same lever already used once: split it off further (nightly/main-only) rather than cutting it from
PRs, since PR-time is where a mobile regression is cheapest to catch.

## 4. Which existing specs fail at the mobile viewport

**None. All 83 tests across every existing spec — the 72-test `mobile` project, the 9-test
`series-builder`/`shelf-regressions` probe, and the 2-test `a11y.spec.ts` probe — passed at the
390×844 touch viewport.** That is a real answer, not a placeholder for one I didn't find: the
expectation going in was a list longer than the two hand-found defects, and the honest result is
zero from this method.

**Why, and why that's not evidence of mobile-safety.** This is the same limit
`docs/audits/mobile-shelf-interaction.md` already named for defect A: headless Chromium does not
run real momentum-physics touch scrolling, and — the finding this run adds — it doesn't
meaningfully change _any_ interaction under `isMobile`/`hasTouch` emulation. `page.click()`,
`page.fill()`, and `locator.dragTo()` all dispatch through Chromium's synthetic input layer
regardless of those flags; a real iPhone's touch event model, momentum curves, and 300ms-tap
history don't exist in this environment to diverge from. Concretely: `shelf-regressions.spec.ts`'s
`dragTo` reorders — the exact mechanism the shelf audit named as one of the two real mobile
defects, confirmed by hand on a device — **pass clean under this same mobile viewport in this
suite**, for the identical reason the shelf audit's own temporary measurement spec found that a
programmatic `scrollLeft` assignment reaches both ends fine while the real gesture fails. A
viewport change alone doesn't reach either known defect; both needed hands-on-device confirmation
to be caught at all.

**What this run is actually evidence of:** the _other_ class of mobile defect — layout that
reflows badly at 390px, elements that end up off-screen or overlapping, forms that become
unusable at a narrow width, navigation that breaks under `isMobile`'s UA/touch flags — is not
present in the 21 non-excluded spec files' current assertions. That's a real, if narrower, result:
the bulk of the app's CRUD/import/routing/offline-cache surface is provably viewport-agnostic
today. It says nothing about gesture-driven, momentum-driven, or hover-dependent defects, which
need the on-device or real-touch-input verification method the shelf audit already used and which
no addition to this config can substitute for.

## What this branch did not do

- No shelf assertion was added or modified — the invariant guard for defect A stays reserved for
  `fix/spine-shelf-overlay`, per the brief.
- No fix for anything — this branch adds test infrastructure and reports; item 4's null result is
  reported as found, not padded.
- No WebKit — see §1.
