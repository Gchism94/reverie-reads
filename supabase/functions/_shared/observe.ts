// Structured logging + error reporting for Edge Functions (Phase 7 H4). Logs single-line JSON so
// Supabase's Edge logs are queryable by field; errors also forward to an ingest URL (SENTRY_DSN /
// EDGE_ERROR_DSN) when set, fire-and-forget, with no SDK/vendor lock. Keep it dependency-free so
// every function can import it.

const DSN = Deno.env.get('EDGE_ERROR_DSN') ?? Deno.env.get('SENTRY_DSN') ?? ''

type Level = 'info' | 'warn' | 'error'

/** Emit one structured JSON log line. */
export function logEvent(level: Level, fn: string, event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ level, fn, event, ts: new Date().toISOString(), ...fields })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

/** Log an error structured, and forward it to the ingest URL when configured. */
export function captureEdgeError(fn: string, error: unknown, fields: Record<string, unknown> = {}): void {
  const err = error instanceof Error ? error : new Error(String(error))
  logEvent('error', fn, 'unhandled_error', { ...fields, message: err.message, stack: err.stack })
  if (DSN) {
    try {
      void fetch(DSN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: 'error', fn, message: err.message, stack: err.stack, ts: new Date().toISOString(), ...fields }),
      }).catch(() => {})
    } catch {
      /* never let reporting throw */
    }
  }
}
