import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'

/** Token-driven button — the core of the Skin Character kit. Shape (radius/notch), type (font/case),
 *  and motion (ease/duration) all come from the active skin's tokens via `.skin-control`, so the same
 *  button reads as a gilt pill in Tryst and a machined notched chip in Aphelion — while always
 *  obviously a button (distinctive surface, conventional interaction). */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'icon'

// Material lives in the .skin-btn-* classes (skin-kit.css) so each skin can recast the object —
// Tryst's ivory calling card / ticket rule / wax seal, Aphelion's machined key — without touching JSX.
const VARIANT: Record<ButtonVariant, { cls: string; style: CSSProperties }> = {
  primary: { cls: 'skin-btn-primary h-10 px-5 text-[14px]', style: {} },
  secondary: { cls: 'skin-btn-secondary h-10 px-5 text-[14px]', style: {} },
  ghost: { cls: 'h-10 px-3 text-[14px] text-muted hover:text-ink', style: { background: 'transparent' } },
  icon: { cls: 'skin-btn-icon grid h-10 w-10 place-items-center text-[16px]', style: {} },
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
