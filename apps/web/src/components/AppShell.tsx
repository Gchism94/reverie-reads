import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { APP_NAME, SKINS } from '@reverie/core'
import { useAuth } from '../auth/AuthProvider'
import { useSkin } from '../skin/useSkin'
import { useEffectiveSkin } from '../skin/labels'
import { useSkinSync } from '../skin/controls'
import { SkinDivider } from './SkinDivider'
import { SkinEvolveReveal } from './SkinEvolveReveal'
import { ThemeToggle } from './ThemeToggle'

// Primary navigation. Glyph icons (token-coloured, no raster) echo the desktop design's rail.
const NAV = [
  { label: 'Home', to: '/', icon: '⌂' },
  { label: 'Library', to: '/library', icon: '▦' },
  { label: 'Shelves', to: '/shelves', icon: '≣' },
  { label: 'Orders', to: '/orders', icon: '◇' },
  { label: 'Planner', to: '/planner', icon: '◷' },
  { label: 'Stats', to: '/stats', icon: '◔' },
  { label: 'Match', to: '/match', icon: '✦' },
  { label: 'Clubs', to: '/clubs', icon: '❀' },
  { label: 'Indies', to: '/indie', icon: '☞' },
] as const

const COLLAPSE_KEY = 'reverie.sidebar.collapsed'

function readCollapsed(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage?.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

/** The active skin's display label (adaptive resolves to "Adaptive"). */
function useSkinLabel(): string {
  const skin = useSkin((s) => s.skin)
  const effective = useEffectiveSkin()
  return skin === 'adaptive' ? 'Adaptive' : SKINS[effective].label
}

const navBase =
  'relative flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13.5px] font-medium transition-colors'

function NavLinks({ collapsed }: { collapsed: boolean }) {
  return (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden" aria-label="Primary">
      {NAV.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          activeOptions={{ exact: item.to === '/' }}
          title={collapsed ? item.label : undefined}
          aria-label={collapsed ? item.label : undefined}
          className={`${navBase} ${collapsed ? 'justify-center' : ''}`}
          style={{ color: 'var(--muted)' }}
          activeProps={{
            style: {
              color: 'var(--ink)',
              fontWeight: 600,
              background: 'color-mix(in srgb, var(--primary) 16%, transparent)',
              boxShadow: 'inset 2px 0 0 var(--primary)',
            },
          }}
        >
          <span className="grid w-5 shrink-0 place-items-center text-[14px]" aria-hidden>
            {item.icon}
          </span>
          {!collapsed && <span className="skin-label truncate">{item.label}</span>}
        </Link>
      ))}
    </nav>
  )
}

/** Persistent desktop rail: brand, primary nav, and skin / theme / account controls. */
function Sidebar() {
  const { signOut } = useAuth()
  const skinLabel = useSkinLabel()
  const [collapsed, setCollapsed] = useState(readCollapsed)

  useEffect(() => {
    try {
      window.localStorage?.setItem(COLLAPSE_KEY, collapsed ? '1' : '0')
    } catch {
      /* private mode / denied */
    }
  }, [collapsed])

  return (
    <div
      className="sticky top-0 hidden h-dvh shrink-0 flex-col px-3.5 py-4 backdrop-blur-lg transition-[width] duration-200 ease-out motion-reduce:transition-none lg:flex"
      style={{
        width: collapsed ? 76 : 248,
        background: 'color-mix(in srgb, var(--card) 64%, transparent)',
        borderRight: '1px solid var(--line)',
      }}
    >
      {/* Brand */}
      <Link to="/" className="flex items-center gap-2.5 px-1 py-1" aria-label={`${APP_NAME} home`}>
        <span
          className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px] text-[18px] italic"
          style={{
            background: 'linear-gradient(135deg, var(--primary), var(--violet))',
            color: 'var(--on-primary)',
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            boxShadow: 'var(--shadow)',
          }}
        >
          {APP_NAME.charAt(0)}
        </span>
        {!collapsed && (
          <span className="overflow-hidden">
            <span
              className="block truncate text-[17px] leading-none text-ink"
              style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
            >
              {APP_NAME}
            </span>
            <span className="mt-1 block truncate text-[10.5px] uppercase tracking-[0.08em] text-muted">
              {skinLabel} skin
            </span>
          </span>
        )}
      </Link>

      {!collapsed && <SkinDivider className="my-3" />}

      {/* Add — primary action */}
      <Link
        to="/add"
        title={collapsed ? 'Add a book' : undefined}
        aria-label="Add a book"
        className={`skin-control skin-btn-primary mb-3 flex h-10 items-center justify-center gap-1.5 text-[13px] ${
          collapsed ? 'px-0' : 'px-4'
        }`}
      >
        <span aria-hidden>＋</span>
        {!collapsed && <span>Add a book</span>}
      </Link>

      <NavLinks collapsed={collapsed} />

      {/* Footer controls */}
      <div className="mt-3 flex flex-col gap-2 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
        <div className={`flex items-center gap-1.5 ${collapsed ? 'flex-col' : ''}`}>
          <Link
            to="/skins"
            title="Choose skin"
            aria-label="Choose skin"
            className={`flex h-9 items-center justify-center gap-2 skin-control border border-line text-[12px] text-ink ${
              collapsed ? 'w-9' : 'flex-1'
            }`}
            style={{ background: 'color-mix(in srgb, var(--card) 70%, transparent)' }}
          >
            <span
              aria-hidden
              className="h-3 w-3 shrink-0 rounded-[4px]"
              style={{ background: 'linear-gradient(135deg, var(--primary), var(--gold))' }}
            />
            {!collapsed && <span className="truncate">{skinLabel}</span>}
          </Link>
          <ThemeToggle compact />
        </div>

        <div className={`flex items-center gap-1.5 ${collapsed ? 'flex-col' : ''}`}>
          <Link
            to="/settings"
            title="Settings"
            aria-label="Settings"
            className={`flex h-9 items-center justify-center gap-2 skin-control border border-line text-[12px] text-ink ${
              collapsed ? 'w-9' : 'flex-1'
            }`}
            style={{ background: 'color-mix(in srgb, var(--card) 70%, transparent)' }}
          >
            <span aria-hidden>⚙</span>
            {!collapsed && <span>Settings</span>}
          </Link>
          <button
            type="button"
            onClick={() => void signOut()}
            title="Sign out"
            aria-label="Sign out"
            className={`flex h-9 items-center justify-center skin-control border border-line text-[12px] text-muted hover:text-ink ${
              collapsed ? 'w-9' : 'px-3'
            }`}
            style={{ background: 'color-mix(in srgb, var(--card) 70%, transparent)' }}
          >
            <span aria-hidden className={collapsed ? '' : 'hidden'}>
              ⏻
            </span>
            <span className={collapsed ? 'hidden' : ''}>Sign out</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className={`flex items-center gap-2 rounded-[10px] px-2 py-1.5 text-[12px] text-muted hover:text-ink ${
            collapsed ? 'justify-center' : ''
          }`}
          aria-pressed={collapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <span aria-hidden>{collapsed ? '⟩' : '⟨'}</span>
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </div>
  )
}

/** Compact top bar for narrow screens — keeps brand, scrollable nav, and the core actions. */
function MobileBar() {
  const { signOut } = useAuth()
  return (
    <header className="flex items-center gap-3 px-4 py-3 lg:hidden">
      <Link to="/" className="shrink-0" aria-label={`${APP_NAME} home`}>
        <span
          className="text-[24px] italic leading-none text-ink"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 600, letterSpacing: '0.5px' }}
        >
          {APP_NAME}
        </span>
      </Link>

      <nav className="flex flex-1 items-center gap-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }} aria-label="Primary">
        {NAV.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: item.to === '/' }}
            className="skin-label whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] transition-colors"
            style={{ color: 'var(--muted)' }}
            activeProps={{
              style: { color: 'var(--ink)', background: 'var(--card)', border: '1px solid var(--line)' },
            }}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="flex shrink-0 items-center gap-2">
        <Link
          to="/add"
          className="skin-control flex h-[36px] items-center px-3.5 text-[12.5px]"
          style={{ background: 'linear-gradient(135deg, var(--primary), var(--gold))', color: 'var(--on-primary)' }}
        >
          ＋ Add
        </Link>
        <Link
          to="/settings"
          aria-label="Settings"
          title="Settings"
          className="skin-control grid h-9 w-9 shrink-0 place-items-center border border-line text-[14px] text-ink"
          style={{ background: 'color-mix(in srgb, var(--card) 70%, transparent)' }}
        >
          <span aria-hidden>⚙</span>
        </Link>
        <ThemeToggle compact />
        <button
          type="button"
          onClick={() => void signOut()}
          aria-label="Sign out"
          className="hidden h-[36px] items-center rounded-full border border-line px-3 text-[12.5px] font-semibold text-muted hover:text-ink sm:flex"
          style={{ background: 'var(--card)' }}
        >
          Sign out
        </button>
      </div>
    </header>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  useSkinSync() // reconcile skin/mode from the signed-in profile (cross-device)
  const mainRef = useRef<HTMLElement>(null)
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  // Move focus to the main content on navigation so keyboard/screen-reader users land there.
  useEffect(() => {
    mainRef.current?.focus()
  }, [pathname])

  return (
    <div className="relative flex min-h-dvh">
      <a
        href="#main"
        className="sr-only rounded-full px-4 py-2 text-[13px] font-semibold focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50"
        style={{ background: 'var(--accent-fill)', color: 'var(--on-primary)' }}
      >
        Skip to content
      </a>

      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileBar />
        <div className="relative z-[1] px-4 lg:px-5">
          <SkinEvolveReveal />
        </div>
        <main ref={mainRef} id="main" tabIndex={-1} className="relative z-[1] flex flex-1 flex-col outline-none">
          {children}
        </main>
      </div>
    </div>
  )
}
