// Structured logging + error reporting for Edge Functions (Phase 7 H4). Logs single-line JSON so
// Supabase's Edge logs are queryable by field; errors also report to Sentry when SENTRY_DSN is set,
// fire-and-forget, via Sentry's HTTP envelope endpoint — NO Sentry SDK is imported (the functions
// only ever call logEvent / captureEdgeError, never Sentry directly). Keep dependency-free so every
// function can import it.

const DSN = Deno.env.get('SENTRY_DSN') ?? ''
const RELEASE = Deno.env.get('SENTRY_RELEASE') ?? undefined

type Level = 'info' | 'warn' | 'error'

/** Emit one structured JSON log line. */
export function logEvent(
  level: Level,
  fn: string,
  event: string,
  fields: Record<string, unknown> = {},
): void {
  const line = JSON.stringify({ level, fn, event, ts: new Date().toISOString(), ...fields })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

// Parse a Sentry DSN (https://<key>@<host>/<projectId>) into its envelope endpoint + auth key.
function parseDsn(dsn: string): { url: string; key: string } | null {
  try {
    const u = new URL(dsn)
    const projectId = u.pathname.replace(/^\//, '')
    if (!u.username || !projectId) return null
    return { url: `${u.protocol}//${u.host}/api/${projectId}/envelope/`, key: u.username }
  } catch {
    return null
  }
}

function toSentry(fn: string, err: Error, fields: Record<string, unknown>): void {
  const dsn = parseDsn(DSN)
  if (!dsn) return
  const eventId = crypto.randomUUID().replace(/-/g, '')
  const event = {
    event_id: eventId,
    timestamp: Date.now() / 1000,
    platform: 'javascript',
    level: 'error',
    logger: 'edge',
    release: RELEASE,
    server_name: fn,
    tags: { fn, runtime: 'deno-edge' },
    exception: {
      values: [{ type: err.name || 'Error', value: err.message, stacktrace: { frames: [] } }],
    },
    extra: fields,
  }
  const body =
    JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString(), dsn: DSN }) +
    '\n' +
    JSON.stringify({ type: 'event' }) +
    '\n' +
    JSON.stringify(event)
  try {
    void fetch(dsn.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${dsn.key}, sentry_client=reverie-edge/1.0`,
      },
      body,
    }).catch(() => {})
  } catch {
    /* never let reporting throw */
  }
}

/** Log an error structured, and report it to Sentry when configured. */
export function captureEdgeError(
  fn: string,
  error: unknown,
  fields: Record<string, unknown> = {},
): void {
  const err = error instanceof Error ? error : new Error(String(error))
  logEvent('error', fn, 'unhandled_error', { ...fields, message: err.message, stack: err.stack })
  if (DSN) toSentry(fn, err, fields)
}
