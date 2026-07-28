import type { ReactNode } from 'react'

/** A small generic UI label — eyebrows, section + shelf headers, field labels. Reads the skin's
 *  label font / case / tracking via `.skin-label`, so a "FILTERS" header is tracked Fraunces in Tryst
 *  and tracked Space Mono in Aphelion. Caller sets size + colour (e.g. `text-[11px] text-muted`). */
export function Label({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`skin-label ${className}`}>{children}</span>
}

/** Stat-block numeral — old-style Fraunces figures in Tryst, tabular Space Mono in Aphelion (via
 *  `.skin-numeral`). Caller sets size/weight/colour. */
export function StatNumber({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return <span className={`skin-numeral ${className}`}>{children}</span>
}
