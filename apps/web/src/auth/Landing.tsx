import { Suspense, lazy, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { APP_NAME } from '@reverie/core'
import { Wordmark } from './Wordmark'
import { ChunkBoundary } from '../components/ChunkBoundary'
import { NextReadDemo } from './landing/NextReadDemo'

// Below-the-fold sections are a separate chunk so the hero paints first for new visitors.
const LandingBelowFold = lazy(() => import('./landing/below-fold'))

const display = { fontFamily: 'var(--font-display)', fontWeight: 600 } as const
const NAV = [
  ['How it works', '#how-it-works'],
  ['Rooms', '#skins'],
  ['Privacy', '#privacy'],
] as const

/** Drifting nebula glows over the brand's static starfield — the living night sky. Motion via the
 *  project's `.rv-anim` convention, which prefers-reduced-motion disables. Decorative. */
function NightSky() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="nebula rv-anim"
        style={{
          width: '52vmax',
          height: '52vmax',
          top: '-14%',
          left: '-8%',
          background: 'var(--gold)',
          animationName: 'rv-drift-a',
          animationDuration: '40s',
          animationTimingFunction: 'ease-in-out',
          animationIterationCount: 'infinite',
        }}
      />
      <div
        className="nebula rv-anim"
        style={{
          width: '46vmax',
          height: '46vmax',
          top: '10%',
          right: '-12%',
          background: 'var(--violet)',
          animationName: 'rv-drift-b',
          animationDuration: '47s',
          animationTimingFunction: 'ease-in-out',
          animationIterationCount: 'infinite',
        }}
      />
    </div>
  )
}

function Nav() {
  const [open, setOpen] = useState(false)
  return (
    <nav
      aria-label="Landing"
      className="sticky top-0 z-20 backdrop-blur-lg"
      style={{
        background: 'color-mix(in srgb, var(--bg0) 72%, transparent)',
        borderBottom: '1px solid var(--line)',
      }}
    >
      <div className="mx-auto flex max-w-[1180px] items-center justify-between px-6 py-3.5">
        <Link to="/" aria-label={`${APP_NAME} home`}>
          <Wordmark />
        </Link>

        <div className="hidden items-center gap-5 md:flex lg:gap-7">
          {NAV.map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="flex min-h-11 items-center text-sm font-medium text-muted hover:text-ink"
            >
              {label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <Link
            to="/auth"
            search={{ mode: 'signin' }}
            className="flex min-h-11 items-center text-sm font-semibold text-ink"
          >
            Log in
          </Link>
          <Link
            to="/auth"
            search={{ mode: 'signup' }}
            className="skin-control flex min-h-11 items-center px-4 text-sm font-semibold"
            style={{ background: 'var(--gold)', color: 'var(--on-primary)' }}
          >
            Get started
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Menu"
          aria-expanded={open}
          className="grid h-11 w-11 place-items-center rounded-lg border border-line text-[18px] text-ink md:hidden"
        >
          <span aria-hidden>{open ? '✕' : '≡'}</span>
        </button>
      </div>

      {open && (
        <div
          className="border-t px-6 py-3 md:hidden"
          style={{ borderColor: 'var(--line)', background: 'var(--bg0)' }}
        >
          <div className="flex flex-col gap-1">
            {NAV.map(([label, href]) => (
              <a
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center rounded-lg px-2 py-2 text-[14px] font-medium text-muted hover:text-ink"
              >
                {label}
              </a>
            ))}
            <Link
              to="/auth"
              search={{ mode: 'signin' }}
              className="flex min-h-11 items-center rounded-lg px-2 py-2 text-[14px] font-semibold text-ink"
            >
              Log in
            </Link>
            <Link
              to="/auth"
              search={{ mode: 'signup' }}
              className="skin-control mt-1 flex h-11 items-center justify-center text-[14px] font-semibold"
              style={{ background: 'var(--gold)', color: 'var(--on-primary)' }}
            >
              Get started
            </Link>
          </div>
        </div>
      )}
    </nav>
  )
}

function Hero() {
  return (
    <header
      id="top"
      className="relative mx-auto max-w-[1320px] px-5 pb-16 pt-12 sm:px-8 sm:pb-24 sm:pt-20"
    >
      <div className="grid items-center gap-12 lg:grid-cols-[0.82fr_1.18fr] lg:gap-14">
        <div>
          <p
            className="text-xs font-semibold uppercase tracking-[0.2em]"
            style={{ color: 'var(--eyebrow)' }}
          >
            A personal library that feels like home
          </p>
          <h1
            data-testid="landing-display-heading"
            className="mt-5 max-w-[13ch] text-balance text-[clamp(46px,5.6vw,74px)] leading-[1.02] text-ink"
            style={display}
          >
            Find your next read in your{' '}
            <span className="italic" style={{ color: 'var(--gold)' }}>
              own library.
            </span>
          </h1>
          <p className="mt-6 max-w-[42ch] text-base leading-relaxed text-muted sm:text-lg">
            A quiet place for your books, your notes, and the way a story stays with you. Settle in,
            then find the next book for how you feel today.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              to="/auth"
              search={{ mode: 'signup' }}
              className="skin-control skin-btn-primary flex min-h-12 items-center px-6 text-[15px] font-semibold"
              style={{ background: 'var(--gold)', color: 'var(--on-primary)' }}
            >
              Start your library
            </Link>
            <a
              href="#try-next-read"
              className="skin-control flex min-h-12 items-center border border-line px-6 text-[15px] font-semibold text-ink"
            >
              Try it here
            </a>
          </div>
          <p className="mt-5 max-w-[40ch] text-sm leading-relaxed text-muted">
            Start with a few books. Bring the rest when you’re ready.
          </p>
          <p className="mt-5 text-xs leading-relaxed text-muted">
            Private by default · Nine reading rooms · Export anytime
          </p>
        </div>
        <div className="min-w-0 rounded-[var(--radius-panel)] border border-line bg-card p-4 shadow-[var(--shadow)] sm:p-6">
          <NextReadDemo />
        </div>
      </div>
    </header>
  )
}

/** The public marketing landing — matched to the Reverie Landing design, on the gold master brand
 *  (UnauthShell wraps it in `.gold-brand`). Net-new pre-login entry point for logged-out visitors. */
export function Landing() {
  return (
    <main className="relative z-[1]">
      <NightSky />
      <Nav />
      <Hero />
      {/* The below-fold chunk is the one piece of this page that has to be fetched. If it can't be
          — offline, or a stale client after a deploy — the hero, nav and CTA above have already
          rendered and must stay. Before this, that single failed import unwound to the app-wide
          boundary and replaced a working page with "Something went wrong!". */}
      <ChunkBoundary label="landing-below-fold">
        <Suspense
          fallback={<div className="py-24 text-center text-[13px] text-muted">Loading…</div>}
        >
          <LandingBelowFold />
        </Suspense>
      </ChunkBoundary>
    </main>
  )
}
