import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Surface } from './Surface'

/** A simple accessible modal: labelled dialog, Escape + backdrop to close, focus moved in.
 *  Portaled to <body>: routes render inside <main class="relative z-[1]">, whose stacking context
 *  would otherwise trap the dialog's z-50 BELOW the z-40 mobile tab bar — on phones the bar then
 *  swallows taps on any control in the sheet's bottom rows. At the root, 50 beats 40 for real. */
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  // HTMLElement, not HTMLDivElement: the panel renders through Surface, whose `as` contract means
  // the element is not assumable — and focus() is all this ref ever asks of it.
  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => {
    panelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {/* radius="none" + `.rv-modal` in className is the API pass's ruling, not a laundering of the
          defect the migration retired: rv-modal is TOKEN-driven at desktop (var(--radius-panel))
          and its mobile shape (24px 24px 0 0 — a bottom sheet) is a deliberate responsive design
          the four-value enum cannot express. The bespoke radius stays named in a kit class where
          it is visible; Surface absorbs what it genuinely shares — tone, border, pad, elevation,
          and now the focus ref. */}
      <Surface
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        tone="card-solid"
        radius="none"
        pad={5}
        raised
        className={`max-h-[92dvh] w-full rv-modal overflow-y-auto outline-none ${
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md'
        }`}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2
            className="text-[22px] italic leading-tight text-ink"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-line text-muted hover:text-ink"
          >
            ✕
          </button>
        </div>
        {children}
      </Surface>
    </div>,
    document.body,
  )
}
