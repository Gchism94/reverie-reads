import type { ReactNode } from 'react'

/** Shared editorial heading for top-level routes. Keeps page identity quiet and skin-led. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className = '',
}: {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <header
      className={`flex flex-wrap items-end justify-between gap-5 border-b border-line pb-5 ${className}`}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <div className="skin-label mb-2 text-[11px]" style={{ color: 'var(--accent-ink)' }}>
            {eyebrow}
          </div>
        ) : null}
        <h1
          className="max-w-[24ch] text-balance text-[30px] font-semibold leading-[1.04] text-ink sm:text-[38px]"
          style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.025em' }}
        >
          {title}
        </h1>
        {description ? (
          <p className="mt-2 hidden max-w-[64ch] text-[14px] leading-relaxed text-muted sm:block">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}
