import { describeSupabaseError, supabaseFailure } from '@reverie/core'

/**
 * The one way this suite reads a Supabase result.
 *
 * Every fixture the specs build goes through Supabase, and every one of those calls used to drop its
 * error on the floor — 49 bare `await sb.from(…).insert(…)` writes and 13 `.data!` dereferences. Both
 * shapes fail in the worst available direction. A swallowed WRITE makes the test fail later, somewhere
 * else, looking like the thing under test is broken: state-pills lost an afternoon to an absent pill
 * that was really a rejected insert. A `.data!` dereference on a failed read throws a bare
 * `TypeError: Cannot read properties of null`, which names the line that read the result rather than
 * the call that failed.
 *
 * WHY A HELPER AND NOT A CONVENTION. `tsc` never looks at this directory — `apps/web/tsconfig.json`
 * includes only `["src", "vite.config.ts"]` — so `noUnusedLocals`, which makes a swallowed
 * `const { error }` a compile error in `src`, does not apply here at all. That asymmetry, not
 * discipline, is why every swallow in the repo lives under `e2e/`. Nothing will catch the next one
 * either, so the ESLint rule scoped to this directory (see `eslint.config.js`) bans the `.data!`
 * shape and points here.
 *
 * The formatting is `@reverie/core`'s `describeSupabaseError`, shared with `scripts/seed-dev.mjs` and
 * with `authFailure` — one implementation, three consumers.
 */

interface SupabaseResult<T> {
  data: T
  error: unknown
}

/**
 * Await a Supabase call and throw a described failure if it errored. Returns `data` as-is, which for
 * a write or a delete is usually `null` — that is fine and expected; the point is the error check.
 *
 * `context` should say what was being built, not what function you are in: "a11y clubs insert" tells
 * the next reader where to look, "setupFixtures" does not.
 */
export async function ok<T>(query: PromiseLike<SupabaseResult<T>>, context: string): Promise<T> {
  const { data, error } = await query
  if (error) throw new Error(supabaseFailure(context, error))
  return data
}

/**
 * Await a Supabase call, throw on error, AND throw if it returned no row — the `.data!` replacement.
 *
 * The missing-row case gets its own message because it is a genuinely different failure with a
 * different cause: the call succeeded and the row is not there. `.single()` reports that as an error,
 * but `.limit(1)` / `.maybeSingle()` report it as `data: null` with `error: null`, and asserting
 * through that with `!` is what produced the bare TypeErrors.
 */
export async function okData<T>(
  query: PromiseLike<SupabaseResult<T>>,
  context: string,
): Promise<NonNullable<T>> {
  const { data, error } = await query
  if (error) throw new Error(supabaseFailure(context, error))
  if (data === null || data === undefined) {
    throw new Error(
      `${context}: the call succeeded but returned no row — the fixture it depends on is missing, not broken`,
    )
  }
  return data as NonNullable<T>
}

/**
 * Await an auth call that should yield a user, and return that user.
 *
 * Its own helper because `getUser()` and `createUser()` nest the payload one level deeper —
 * `{ data: { user } }` — so `okData` would hand back `{ user: User | null }` and the caller would be
 * straight back to `user!.id`. Unwrapping here is what lets the ESLint rule ban the `.data!` /
 * `.user!` shape outright instead of asking everyone to remember.
 */
export async function okUser<U>(
  query: PromiseLike<SupabaseResult<{ user: U | null }>>,
  context: string,
): Promise<U> {
  const { data, error } = await query
  if (error) throw new Error(supabaseFailure(context, error))
  if (!data?.user) {
    throw new Error(
      `${context}: the call succeeded but returned no user — no session, or no such account`,
    )
  }
  return data.user
}

/** Re-exported so specs asserting on a caught failure can format it the same way. */
export { describeSupabaseError }
