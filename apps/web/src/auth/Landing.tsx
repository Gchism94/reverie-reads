import { Suspense, lazy, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { APP_NAME } from '@reverie/core'
import { Wordmark } from './Wordmark'
import { ChunkBoundary } from '../components/ChunkBoundary'
import { ProductStage } from './landing/ProductStage'

// Below-the-fold sections are a separate chunk so the hero paints first for new visitors.
const LandingBelowFold = lazy(() => import('./landing/below-fold'))

const display = { fontFamily: 'var(--font-display)', fontWeight: 600 } as const
const NAV = [
  ['Rooms', '#skins'],
  ['Keep it', '#keep'],
  ['Share it', '#share'],
  ['Connect it', '#connect'],
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
    <header
      id="top"
      className="relative mx-auto max-w-[1380px] overflow-hidden px-4 pb-20 pt-14 sm:px-6 sm:pb-28 sm:pt-24"
    >
      <div className="mx-auto max-w-[950px] text-center">
        <div>
          <p
            className="text-[12px] font-semibold uppercase tracking-[0.22em]"
            style={{ color: 'var(--eyebrow)' }}
          >
            Your library · in all its detail
          </p>
          <h1
            data-testid="landing-display-heading"
            className="mx-auto mt-4 max-w-[15ch] text-balance text-[clamp(46px,8vw,82px)] leading-[0.94] text-ink"
            style={display}
          >
            Keep the whole story of your{' '}
            <span className="italic" style={{ color: 'var(--gold)' }}>
              reading life.
            </span>
          </h1>
          <p className="mx-auto mt-7 max-w-[58ch] text-[16px] leading-relaxed text-muted sm:text-[18px]">
            Books, rereads, series, plans, and the people you share a shelf with—organized without
            losing what makes the library yours.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
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
              href="#skins"
              className="skin-control flex h-12 items-center px-6 text-[15px] font-semibold text-ink"
              style={{ border: '1px solid var(--line)' }}
            >
              Enter the reading rooms
            </a>
          </div>
          <p className="mt-5 text-[13px]" style={{ color: 'var(--faint)' }}>
            Private by default · export anytime · installs as an app
          </p>
        </div>
      </div>

      <div className="relative mx-auto mt-14 max-w-[1240px] sm:mt-20">
        <div
          aria-hidden
          className="absolute inset-x-[10%] bottom-0 h-2/3 blur-3xl"
          style={{ background: 'color-mix(in srgb, var(--gold) 12%, transparent)' }}
        />
        <div className="relative">
          <ProductStage />
        </div>
      </div>

      <div className="mx-auto mt-10 grid max-w-[980px] grid-cols-2 border-y border-line sm:grid-cols-5">
        {['Library', 'Household', 'Series', 'Universes', 'Nine rooms'].map((item) => (
          <span
            key={item}
            className="flex min-h-14 items-center justify-center border-line px-3 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-muted [&:not(:last-child)]:border-r"
          >
            {item}
          </span>
        ))}
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
