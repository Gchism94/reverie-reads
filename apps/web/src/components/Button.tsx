import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'

/** Token-driven button — the core of the Skin Character kit. Shape (radius/notch), type (font/case),
 *  and motion (ease/duration) all come from the active skin's tokens via `.skin-control`, so the same
 *  button reads as a gilt pill in Tryst and a machined notched chip in Aphelion — while always
 *  obviously a button (distinctive surface, conventional interaction). */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'icon'

const VARIANT: Record<ButtonVariant, { cls: string; style: CSSProperties }> = {
  primary: { cls: 'h-10 px-5 text-[14px]', style: { background: 'var(--accent-fill)', color: 'var(--on-primary)' } },
  secondary: { cls: 'h-10 px-5 text-[14px] text-ink', style: { background: 'transparent', border: 'var(--border-width) solid var(--line)' } },
  ghost: { cls: 'h-10 px-3 text-[14px] text-muted hover:text-ink', style: { background: 'transparent' } },
  icon: { cls: 'grid h-10 w-10 place-items-center text-[16px] text-ink', style: { background: 'var(--field)', border: 'var(--border-width) solid var(--line)' } },
}

export function Button({
  variant = 'primary',
  className = '',
  style,
  children,
  ...rest
}: { variant?: ButtonVariant; children?: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const v = VARIANT[variant]
  return (
    <button
      type="button"
      {...rest}
      className={`skin-control inline-flex items-center justify-center gap-1.5 transition-[background,color,box-shadow] motion-reduce:transition-none ${v.cls} ${className}`}
      style={{ ...v.style, ...style }}
    >
      {children}
    </button>
  )
}
