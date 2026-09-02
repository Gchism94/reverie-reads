import { Suspense, lazy, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { APP_NAME } from '@reverie/core'
import { Wordmark } from './Wordmark'
import { ChunkBoundary } from '../components/ChunkBoundary'
import { Mockup } from './landing/Mockup'

// Below-the-fold sections are a separate chunk so the hero paints first for new visitors.
const LandingBelowFold = lazy(() => import('./landing/below-fold'))

const display = { fontFamily: 'var(--font-display)', fontWeight: 600 } as const
const NAV = [
  ['Library', '#library'],
  ['Household', '#household'],
  ['Series', '#series'],
  ['The skins', '#skins'],
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
              className="text-[13.5px] font-medium text-muted hover:text-ink"
            >
              {label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <Link
            to="/auth"
            search={{ mode: 'signin' }}
            className="text-[13.5px] font-semibold text-ink"
          >
            Log in
          </Link>
          <Link
            to="/auth"
            search={{ mode: 'signup' }}
            className="skin-control flex h-9 items-center px-4 text-[13.5px] font-semibold"
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
    <header id="top" className="relative mx-auto max-w-[1180px] px-6 pb-20 pt-14 sm:pb-28 sm:pt-24">
      <div className="grid items-center gap-14 lg:grid-cols-[0.94fr_1.06fr]">
        <div className="text-center lg:text-left">
          <p
            className="text-[12px] font-semibold uppercase tracking-[0.22em]"
            style={{ color: 'var(--eyebrow)' }}
          >
            Your library · in all its detail
          </p>
          <h1
            data-testid="landing-display-heading"
            className="mx-auto mt-4 max-w-[13ch] text-balance text-[clamp(42px,7vw,66px)] leading-[0.99] text-ink lg:mx-0"
            style={display}
          >
            Keep the whole story of your{' '}
            <span className="italic" style={{ color: 'var(--gold)' }}>
              reading life.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-[48ch] text-[16px] leading-relaxed text-muted lg:mx-0">
            Books, rereads, series, plans, and the people you share a shelf with—organized without
            losing what makes the library yours.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
            <Link
              to="/auth"
              search={{ mode: 'signup' }}
              className="skin-control flex h-12 items-center px-7 text-[15px] font-semibold"
              style={{
                background: 'var(--gold)',
                color: 'var(--on-primary)',
                boxShadow: '0 10px 26px color-mix(in srgb, var(--gold) 36%, transparent)',
              }}
            >
              Begin your library
            </Link>
            <a
              href="#library"
              className="skin-control flex h-12 items-center px-6 text-[15px] font-semibold text-ink"
              style={{ border: '1px solid var(--line)' }}
            >
              See what it keeps
            </a>
          </div>
          <p className="mt-5 text-[13px]" style={{ color: 'var(--faint)' }}>
            Private by default · export anytime · installs as an app
          </p>
        </div>

        <div className="relative mx-auto w-full max-w-[560px] lg:rotate-[0.5deg]">
          <Mockup ariaLabel="Reverie app preview" />
          <div
            aria-hidden
            className="absolute -left-3 top-[22%] hidden border px-3 py-2 text-[10px] font-semibold shadow-xl sm:block lg:-left-8"
            style={{
              background: 'color-mix(in srgb, var(--bg1) 96%, transparent)',
              borderColor: 'var(--line)',
              color: 'var(--ink)',
              borderRadius: 'var(--radius-card)',
            }}
          >
            Personal details stay personal
          </div>
          <div
            aria-hidden
            className="absolute -bottom-4 right-3 hidden border px-3 py-2 text-[10px] font-semibold shadow-xl sm:block lg:-right-5"
            style={{
              background: 'color-mix(in srgb, var(--bg1) 96%, transparent)',
              borderColor: 'color-mix(in srgb, var(--gold) 50%, var(--line))',
              color: 'var(--gold)',
              borderRadius: 'var(--radius-card)',
            }}
          >
            Series order · progress · gaps
          </div>
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
