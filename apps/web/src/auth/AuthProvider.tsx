import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const value: AuthValue = {
    session,
    loading,
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
