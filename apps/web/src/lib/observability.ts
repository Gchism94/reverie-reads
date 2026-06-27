// Vendor-neutral error reporting (Phase 7 H4). Always logs a structured error to the console; when
// a DSN/ingest URL is configured (VITE_ERROR_DSN), forwards a JSON envelope to it (fire-and-forget)
// — works with a Sentry "store" endpoint or any HTTP collector, with NO heavy SDK or vendor lock.
// The owner sets VITE_ERROR_DSN to turn on remote reporting; without it, this no-ops remotely.

const DSN = import.meta.env.VITE_ERROR_DSN as string | undefined
const RELEASE = (import.meta.env.VITE_RELEASE as string | undefined) ?? 'dev'

interface ErrorEnvelope {
  level: 'error'
  message: string
  stack?: string
  release: string
  url: string
  ts: string
  context?: Record<string, unknown>
}

let installed = false

/** Report an error: structured console always; remote when VITE_ERROR_DSN is set. */
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  const err = error instanceof Error ? error : new Error(String(error))
  const envelope: ErrorEnvelope = {
    level: 'error',
    message: err.message,
    stack: err.stack,
    release: RELEASE,
    url: typeof location !== 'undefined' ? location.href : '',
    ts: new Date().toISOString(),
    context,
  }
  // Always visible locally + in any console-capturing log drain.
  console.error('[reverie]', envelope)
  if (DSN && typeof fetch !== 'undefined') {
    try {
      void fetch(DSN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(envelope),
        keepalive: true,
      }).catch(() => {})
    } catch {
      /* never let reporting throw */
    }
  }
}

/** Install global handlers (idempotent). Call once at startup. */
export function initObservability(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('error', (e) => captureError(e.error ?? e.message, { kind: 'window.onerror' }))
  window.addEventListener('unhandledrejection', (e) =>
    captureError(e.reason, { kind: 'unhandledrejection' }),
  )
}
