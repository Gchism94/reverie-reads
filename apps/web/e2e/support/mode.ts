import { expect, type Page } from '@playwright/test'

/**
 * Assert the page has RESOLVED to a known light/dark surface before anything measures colour.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────────
 * `mode` is `'light' | 'dark' | 'system'`, and `'system'` resolves at runtime through
 * `prefers-color-scheme`. A spec that seeds `'system'` and then runs an axe contrast scan is
 * therefore asserting against whichever surface the environment happens to hand it — the same tree,
 * the same commit, two different answers. That is not a flaky app; it is a flaky question.
 *
 * Observed for real on PR #252's gate: `import-quality.spec.ts` failed axe `color-contrast`
 * (`#9a898f` on `#f9f4f0`, ratio 3.02, on a `disabled:opacity-50` button) in one run and passed the
 * next with no code change between them. The failing run had resolved LIGHT.
 *
 * ── WHY A SEEDED `mode` IS NOT ENOUGH ON ITS OWN ────────────────────────────────────────────────
 * Pinning the profile to `'dark'` is the fix, but the profile is not what paints the page: the boot
 * script reads localStorage pre-paint, the store hydrates from the profile on sign-in, and only then
 * does `<html data-mode>` settle. A scan that runs before that hydration lands measures the
 * pre-hydration surface and the pin silently buys nothing. So the pin is asserted, not assumed —
 * this reads the value the page ACTUALLY resolved to, which is the thing the scan depends on.
 *
 * Call it immediately before an axe run (or any colour assertion) in a spec whose profile pins a
 * mode. It polls, because hydration is async and asserting on the first tick would be a negative
 * assertion that passes before the thing it denies could have happened.
 */
export async function expectResolvedMode(
  page: Page,
  mode: 'light' | 'dark',
  label: string,
): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.mode ?? ''), {
      message:
        `${label}: the page has not resolved to ${mode}. A colour assertion here would be measured ` +
        `against whatever surface the environment produced, which is exactly the nondeterminism the ` +
        `seeded mode exists to remove. Check the profile seed and that sign-in hydration ran.`,
      timeout: 10_000,
    })
    .toBe(mode)
}
