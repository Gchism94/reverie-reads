// Provider-agnostic error reporting (Phase 7 H4). App + UI code calls captureError/captureMessage;
// the actual backend (Sentry) is registered ONCE via setErrorReporter from a single adapter, so
// nothing else imports the Sentry SDK and a later swap (GlitchTip self-host, another backend) is a
// one-file change. Pure + runtime-agnostic — the default reporter just uses console.

export type ErrorContext = Record<string, unknown>

export interface ErrorReporter {
  captureError(error: unknown, context?: ErrorContext): void
  captureMessage(message: string, context?: ErrorContext): void
}

// core is runtime-agnostic (lib: ES2023, no DOM) — reach console via globalThis when present.
type ConsoleLike = { error: (...args: unknown[]) => void; warn: (...args: unknown[]) => void }
const con = (globalThis as unknown as { console?: ConsoleLike }).console

/** The fallback reporter: structured console output (dev, and prod when no DSN is configured). */
export const consoleReporter: ErrorReporter = {
  captureError(error, context) {
    const err = error instanceof Error ? error : new Error(String(error))
    con?.error('[reverie]', { message: err.message, stack: err.stack, ...context })
  },
  captureMessage(message, context) {
    con?.warn('[reverie]', { message, ...context })
  },
}

let reporter: ErrorReporter = consoleReporter

/** Register the backend reporter. Called once, only from the single Sentry adapter. */
export function setErrorReporter(next: ErrorReporter): void {
  reporter = next
}

/** Report a caught error. Routes to the registered backend (Sentry) or the console fallback. */
export function captureError(error: unknown, context?: ErrorContext): void {
  try {
    reporter.captureError(error, context)
  } catch {
    /* reporting must never throw */
  }
}

/** Report a non-error message/event of interest. */
export function captureMessage(message: string, context?: ErrorContext): void {
  try {
    reporter.captureMessage(message, context)
  } catch {
    /* reporting must never throw */
  }
}
