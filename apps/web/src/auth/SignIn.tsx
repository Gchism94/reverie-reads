import { useState, type FormEvent } from 'react'
import { APP_NAME } from '@reverie/core'
import { supabase } from '../lib/supabase'
import { SkinDivider } from '../components/SkinDivider'

export function SignIn() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    setBusy(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <main className="relative z-[1] flex min-h-dvh flex-col items-center justify-center px-6">
      <div
        className="w-full max-w-sm rounded-3xl border border-line p-8 backdrop-blur"
        style={{ background: 'var(--card)', boxShadow: 'var(--shadow)' }}
      >
        <h1
          className="text-center text-[34px] italic leading-none text-ink"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
        >
          {APP_NAME}
        </h1>
        <SkinDivider className="mt-3" />

        {sent ? (
          <p className="mt-6 text-center text-[14px] leading-relaxed text-muted">
            Check your inbox — we sent a magic link to <span className="text-ink">{email}</span>.
            Open it on this device to sign in.
          </p>
        ) : (
          <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
            <label htmlFor="email" className="text-[12px] uppercase tracking-[0.2em] text-muted">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="h-11 rounded-xl border border-line px-3.5 text-[15px] text-ink outline-none"
              style={{ background: 'var(--field)' }}
            />
            {error && <p className="text-[13px] text-primary">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="mt-1 h-11 rounded-xl text-[14px] font-semibold disabled:opacity-60"
              style={{
                background: 'linear-gradient(135deg, var(--primary), var(--gold))',
                color: 'var(--on-primary)',
              }}
            >
              {busy ? 'Sending…' : 'Send magic link'}
            </button>
            <p className="mt-1 text-center text-[12px] text-muted">
              No password — we email you a one-time link.
            </p>
          </form>
        )}
      </div>
    </main>
  )
}
