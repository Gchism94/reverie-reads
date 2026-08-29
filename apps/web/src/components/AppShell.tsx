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
import { Surface } from './Surface'
import { PowerGlyph } from './PowerGlyph'
import { isHouseholdAddContext } from './appShellScope'

// Primary navigation. Glyph icons (token-coloured, no raster) echo the desktop design's rail.
const NAV = [
  { label: 'Home', to: '/', icon: '⌂' },
  { label: 'Library', to: '/library', icon: '▦' },
  { label: 'Shelves', to: '/shelves', icon: '≣' },
  { label: 'Series', to: '/series', icon: '◫' },
  { label: 'Tropes', to: '/tropes', icon: '❦' },
  { label: 'Planner', to: '/planner', icon: '◷' },
  { label: 'Stats', to: '/stats', icon: '◔' },
  { label: 'Match', to: '/match', icon: '✦' },
  { label: 'Discover', to: '/discover', icon: '✧' },
  { label: 'Clubs', to: '/clubs', icon: '❀' },
  { label: 'Indies', to: '/indie', icon: '☞' },
] as const

const NAV_GROUPS = [
  { label: 'Your books', items: NAV.slice(0, 5) },
  { label: 'Reading life', items: NAV.slice(5, 8) },
  { label: 'Explore', items: NAV.slice(8) },
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
    <nav
      className="flex flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden"
      aria-label="Primary"
    >
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-0.5">
          {!collapsed ? (
            <div className="skin-label px-3 pb-1 text-[9px] text-muted opacity-70">
              {group.label}
            </div>
          ) : null}
          {group.items.map((item) => (
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
                  fontWeight: 650,
                  background: 'var(--chip)',
                  boxShadow: 'inset 2px 0 0 var(--primary)',
                },
              }}
            >
              <span className="grid w-5 shrink-0 place-items-center text-[14px]" aria-hidden>
                {item.icon}
              </span>
              {!collapsed ? <span className="truncate">{item.label}</span> : null}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  )
}

/** Persistent desktop rail: brand, primary nav, and skin / theme / account controls. */
function Sidebar({ householdAdd }: { householdAdd: boolean }) {
  const { signOut } = useAuth()
  const skinLabel = useSkinLabel()
  const effective = useEffectiveSkin()
  const chromeLine = SKINS[effective].chromeLine
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
        width: collapsed ? 76 : 232,
        background: 'color-mix(in srgb, var(--bg1) 90%, transparent)',
        borderRight: '1px solid var(--line)',
      }}
    >
      {/* Brand */}
      {/* The CHROME (chunk-4 composed screens): the brand block names the ROOM, not the widget —
          "Reverie · The standing invitation / The night office / Up too late…" — and wears the
          skin's chrome material as a rail beneath (`.rv-chrome`, per-skin rules in skin-kit.css). */}
      <Link
        to="/"
        className="rv-chrome flex items-center gap-2.5 px-1 py-1 pb-2.5"
        aria-label={`${APP_NAME} home`}
      >
        <span
          className="grid h-[36px] w-[36px] shrink-0 place-items-center text-[18px] italic"
          style={{
            background: 'var(--card)',
            color: 'var(--gold)',
            border: '1px solid var(--gold)',
            borderRadius: 'var(--radius-card)',
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
            <span className="skin-label mt-1 block truncate text-[10px] text-muted">
              {chromeLine}
            </span>
          </span>
        )}
      </Link>

      {!collapsed && <SkinDivider className="my-3" />}

      {/* Add — primary action */}
      <Link
        to="/add"
        data-testid="persistent-add"
        search={householdAdd ? { scope: 'household' } : {}}
        title={collapsed ? (householdAdd ? 'Add to household' : 'Add a book') : undefined}
        aria-label={householdAdd ? 'Add to household' : 'Add a book'}
        className={`skin-control skin-btn-primary mb-3 flex h-10 items-center justify-center gap-1.5 text-[13px] ${
          collapsed ? 'px-0' : 'px-4'
        }`}
      >
        <span aria-hidden>＋</span>
        {!collapsed && <span>{householdAdd ? 'Add to household' : 'Add a book'}</span>}
      </Link>

      <NavLinks collapsed={collapsed} />

      {/* Footer controls */}
      <div
        className="mt-3 flex flex-col gap-2 border-t pt-3"
        style={{ borderColor: 'var(--line)' }}
      >
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
            <span className={collapsed ? '' : 'hidden'}>
              <PowerGlyph />
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

/** Compact top bar for narrow screens — brand and theme only. Navigation lives in the tab bar. */
function MobileBar() {
  return (
    <header className="flex items-center justify-between gap-3 px-4 py-3 lg:hidden">
      <Link to="/" className="shrink-0" aria-label={`${APP_NAME} home`}>
        <span
          className="text-[24px] italic leading-none text-ink"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 600, letterSpacing: '0.5px' }}
        >
          {APP_NAME}
        </span>
      </Link>
      <ThemeToggle compact />
    </header>
  )
}

// The tab bar keeps the daily surfaces; everything else sits one tap away in the More sheet.
const TAB_NAV = [NAV[0], NAV[1], NAV[4]] as const // Home, Library, Planner
const MORE_NAV = [
  ...NAV.filter((n) => !(TAB_NAV as readonly (typeof NAV)[number][]).includes(n)),
  { label: 'Skins', to: '/skins', icon: '◐' },
  { label: 'Settings', to: '/settings', icon: '⚙' },
] as const

const tabLink =
  'flex flex-col items-center justify-center gap-1 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors'

function TabLink({ item }: { item: { label: string; to: string; icon: string } }) {
  return (
    <Link
      to={item.to}
      activeOptions={{ exact: item.to === '/' }}
      className={tabLink}
      style={{ color: 'var(--muted)' }}
      activeProps={{ style: { color: 'var(--primary)' } }}
    >
      <span className="text-[17px] leading-none" aria-hidden>
        {item.icon}
      </span>
      <span className="skin-label">{item.label}</span>
    </Link>
  )
}

/** Bottom tab bar for narrow screens — the app-like navigation a PWA install expects. The old
 *  scrollable pill row clipped nine of ten destinations invisibly behind the Add button. */
function MobileTabBar({ householdAdd }: { householdAdd: boolean }) {
  const { signOut } = useAuth()
  const [moreOpen, setMoreOpen] = useState(false)
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  // navigating anywhere closes the sheet; Escape closes it too
  useEffect(() => setMoreOpen(false), [pathname])
  useEffect(() => {
    if (!moreOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [moreOpen])

  const moreActive = MORE_NAV.some((m) => pathname === m.to || pathname.startsWith(`${m.to}/`))

  return (
    <>
      {moreOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setMoreOpen(false)}
          className="fixed inset-0 z-30 cursor-default lg:hidden"
          style={{ background: 'color-mix(in srgb, var(--bg) 45%, transparent)' }}
        />
      )}

      {/* tone="card-solid" replaces the hand-rolled gradient this sheet carried — §7.4's collapse.
          The gradient faked opacity by stacking --card over --bg; --card-solid is the AUTHORED
          opaque plate, and in marrow/dark the two genuinely differ (composite (22,19,21) vs
          #212328, maxΔ=19) — meaning this sheet and Modal wore different colours there until now.
          radius="panel": the sheet is floating tray chrome (marrow's own token comment: "trays are
          chamfer-cut"), not a content card — the held site was never radius-ruled by batch 3. */}
      {moreOpen && (
        <Surface
          id="mobile-more-sheet"
          tone="card-solid"
          radius="panel"
          pad={0}
          raised
          className="fixed inset-x-3 z-50 p-2 lg:hidden"
          style={{ bottom: 'calc(76px + env(safe-area-inset-bottom))' }}
        >
          <nav className="grid grid-cols-3 gap-1" aria-label="More destinations">
            {MORE_NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-[13px] font-medium"
                style={{ color: 'var(--muted)' }}
                activeProps={{
                  style: {
                    color: 'var(--ink)',
                    background: 'color-mix(in srgb, var(--primary) 14%, transparent)',
                  },
                }}
              >
                <span className="text-[18px] leading-none" aria-hidden>
                  {item.icon}
                </span>
                <span className="skin-label">{item.label}</span>
              </Link>
            ))}
          </nav>
          <div className="mt-1 border-t pt-1" style={{ borderColor: 'var(--line)' }}>
            <button
              type="button"
              onClick={() => void signOut()}
              className="skin-control flex w-full items-center justify-center gap-2 px-2 py-2.5 text-[13px] font-semibold text-muted"
            >
              <PowerGlyph /> Sign out
            </button>
          </div>
        </Surface>
      )}

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur-lg lg:hidden"
        style={{
          borderColor: 'var(--line)',
          background: 'color-mix(in srgb, var(--bg) 84%, transparent)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div className="grid grid-cols-5">
          <TabLink item={TAB_NAV[0]} />
          <TabLink item={TAB_NAV[1]} />
          <div className="flex items-start justify-center">
            <Link
              to="/add"
              data-testid="persistent-add"
              search={householdAdd ? { scope: 'household' } : {}}
              aria-label={householdAdd ? 'Add to household' : 'Add a book'}
              className="grid h-11 w-11 -translate-y-3 place-items-center rounded-full text-[20px]"
              style={{
                background: 'var(--accent-fill)',
                color: 'var(--on-primary)',
                boxShadow: 'var(--shadow)',
              }}
            >
              <span aria-hidden>＋</span>
            </Link>
          </div>
          <TabLink item={TAB_NAV[2]} />
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            aria-controls="mobile-more-sheet"
            className={tabLink}
            style={{ color: moreOpen || moreActive ? 'var(--primary)' : 'var(--muted)' }}
          >
            <span className="text-[17px] leading-none" aria-hidden>
              ⋯
            </span>
            <span className="skin-label">More</span>
          </button>
        </div>
      </nav>
    </>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  useSkinSync() // reconcile skin/mode from the signed-in profile (cross-device)
  const mainRef = useRef<HTMLElement>(null)
  const location = useRouterState({ select: (s) => s.location })
  const pathname = location.pathname
  const householdAdd = isHouseholdAddContext(pathname, location.search)

  // Move focus to the main content on navigation so keyboard/screen-reader users land there.
  useEffect(() => {
    mainRef.current?.focus()
  }, [pathname])

  return (
    <div className="relative flex min-h-dvh">
      <a
        href="#main"
        className="skin-control sr-only px-4 py-2 text-[13px] font-semibold focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50"
        style={{ background: 'var(--accent-fill)', color: 'var(--on-primary)' }}
      >
        Skip to content
      </a>

      <Sidebar householdAdd={householdAdd} />

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileBar />
        <div className="relative z-[1] px-4 lg:px-5">
          <SkinEvolveReveal />
        </div>
        <main
          ref={mainRef}
          id="main"
          tabIndex={-1}
          className="relative z-[1] flex flex-1 flex-col pb-[calc(72px+env(safe-area-inset-bottom))] outline-none lg:pb-0"
        >
          {children}
        </main>
      </div>

      <MobileTabBar householdAdd={householdAdd} />
    </div>
  )
}
