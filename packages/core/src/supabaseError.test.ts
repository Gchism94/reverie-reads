import { describe, expect, it } from 'vitest'
import { describeSupabaseError, isUnreachable, supabaseFailure } from './supabaseError'

// The shapes below are the real ones, not invented: an empty GoTrue body, an AuthApiError with a
// code, an AuthRetryableFetchError at status 0, a PostgREST error carrying details + hint, and a
// non-Error throw. Each one broke a helper in this repo at some point, which is why each is here.

describe('the empty-body case — the one that started this', () => {
  it('shows an empty JSON body as the two-character STRING it is, not as an absence', () => {
    // GoTrue answers `{}` under load; auth-js passes the body through as the message verbatim.
    const out = describeSupabaseError({ name: 'AuthApiError', message: '{}', status: 500 })
    expect(out).toContain('message="{}"')
    expect(out).toContain('status=500')
    // The distinction that matters: quoted, so it cannot be misread as "no message".
    expect(out).not.toContain('message=(none)')
  })

  it('distinguishes an empty-body message from a genuinely absent one', () => {
    expect(describeSupabaseError({ name: 'X', status: 1 })).toContain('message=(none)')
  })
})

describe('AuthApiError with a code', () => {
  it('surfaces name, status and code alongside the message', () => {
    const out = describeSupabaseError({
      name: 'AuthApiError',
      message: 'Invalid login credentials',
      status: 400,
      code: 'invalid_credentials',
    })
    expect(out).toContain('message="Invalid login credentials"')
    expect(out).toContain('name="AuthApiError"')
    expect(out).toContain('status=400')
    expect(out).toContain('code="invalid_credentials"')
  })
})

describe('AuthRetryableFetchError at status 0 — the capacity signature', () => {
  const err = { name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 }

  it('is recognised as unreachable, by name and independently by status', () => {
    expect(isUnreachable(err)).toBe(true)
    expect(isUnreachable({ status: 0 })).toBe(true)
    expect(isUnreachable({ name: 'AuthRetryableFetchError' })).toBe(true)
    expect(isUnreachable({ name: 'AuthApiError', status: 400 })).toBe(false)
  })

  it('says the request never reached the server, so nobody re-checks the password', () => {
    const out = supabaseFailure('sign-in', err)
    expect(out).toContain('never reached the server')
    expect(out).toContain('network/capacity')
  })

  it('status 0 omits the field (it is falsy) but still triggers the hint', () => {
    // Guards a real trap: `status=0` is filtered out of the field list by the falsy check, so the
    // hint is the ONLY thing that reports it. Losing the hint would lose the signal entirely.
    const out = supabaseFailure('sign-in', { name: 'Other', message: 'x', status: 0 })
    expect(out).toContain('never reached the server')
  })
})

describe('PostgREST error with details and hint', () => {
  it('surfaces details and hint — where PostgREST puts the actionable part', () => {
    const out = describeSupabaseError({
      code: '23514',
      message: 'new row violates check constraint "books_pub_m_check"',
      details: 'Failing row contains (…, 13, …).',
      hint: 'The publication month must be between 1 and 12.',
    })
    expect(out).toContain('code="23514"')
    expect(out).toContain('details="Failing row contains (…, 13, …)."')
    expect(out).toContain('hint="The publication month must be between 1 and 12."')
  })

  it('omits fields PostgREST left null rather than printing them empty', () => {
    const out = describeSupabaseError({
      code: 'PGRST202',
      message: 'nope',
      details: null,
      hint: null,
    })
    expect(out).not.toContain('details=')
    expect(out).not.toContain('hint=')
  })
})

describe('non-Error throws', () => {
  it('handles a bare string, a number, null and undefined without throwing itself', () => {
    expect(describeSupabaseError('boom')).toBe('boom')
    expect(describeSupabaseError(42)).toContain('42')
    expect(describeSupabaseError(null)).toBe('(no error object)')
    expect(describeSupabaseError(undefined)).toBe('(no error object)')
  })

  it('reports a missing error object as a probable dead stack, not as success', () => {
    // The shape that used to read as "no session AND no error": worth its own sentence, because it
    // almost always means nothing is listening rather than that the call succeeded.
    expect(supabaseFailure('sign-in', null)).toContain('may not be running')
  })
})

describe('nothing is dropped', () => {
  it('reports unknown own-properties, so a future auth-js rename cannot empty the diagnosis', () => {
    const out = describeSupabaseError({ message: 'x', weirdNewField: 'important' })
    expect(out).toContain('extra=')
    expect(out).toContain('weirdNewField')
    expect(out).toContain('important')
  })

  it('survives a property whose getter throws, and still reports the known fields', () => {
    const hostile = { message: 'still readable', status: 503 }
    Object.defineProperty(hostile, 'poison', {
      enumerable: true,
      get() {
        throw new Error('getter exploded')
      },
    })
    const out = describeSupabaseError(hostile)
    expect(out).toContain('message="still readable"')
    expect(out).toContain('status=503')
    expect(out).not.toContain('getter exploded')
  })

  it('a real Error instance keeps its message — JSON.stringify alone would drop it', () => {
    // The third of the three prior implementations was `JSON.stringify(err)`, which on a real Error
    // prints "{}" because message and name are non-enumerable. That is the same empty output this
    // whole module exists to prevent, arrived at from the other direction.
    const out = describeSupabaseError(new Error('a real Error'))
    expect(out).toContain('message="a real Error"')
    expect(JSON.stringify(new Error('a real Error'))).toBe('{}') // the trap, pinned
  })
})

describe('context and detail', () => {
  it('puts the caller context first and the caller detail beside it', () => {
    const out = supabaseFailure(
      'a11y setupFixtures',
      { message: 'nope', status: 409 },
      'clubs insert',
    )
    expect(out.startsWith('a11y setupFixtures (clubs insert):')).toBe(true)
    expect(out).toContain('status=409')
  })

  it('omits the parenthetical when there is no detail', () => {
    expect(supabaseFailure('ctx', { message: 'm' })).toContain('ctx: [')
  })
})
