import { useEffect, useRef, type ReactNode } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { APP_NAME } from '@reverie/core'
import { useAuth } from '../auth/AuthProvider'
import { useSkinSync } from '../skin/controls'
import { SkinDivider } from './SkinDivider'
import { ThemeToggle } from './ThemeToggle'

const NAV = [
  { label: 'Home', to: '/' },
  { label: 'Library', to: '/library' },
  { label: 'Shelves', to: '/shelves' },
  { label: 'Planner', to: '/planner' },
  { label: 'Stats', to: '/stats' },
  { label: 'Match', to: '/match' },
  { label: 'Clubs', to: '/clubs' },
  { label: 'Indies', to: '/indie' },
] as const

export function AppShell({ children }: { children: ReactNode }) {
  const { signOut } = useAuth()
  useSkinSync() // reconcile skin/mode from the signed-in profile (cross-device)
  const mainRef = useRef<HTMLElement>(null)
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  // Move focus to the main content on navigation so keyboard/screen-reader users land there.
  useEffect(() => {
    mainRef.current?.focus()
  }, [pathname])

  return (
    <div className="relative flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only rounded-full px-4 py-2 text-[13px] font-semibold focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50"
        style={{ background: 'var(--accent-fill)', color: 'var(--on-primary)' }}
      >
        Skip to content
      </a>
      <header className="relative z-10 flex items-center gap-4 px-5 py-3.5">
        <Link to="/" className="min-w-[140px]">
          <div
            className="text-[26px] italic leading-none text-ink"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 600, letterSpacing: '0.5px' }}
          >
            {APP_NAME}
          </div>
          <SkinDivider className="mt-1.5" />
        </Link>

        <nav className="flex flex-1 items-center gap-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.to === '/' }}
              className="whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors"
              style={{ color: 'var(--muted)' }}
              activeProps={{
                style: { color: 'var(--ink)', background: 'var(--card)', border: '1px solid var(--line)' },
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex flex-none items-center gap-2.5">
          <Link
            to="/add"
            className="flex h-[38px] items-center rounded-full px-4 text-[12.5px] font-semibold"
            style={{ background: 'linear-gradient(135deg, var(--primary), var(--gold))', color: 'var(--on-primary)' }}
          >
            ＋ Add
          </Link>
          <Link
            to="/settings"
            aria-label="Settings"
            className="hidden h-[38px] w-[38px] items-center justify-center rounded-full border border-line text-ink sm:flex"
            style={{ background: 'var(--card)' }}
          >
            ⚙
          </Link>
          <ThemeToggle />
          <button
            type="button"
            onClick={() => void signOut()}
            className="hidden h-[38px] items-center rounded-full border border-line px-3.5 text-[12.5px] font-semibold text-muted hover:text-ink sm:flex"
            style={{ background: 'var(--card)' }}
          >
            Sign out
          </button>
        </div>
      </header>

      <main ref={mainRef} id="main" tabIndex={-1} className="relative z-[1] flex flex-1 flex-col outline-none">
        {children}
      </main>
    </div>
  )
}
