import { Link } from '@tanstack/react-router'
import { APP_NAME } from '@reverie/core'
import { Wordmark } from './Wordmark'

/** Genre-neutral feature notes — kept skin-agnostic (no spice/tropes language) since this is the
 *  pre-skin front door. Each reader's skin colours the app once they're in. */
const NOTES = [
  {
    title: 'Every shelf, one place',
    body: 'Books you’ve read and the ones you mean to — with series gaps and rereads kept straight.',
  },
  {
    title: 'Kept the way you read',
    body: 'Tags, intensity, the formats you own, your own rating — the details you actually track.',
  },
  {
    title: 'Your private Wrapped',
    body: 'A year in reading, just for you — never shared, never public.',
  },
]

/** The public landing — the unauthenticated front door. Wrapped by the gold master brand (UnauthShell),
 *  so its CTAs read luminous gold with dark text. One privacy line only (folded into the copy below the
 *  CTAs); no pricing claim. */
export function Landing() {
  return (
    <main className="relative z-[1] mx-auto flex min-h-dvh max-w-[1080px] flex-col px-6 py-8">
      <header className="flex items-center justify-between">
        <Wordmark />
        <Link
          to="/auth"
          search={{ mode: 'signin' }}
          className="rounded-full px-4 py-2 text-[13.5px] font-semibold text-ink"
          style={{ border: '1px solid var(--line)' }}
        >
          Log in
        </Link>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center py-16 text-center">
        <h1
          className="max-w-[18ch] text-balance text-[clamp(38px,7vw,68px)] leading-[1.02] text-ink"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
        >
          A reading life,{' '}
          <span className="italic" style={{ color: 'var(--gold)' }}>
            beautifully kept.
          </span>
        </h1>
        <p className="mt-5 max-w-[46ch] text-[16px] leading-relaxed text-muted">
          Everything you’ve read, everything you mean to — gathered under one quiet night sky.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/auth"
            search={{ mode: 'signup' }}
            className="flex h-12 items-center rounded-full px-7 text-[15px] font-semibold"
            style={{
              background: 'var(--gold)',
              color: 'var(--on-primary)',
              boxShadow: '0 10px 26px color-mix(in srgb, var(--gold) 36%, transparent)',
            }}
          >
            Start your library
          </Link>
          <Link
            to="/auth"
            search={{ mode: 'signin' }}
            className="flex h-12 items-center rounded-full px-6 text-[15px] font-semibold text-ink"
            style={{ border: '1px solid var(--line)' }}
          >
            Log in
          </Link>
        </div>

        <p className="mt-5 flex items-center gap-1.5 text-[13px] text-muted">
          <span aria-hidden>🔒</span>
          Private by default — your reading stats and your Wrapped are never shared or made public.
        </p>
      </section>

      <section className="grid gap-4 pb-12 sm:grid-cols-3">
        {NOTES.map((n) => (
          <div
            key={n.title}
            className="rounded-2xl p-5"
            style={{ background: 'var(--card)', border: '1px solid var(--line)' }}
          >
            <h2
              className="text-[16px] text-ink"
              style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
            >
              {n.title}
            </h2>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{n.body}</p>
          </div>
        ))}
      </section>

      <footer className="border-t pt-5 text-center text-[12.5px] text-muted" style={{ borderColor: 'var(--line)' }}>
        {APP_NAME} — a quiet place for your reading life.
      </footer>
    </main>
  )
}
