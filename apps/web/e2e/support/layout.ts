import { expect, type Page } from '@playwright/test'

/**
 * Assert the PAGE does not scroll sideways.
 *
 * ── WHY THIS IS A SHARED HELPER AND NOT AN AUTO-FIXTURE ─────────────────────────────────────────
 * #208 made the font stub a fixture because it must be true for every spec unconditionally. This is
 * different: horizontal scroll is not universally wrong. SpineShelf is a horizontally-scrolling
 * surface by design, and specs that drive it would fail an assertion applied blindly to every page.
 * So this is opt-in — call it where a page is supposed to fit — rather than automatic.
 *
 * ── WHAT IT CATCHES, AND WHY IT'S MEASURED THIS WAY ─────────────────────────────────────────────
 * `documentElement.scrollWidth > clientWidth` is the actual symptom a reader feels: the viewport
 * pans, and content at the left edge goes off-screen. The usual cause is a flex or grid child
 * without `min-w-0` — both default to an automatic minimum size, so the child cannot shrink below
 * its content's intrinsic minimum and pushes the page wider instead. Confirmed instance:
 * AddRoute's `flex-1` column around ContributorEditor measured scrollWidth 532 vs clientWidth 390
 * at a 390px viewport, with contributors populated.
 *
 * The 1px tolerance absorbs sub-pixel layout rounding only. Anything wider is a real box, not noise.
 *
 * NEVER satisfy this assertion with `overflow-x: hidden` — that hides the symptom, leaves the box
 * wrong, and makes the next instance invisible. Fix the element that cannot shrink.
 */
export async function expectNoHorizontalScroll(page: Page, label: string): Promise<void> {
  const m = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    // The widest element crossing the right edge — turns "something overflows" into a fix-ready
    // pointer instead of a hunt. Reported only on failure.
    culprit: (() => {
      const vw = document.documentElement.clientWidth
      let worst = { sel: '', right: 0 }
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
        const r = el.getBoundingClientRect()
        if (r.width > 0 && r.right > worst.right) {
          worst = {
            sel: `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : ''}`,
            right: Math.round(r.right),
          }
        }
      }
      return worst.right > vw + 1 ? worst : null
    })(),
  }))

  expect(
    m.scrollWidth,
    `${label}: the page scrolls sideways — scrollWidth ${m.scrollWidth} vs clientWidth ${m.clientWidth}` +
      (m.culprit
        ? `; widest overflowing element: <${m.culprit.sel}> right edge at ${m.culprit.right}px`
        : '') +
      `. A flex/grid child is probably missing min-w-0. Do not "fix" this with overflow-x:hidden.`,
  ).toBeLessThanOrEqual(m.clientWidth + 1)
}
