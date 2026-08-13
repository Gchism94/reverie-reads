import type { ReactNode } from 'react'
import {
  STATE_PILL_GLYPH,
  STATE_PILL_LABEL,
  STATE_PILL_TOKENS,
  type StatePillKind,
} from '@reverie/core'

/**
 * The borrowed / DNF pill — one implementation, so a card, a flipped spine and anything later can
 * never disagree about how a state looks (docs/archive/task-state-pills.md).
 *
 * SOLID on `--card-solid`, never a translucent scrim. The marks this replaces sat on
 * `rgba(0,0,0,0.45)` over arbitrary cover art, which composites to #8c8c8c against white artwork —
 * where the nine skins' accents measure 1.1–2.7:1 and white ink reaches only ~3.2:1. All of them
 * fail AA, and nothing caught it: axe cannot measure text over an image, so the sweep is
 * structurally blind to this surface. `--ink` on `--card-solid` is the pair the registry-keyed
 * contrast tests pin at ≥4.5:1 across all nine skins in both modes, and it does not care what is
 * behind it.
 *
 * `aria-hidden` by default, because borrowed and DNF reach assistive tech through the enclosing
 * control's accessible name (`stateSuffix`) — one announcement instead of a badge floating loose in
 * the grid, and announcing it twice is worse than once. `announce` opts out for `read`, whose state
 * is NOT in any control's name: hiding it there would delete the only channel it has.
 *
 * Colour never distinguishes the two: they differ by SLOT (read-status vs possession) and by TEXT.
 */
export function StatePill({
  kind,
  className = '',
  title,
  announce = false,
  children,
}: {
  kind: StatePillKind
  /** positioning only — the material is fixed by STATE_PILL_TOKENS */
  className?: string
  title?: string
  /** expose the pill to assistive tech — for a state the enclosing control's name does NOT carry */
  announce?: boolean
  /** trailing content, e.g. the format glyphs that ride along with Borrowed */
  children?: ReactNode
}) {
  const glyph = STATE_PILL_GLYPH[kind]
  return (
    <span
      aria-hidden={announce ? undefined : true}
      title={title}
      className={`flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${className}`}
      style={{
        background: STATE_PILL_TOKENS.surface,
        color: STATE_PILL_TOKENS.label,
        borderRadius: STATE_PILL_TOKENS.radius,
      }}
    >
      {glyph && <span style={{ color: STATE_PILL_TOKENS.accent }}>{glyph}</span>}
      {STATE_PILL_LABEL[kind]}
      {children}
    </span>
  )
}
