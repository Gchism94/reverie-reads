import { supabaseFailure } from '@reverie/core'

/**
 * Describe a failed test sign-in in enough detail to act on.
 *
 * A THIN ADAPTER over `@reverie/core`'s `supabaseFailure`, which is where the reading now happens.
 * This function stays because 18 specs call it as `(context, email, error)` and because the email is a
 * detail only the caller knows — but the field-unpacking that used to live in this file moved to core,
 * shared with `scripts/seed-dev.mjs` and `./ok.ts`. One implementation, three consumers; before this
 * there were three implementations of the same idea, and the weakest of them was a bare
 * `JSON.stringify(err)`, which prints `{}` for any real `Error` because its fields are non-enumerable.
 *
 * The original reason this needed writing, kept because it is why the shared version reads `status` and
 * `code` at all: the suite used to report `test sign-in failed: {}` — because `error.message` was
 * literally the two-character string "{}". Under load GoTrue answers with an empty JSON body and
 * auth-js hands that body straight through as the message, so the one field every helper printed was
 * the one field carrying no information.
 *
 * Not a test-only nicety: which failure this is decides what to do about it. An
 * `AuthRetryableFetchError` or `status: 0` means the request never reached the server — a capacity
 * problem, and the signature that made this suite untrustworthy. A `400` with a real code means
 * credentials or config, and no amount of tuning fixes it. `supabaseFailure` appends that distinction.
 *
 * Playwright's testMatch only picks up `*.spec.ts`, so this file is a plain module, not a suite.
 */
export function authFailure(context: string, email: string, error: unknown): string {
  if (!error) {
    return `${context}: sign-in for ${email} returned no session AND no error — the local Supabase stack may not be running`
  }
  return supabaseFailure(`${context}: sign-in failed`, error, email)
}
