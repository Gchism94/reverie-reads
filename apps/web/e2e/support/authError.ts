/**
 * Describe a failed test sign-in in enough detail to act on.
 *
 * The suite used to report `test sign-in failed: {}` — because `error.message` was literally the
 * two-character string "{}". Under load, GoTrue answers with an empty JSON body and auth-js hands
 * that body straight through as the message, so the one field every helper printed was the one
 * field carrying no information. `status` and `code` carried the signal and nobody was reading them.
 *
 * Not a test-only nicety: which failure this is decides what to do about it. A `status: 0` /
 * `AuthRetryableFetchError` means the request never reached the server — the saturation signature
 * that made this suite untrustworthy, and a capacity problem. A `400` with a real code means
 * credentials or config, and no amount of tuning fixes it.
 *
 * Playwright's testMatch only picks up `*.spec.ts`, so this file is a plain module, not a suite.
 */
export function authFailure(context: string, email: string, error: unknown): string {
  if (!error) {
    return `${context}: sign-in for ${email} returned no session AND no error — the local Supabase stack may not be running`
  }

  const e = error as { name?: string; message?: string; status?: number; code?: string }
  const parts = [
    `name=${e.name ?? '(none)'}`,
    `status=${e.status ?? '(none)'}`,
    `code=${e.code ?? '(none)'}`,
    `message=${JSON.stringify(e.message ?? '(none)')}`,
  ]

  // Anything the shape above missed — auth-js has changed its error fields before, and a future
  // rename must not silently empty this message the way `message` alone did.
  let extra = ''
  try {
    const own = Object.getOwnPropertyNames(error as object).filter(
      (k) => !['name', 'message', 'status', 'code', 'stack'].includes(k),
    )
    if (own.length) extra = ` extra=${JSON.stringify(Object.fromEntries(own.map((k) => [k, (error as Record<string, unknown>)[k]])))}`
  } catch {
    /* a getter that throws must not replace the diagnosis with its own failure */
  }

  const hint =
    e.name === 'AuthRetryableFetchError' || e.status === 0
      ? ' — the request never reached GoTrue (network/capacity), not a credential problem'
      : ''

  return `${context}: sign-in failed for ${email} [${parts.join(' ')}]${extra}${hint}`
}
