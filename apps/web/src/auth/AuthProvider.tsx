import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { clearAllOfflineCaches } from '../lib/offlineCache'

/** OAuth providers the auth screen offers. Inert until the owner provisions client id/secret in
 *  Supabase auth settings (see SOCIAL_AUTH_ENABLED). */
export type OAuthProvider = 'google' | 'apple'

interface AuthValue {
  session: Session | null
  loading: boolean
  signOut: () => Promise<void>
  /** Email + password sign-in. Resolves with a human-readable error string, or null on success. */
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>
  /**
   * Email + password sign-up. With email confirmation on (H3), this creates an unconfirmed user and
   * sends a verification link; `needsVerification` is true and no session is established until the
   * link is opened. On a project without confirmation it returns a session immediately.
   */
  signUpWithPassword: (
    email: string,
    password: string,
  ) => Promise<{ error: string | null; needsVerification: boolean }>
  /** Start an OAuth redirect flow. Errors back to the caller (e.g. provider not configured). */
  signInWithProvider: (provider: OAuthProvider) => Promise<{ error: string | null }>
}

const noop = async () => ({ error: null })

const AuthContext = createContext<AuthValue>({
  session: null,
  loading: true,
  signOut: async () => {},
  signInWithPassword: noop,
  signUpWithPassword: async () => ({ error: null, needsVerification: false }),
  signInWithProvider: noop,
})

export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  // Available because AuthProvider sits INSIDE PersistQueryClientProvider, which renders the
  // QueryClientProvider. No re-ordering needed to reach it.
  const queryClient = useQueryClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      // The event used to be ignored entirely (`_event`). It is the hook that makes sign-out
      // actually forget: nothing else cleared either cache, so the reader's library outlived their
      // session in BOTH places.
      //
      // Both clears are required and neither is sufficient. queryClient.clear() handles the
      // same-page-load case — sign out, sign in as someone else, no reload — where the in-memory
      // cache still holds the previous reader's queries under unscoped keys like ['books'].
      // clearAllOfflineCaches() handles the next boot, where the IndexedDB mirror would otherwise
      // be restored. Measured before this fix: user B saw 286 of user A's books in both paths, and
      // it never self-corrected.
      //
      // Order matters only for tidiness: clearing the client first fires the persist subscription,
      // and by then auth-js has already removed the stored session, so the scoped persister has no
      // id and writes nothing. The table clear that follows would sweep such a row regardless.
      if (event === 'SIGNED_OUT') {
        queryClient.clear()
        void clearAllOfflineCaches()
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [queryClient])

  const value: AuthValue = {
    session,
    loading,
    // No direct cache clear here on purpose: the SIGNED_OUT handler above already does it, and a
    // second call would only fire in the case where it should NOT. supabase's _signOut posts to the
    // server first and returns early WITHOUT removing the local session if that request fails with
    // anything other than 404/401/403 — so a sign-out attempted offline leaves the reader signed in
    // and emits no event. Clearing the mirror there would strip their offline library while leaving
    // them logged in. (That offline sign-out does nothing at all is a real defect, but it belongs to
    // fix/offline-session, not to cache scoping — recorded, not fixed here.)
    signOut: async () => {
      await supabase.auth.signOut()
    },
    signInWithPassword: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      return { error: error?.message ?? null }
    },
    signUpWithPassword: async (email, password) => {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: `${window.location.origin}/welcome` },
      })
      if (error) return { error: error.message, needsVerification: false }
      // No session back => email confirmation is required before sign-in (H3).
      return { error: null, needsVerification: !data.session }
    },
    signInWithProvider: async (provider) => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.origin },
      })
      return { error: error?.message ?? null }
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
