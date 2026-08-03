// Reading a Supabase error — THE implementation, for every consumer that needs a diagnosis.
//
// GoTrue answers with an empty JSON body under load and auth-js hands that body straight through as
// the message, so `error.message` is literally the two-character string "{}". Every helper in this
// repo printed `message` and nothing else, which meant the one field carrying no information was the
// only field anyone read: `test sign-in failed: {}`, `Seed failed: {}`. `status` and `code` carried
// the signal and nobody looked at them.
//
// WHY THIS LIVES IN CORE. Three call sites grew three copies of this idea — `authFailure` in
// Playwright test-support, `describeError` in a root-level seed script, and a bare
// `JSON.stringify(err)` in one spec. The seed script's own comment argued the duplication was forced,
// because importing from `apps/web/e2e/support` would make a root script depend on Playwright
// test-support — a dependency the wrong way round, and correct as far as it goes. But that script
// ALREADY imports TypeScript straight out of `packages/core/src` (Node strips type annotations
// natively, 22.18+/23+), so a home both consumers can reach existed all along. Nothing in `apps/web`
// imports this module, and an unused core export is tree-shaken out of the bundle — verified by
// building and grepping `dist/` — so putting it here costs readers nothing.
//
// This is a DEVELOPER diagnosis and deliberately not `apps/web/src/lib/writeErrors.ts`, whose job is
// the opposite: turning a Postgres constraint name into reader-facing copy that never shows the raw
// string. Merging them would make one of the two wrong.

/** The fields a Supabase/PostgREST/GoTrue error can carry, in the order that helps most. */
const FIELDS = ['name', 'status', 'code', 'hint', 'details'] as const

const KNOWN = new Set<string>([...FIELDS, 'message', 'stack'])

/**
 * Everything an error object has to say, with nothing dropped.
 *
 * The field list is the UNION of what the two prior implementations read, because neither was a
 * superset: `authFailure` read `code` but not `hint`/`details`, and `describeError` read
 * `hint`/`details` but had no retryable-network hint. Both are needed — PostgREST puts the actionable
 * part in `details`/`hint`, and GoTrue puts it in `status`/`code`.
 *
 * `message` is JSON-quoted rather than interpolated, so the empty-body case reads `message="{}"` —
 * visibly a two-character string, not an absence. That distinction is the whole point: `{}` means the
 * server answered with nothing, which is a capacity signal, and an absent message means something
 * else entirely.
 */
export function describeSupabaseError(error: unknown): string {
  if (error === null || error === undefined) return '(no error object)'
  if (typeof error === 'string') return error
  if (typeof error !== 'object') return `${typeof error} ${JSON.stringify(error)}`

  const e = error as Record<string, unknown>
  const named = FIELDS.filter((k) => e[k] !== undefined && e[k] !== null && e[k] !== '').map(
    (k) => `${k}=${JSON.stringify(e[k])}`,
  )
  const message = e.message === undefined ? '(none)' : JSON.stringify(e.message)

  // Anything the field list missed. auth-js has renamed error fields before, and a future rename
  // must not silently empty this the way reading `message` alone did.
  let extra = ''
  try {
    const own = Object.getOwnPropertyNames(error).filter((k) => !KNOWN.has(k))
    if (own.length) {
      extra = ` extra=${JSON.stringify(Object.fromEntries(own.map((k) => [k, e[k]])))}`
    }
  } catch {
    /* a getter that throws must not replace the diagnosis with its own failure */
  }

  return `message=${message}${named.length ? ` ${named.join(' ')}` : ''}${extra}`
}

/**
 * True when the request never reached the server — the saturation signature, not a credential
 * problem. Worth calling out by name because it changes what to do about it: retry or add capacity,
 * versus fix the credentials or the config.
 */
export function isUnreachable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { name?: unknown; status?: unknown }
  return e.name === 'AuthRetryableFetchError' || e.status === 0
}

/**
 * A failure described in enough detail to act on, with the caller's context in front.
 *
 * `detail` is for whatever the caller knows that the error does not — which account, which fixture,
 * which table. It goes next to the context rather than inside the field list, so the field list stays
 * exactly the error's own contents.
 */
export function supabaseFailure(context: string, error: unknown, detail?: string): string {
  const where = detail ? `${context} (${detail})` : context
  if (error === null || error === undefined) {
    return `${where}: failed, but no error object was returned — the Supabase stack may not be running`
  }
  const hint = isUnreachable(error)
    ? ' — the request never reached the server (network/capacity), not a credential problem'
    : ''
  return `${where}: [${describeSupabaseError(error)}]${hint}`
}
