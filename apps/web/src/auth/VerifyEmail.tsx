import { useAuth } from './AuthProvider'

/**
 * Gate shown when a session exists but the email isn't confirmed (H3). Magic-link sign-in verifies
 * email inherently, so this is the belt-and-suspenders state for any password-based signup that
 * hasn't confirmed yet — full access stays blocked until they do.
 */
export function VerifyEmail({ email }: { email?: string }) {
  const { signOut } = useAuth()
  return (
    <section className="relative z-[1] flex min-h-dvh flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-[13px] uppercase tracking-[0.3em] text-muted">One more step</p>
      <h1
        className="mt-3 max-w-[18ch] text-balance text-[32px] italic leading-[1.1] text-ink"
        style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
      >
        Confirm your email to continue
      </h1>
      <p className="mt-4 max-w-[42ch] text-[15px] leading-relaxed text-muted">
        We sent a confirmation link{email ? <> to <span className="text-ink">{email}</span></> : ''}. Open it to
        verify your address, then come back and sign in.
      </p>
      <button
        type="button"
        onClick={() => void signOut()}
        className="mt-6 h-11 rounded-full border border-line px-6 text-[14px] font-semibold text-ink"
        style={{ background: 'var(--field)' }}
      >
        Back to sign in
      </button>
    </section>
  )
}
