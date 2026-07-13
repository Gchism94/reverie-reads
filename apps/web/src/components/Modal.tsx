import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

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
  const panelRef = useRef<HTMLDivElement>(null)

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
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`max-h-[92dvh] w-full rv-modal overflow-y-auto border border-line p-6 outline-none ${
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md'
        }`}
        style={{ background: 'var(--card-solid)', boxShadow: 'var(--shadow)' }}
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
      </div>
    </div>,
    document.body,
  )
}
