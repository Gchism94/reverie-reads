import type { ReactNode } from 'react'

/** A pill chip used for filters, tropes, and toggles. `active` paints it with the accent. */
export function Chip({
  active = false,
  onClick,
  children,
  title,
}: {
  active?: boolean
  onClick?: () => void
  children: ReactNode
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={onClick ? active : undefined}
      className="rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors"
      style={
        active
          ? { background: 'var(--primary)', color: 'var(--on-primary)', borderColor: 'transparent' }
          : { background: 'var(--chip)', color: 'var(--ink)', borderColor: 'var(--chip-border)' }
      }
    >
      {children}
    </button>
  )
}
