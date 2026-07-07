/**
 * Auth-callback hash, captured at module evaluation — BEFORE supabase-js (detectSessionInUrl)
 * processes and strips it. Supabase's email links (confirm signup, password recovery) land back
 * on the app with `#access_token=…&type=signup` on success or `#error=…&error_code=otp_expired`
 * on failure; this is the only reliable place to read which flow the visitor arrived from.
 * Import this module first in main.tsx so nothing races the capture.
 */

export interface AuthCallback {
  /** 'signup' | 'recovery' | 'magiclink' | 'invite' | 'email_change' | null */
  type: string | null
  error: string | null
  errorCode: string | null
  /** True when the page load carried any auth-callback payload (tokens or an error). */
  present: boolean
}

export function parseAuthCallback(hash: string): AuthCallback {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const type = params.get('type')
  const error = params.get('error_description') ?? params.get('error')
  return {
    type,
    error: error ? error.replace(/\+/g, ' ') : null,
    errorCode: params.get('error_code'),
    present: params.has('access_token') || params.has('error') || type != null,
  }
}

export const authCallback: AuthCallback =
  typeof window === 'undefined'
    ? { type: null, error: null, errorCode: null, present: false }
    : parseAuthCallback(window.location.hash)
