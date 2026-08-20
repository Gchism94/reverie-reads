/**
 * COVER-OVERLAY SURFACES — every mark this app paints on top of artwork it does not control.
 *
 * ── The blind spot this closes ──────────────────────────────────────────────────────────────────
 * `statePill.contrast.test.ts` states the principle: "any rgba()/transparent surface is a scrim
 * whose contrast depends on the artwork behind it, which no test can bound." It then enforces that
 * principle for exactly one component, because it is keyed to `STATE_PILL_TOKENS`. A component that
 * uses a scrim INSTEAD of a token is therefore invisible to it — and reads as covered, because the
 * suite is green. That is how `CoverCard`'s marks kept the pattern the pills abandoned: nothing was
 * looking, and the thing that would have looked was keyed to a list the component isn't on.
 *
 * The same shape as the `--project=rest` false green: when an instrument's coverage IS a list,
 * everything off the list looks clean.
 *
 * ── Why this is a registry the SOURCE is checked against, not a second list ─────────────────────
 * A hand-maintained list of "components to check" would drift the moment someone adds a sixth mark.
 * So `coverOverlay.contrast.test.ts` SCANS the app source for the thing that actually matters —
 * a translucent background inside a file that paints uncontrolled cover artwork — and requires every
 * site it finds to appear below. A new scrim over a cover fails the guard until someone declares it
 * and states which case it is. The registry cannot silently fall behind the code, because the code
 * is the input.
 *
 * ── Two classes, and only one of them is a hazard ───────────────────────────────────────────────
 * · OVER_ARTWORK — composites over a real cover image. Contrast is unbounded: the worst case is
 *   white artwork, where a black scrim at alpha a composites to rgb(255(1-a)) and nothing darker.
 * · OVER_OWN_ART — composites over a surface this app generated (the skin placeholder, a token
 *   gradient, a spine tint). Bounded by tokens, and covered by that component's own contrast test.
 */

/** The scrim composite over the WORST-CASE backdrop: white artwork. Black at `alpha` over #fff.
 *  Returned in `adaptive`'s Rgba shape (r,g,b,a) so it feeds contrastRatio directly. */
export function scrimOverWhite(alpha: number): [number, number, number, number] {
  const v = Math.round(255 * (1 - alpha))
  return [v, v, v, 1]
}

export interface CoverOverlaySurface {
  /** repo-relative file, as the scanner reports it */
  file: string
  /** the literal that appears in source, so the scan can match declarations to sites */
  scrim: string
  /** what the reader sees there */
  what: string
  class: 'OVER_ARTWORK' | 'OVER_OWN_ART'
  /** why OVER_OWN_ART is bounded — required for that class, so the claim is stated, not assumed */
  bounded?: string
  /**
   * Set only where a mark is KNOWN to sit below the 3:1 non-text floor over worst-case artwork.
   * Counted, not excused — the same discipline as the control-radius meter's budget. Each entry
   * names its measured worst case so a future reader is arguing with a number, not an impression.
   */
  belowFloor?: string
}

export const COVER_OVERLAY_SURFACES: readonly CoverOverlaySurface[] = [
  {
    file: 'apps/web/src/components/CoverCard.tsx',
    scrim: 'rgba(0,0,0,0.45)',
    what: 'the READ/DNF, spice, format and favourite marks over a real cover',
    class: 'OVER_ARTWORK',
    belowFloor:
      'THREE of the six mark sites ink with var(--mark-accent) (CoverCard.tsx:103, :159, and the ' +
      'FAVED heart at :125). Measured over the worst case — 0.45 black on white artwork, ' +
      'rgb(140,140,140) — all 18 skin accents land at 1.09–2.69:1, under the 3:1 non-text floor. ' +
      'The component states the trade deliberately ("over a real cover (contrast skipped over the ' +
      'image), always in the accent"), which is exactly the decision the state pill reversed. ' +
      'Ruling on the READ/spice marks is a design call for the owner; the heart was ruled here ' +
      '(see the test file) because its own unfaved state already answers it.',
  },
  {
    file: 'apps/web/src/components/CoverCard.tsx',
    scrim: 'rgba(0,0,0,0.62)',
    what: 'the same marks over the skin placeholder',
    class: 'OVER_OWN_ART',
    bounded:
      'this branch renders only when showsPlaceholder, i.e. over CoverPlaceholder’s own ' +
      'token-derived art — bounded, and covered by coverPlaceholder.contrast.test.ts',
  },
  {
    file: 'apps/web/src/routes/MatchRoute.tsx',
    scrim: 'rgba(0,0,0,0.55)',
    what: 'the "Not tonight" dismiss ✕ over a Match pick’s cover',
    class: 'OVER_ARTWORK',
  },
  {
    file: 'apps/web/src/book/BookDetailRoute.tsx',
    scrim: 'rgba(123,63,160,0.18)',
    what: 'the series/trope chip wash beside the detail hero',
    class: 'OVER_OWN_ART',
    bounded:
      'a chip on the PAGE surface, not on the hero image — it only appears in this scan because ' +
      'the scanner is file-scoped, which is the safe direction: it over-reports inside ' +
      'cover-painting files and the registry rules on each, rather than under-reporting and ' +
      'calling a real scrim clean',
  },
  {
    file: 'apps/web/src/book/BookDetailRoute.tsx',
    scrim: 'rgba(0,0,0,0.62)',
    what: 'the "+ add a cover" prompt on the detail hero',
    class: 'OVER_OWN_ART',
    bounded:
      'gated on !book.cover — it renders only when there is no artwork, over the hero’s own ' +
      'token gradient (linear-gradient(150deg, g0, g1))',
  },
]

/** The non-text floor (WCAG 1.4.11): a glyph that identifies a control must reach 3:1. */
export const NON_TEXT_FLOOR = 3

/**
 * How many OVER_ARTWORK surfaces are allowed to sit below the floor today. A RATCHET: lower it,
 * never raise it. Measured from the tree — not derived — per CLAUDE.md's budget rule.
 */
export const BELOW_FLOOR_BUDGET = 1
