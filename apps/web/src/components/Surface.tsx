import { forwardRef } from 'react'
import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from 'react'

/**
 * The padded, bordered container — one component for a recipe currently hand-copied across 72 sites
 * in 34 files. Scope, measurements and the batching plan: `docs/audits/surface-primitive-scope.md`.
 *
 * ── WHAT THIS IS NOT ────────────────────────────────────────────────────────────────────────────
 * Not a control. Buttons and fields have `.skin-control` / `.skin-field`, and `.skin-tile` serves
 * card-shaped controls (all 7 of its carriers are interactive — 6 `<button>`, 1 `<Link>`). Counting
 * those in is how the site count came out at 181 instead of 72. `Surface` takes no `onClick`, no
 * `disabled`, no pressed state; a surface that is also a button re-merges the two primitives.
 *
 * ── EVERY PROP IS INDEPENDENT. NOTHING DERIVES FROM ANYTHING ────────────────────────────────────
 * In particular `radius` does NOT default from `tone` (§7, decision 1). The pairing only holds for
 * `card`/`card-solid`; `field` and `bare` have no established kit pairing, and `.skin-panel`'s 18
 * carriers are not defined by background at all. Deriving a mapping from a pattern that covers part
 * of the data is the mistake the audit's own elevation finding had to be corrected for.
 */

/**
 * Which surface token paints it. `bare` = bordered and padded with no background (18 sites).
 *
 * ── THIS ENUM IS CLOSED BY MEASUREMENT, NOT OVERSIGHT (API pass, 2026-08-19) ────────────────────
 * Two "gaps" surfaced during the migration — `--bg0` (2 lab sandbox cells) and `--chip`
 * (ReviewRoute's triage badge) — and raw `var()` counts made `--chip` look like the third-most-used
 * surface token (45 uses). Measured properly — non-interactive, Surface-eligible sites actually
 * painting the token as background — the 45 collapse to **1**: nearly every `--chip` painter is a
 * `<button>` or a `skin-control`/`skin-control-quiet` span, i.e. the control kit's population, not
 * this component's. `--bg0` measures 2 (the dev-only lab cells), `--paper` 0 (all artwork:
 * CoverPlaceholder/Spine/Structure), `--bg1` 0. The enum therefore mirrors the tokens the surface
 * population actually paints — exactly these four — and the tail (3 sites) uses the `style`/
 * `className` escape hatch, per the audit §3: a closed scale covers the head; the tail needs an
 * escape hatch, not a bigger enum. Before adding a member here, re-run that measurement, not the
 * grep. Full numbers: the `feat/surface-api-pass` PR body.
 */
export type SurfaceTone = 'card' | 'card-solid' | 'field' | 'bare'

/** Skin-driven radius. `panel`/`card` reuse the existing kit classes rather than restating them. */
export type SurfaceRadius = 'panel' | 'card' | 'control' | 'none'

/**
 * A CLOSED scale over the measured head — `p-3` 16, `p-4` 13, `p-6` 13, `p-1` 5, `p-5` 3. The tail
 * is 17 distinct combinations of asymmetric one-offs (`py-2 pl-4 pr-2`, `px-2 py-0.5`…), which is a
 * tail rather than a system: it gets `className`, not more enum members.
 */
export type SurfacePad = 0 | 1 | 2 | 3 | 4 | 5

const PAD_CLASS: Record<SurfacePad, string> = {
  0: '',
  1: 'p-1',
  2: 'p-3',
  3: 'p-4',
  4: 'p-5',
  5: 'p-6',
}

const RADIUS_CLASS: Record<SurfaceRadius, string> = {
  panel: 'skin-panel',
  card: 'skin-card',
  control: 'rounded-[var(--radius-control)]',
  none: '',
}

/** `bare` deliberately paints nothing — it is a real state (18 sites), not a missing value. */
const TONE_BACKGROUND: Record<SurfaceTone, string | undefined> = {
  card: 'var(--card)',
  'card-solid': 'var(--card-solid)',
  field: 'var(--field)',
  bare: undefined,
}

/**
 * Elevation belongs to the card family and nowhere else — measured 0 of 39 on `field`/`chip`/`bg0`/
 * `bare`, against 7 of 33 on the card tones. The combination is not made a type error (it would
 * contort the signature for one invariant), so it warns in development instead and is otherwise
 * honoured, since refusing to render is worse than rendering something odd.
 */
const RAISED_TONES: readonly SurfaceTone[] = ['card', 'card-solid']

export type SurfaceProps = {
  tone?: SurfaceTone
  radius?: SurfaceRadius
  pad?: SurfacePad
  border?: boolean
  /** Lifts it off the page with the skin's `--shadow`. 7 of 72 sites; see the audit's §2. */
  raised?: boolean
  className?: string
  style?: CSSProperties
  children?: ReactNode
  /** 55 `div`, 8 `p`, 6 `li`, 2 `details`, 1 `span` — the element is not assumable. */
  as?: ElementType
} & Omit<HTMLAttributes<HTMLElement>, 'style' | 'className' | 'children'>

/**
 * Ref-forwarding, added in the API pass once a SECOND independent customer appeared (the threshold
 * set after batch 2 — "don't add API surface for one customer"): `Modal` needs the rendered element
 * for focus-on-open, `SeriesArranger` hands it to dnd-kit's `setNodeRef`. Two different mechanisms,
 * not two instances of one. The ref is typed `HTMLElement` because `as` means the element is not
 * assumable — callers narrow at the site if they need a specific interface.
 */
export const Surface = forwardRef<HTMLElement, SurfaceProps>(function Surface(
  {
    tone = 'card',
    radius = 'card',
    pad = 2,
    border = true,
    raised = false,
    className = '',
    style,
    children,
    as: Tag = 'div',
    ...rest
  },
  ref,
) {
  if (import.meta.env.DEV && raised && !RAISED_TONES.includes(tone)) {
    console.warn(
      `Surface: raised={true} with tone="${tone}". Elevation was measured only on the card tones ` +
        `(0 of 39 sites on field/bare). Rendering it anyway — but if this is deliberate, the audit's ` +
        `§2 finding needs updating rather than the warning silencing.`,
    )
  }

  const background = TONE_BACKGROUND[tone]
  const classes = [
    RADIUS_CLASS[radius],
    border ? 'border border-line' : '',
    PAD_CLASS[pad],
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <Tag
      ref={ref}
      className={classes}
      style={{
        ...(background ? { background } : {}),
        ...(raised ? { boxShadow: 'var(--shadow)' } : {}),
        ...style,
      }}
      {...rest}
    >
      {children}
    </Tag>
  )
})
