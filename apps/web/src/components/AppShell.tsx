import type { ReactNode } from 'react'
import { APP_NAME } from '@reverie/core'
import { FiligreeDivider } from './FiligreeDivider'
import { ThemeToggle } from './ThemeToggle'

// Placeholder nav — each screen lands in its own route during Steps 5–6.
const NAV = ['Home', 'Library', 'Shelves', 'Planner', 'Stats', 'Clubs'] as const
const ACTIVE = 'Library'

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <header className="relative z-10 flex items-center gap-4 px-5 py-3.5">
        <div className="min-w-[150px]">
          <div
            className="text-[26px] italic leading-none text-ink"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 600, letterSpacing: '0.5px' }}
          >
            {APP_NAME}
          </div>
          <FiligreeDivider className="mt-1.5" />
        </div>

        <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
          {NAV.map((item) => {
            const active = item === ACTIVE
            return (
              <button
                key={item}
                type="button"
                aria-current={active ? 'page' : undefined}
                className={`whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                  active ? 'text-ink' : 'text-muted hover:text-ink'
                }`}
                style={active ? { background: 'var(--card)', border: '1px solid var(--line)' } : undefined}
              >
                {item}
              </button>
            )
          })}
        </nav>

        <div className="flex flex-none items-center gap-2.5">
          <ThemeToggle />
        </div>
      </header>

      <main className="relative z-[1] flex flex-1 flex-col">{children}</main>
    </div>
  )
}
