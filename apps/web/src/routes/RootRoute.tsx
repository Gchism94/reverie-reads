import { Outlet, createRootRoute, useRouterState } from '@tanstack/react-router'
import { Sky } from '../components/Sky'
import { AppShell } from '../components/AppShell'
import { useAuth } from '../auth/AuthProvider'
import { UnauthShell } from '../auth/UnauthShell'
import { VerifyEmail } from '../auth/VerifyEmail'

function RootLayout() {
  const { session, loading } = useAuth()
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  // The skin-character lab (/lab/skins) renders OUTSIDE the auth gate so the Tryst-vs-Aphelion
  // side-by-side can be opened — and screenshotted headlessly — without a session. Synthetic content
  // only; each cell scopes its own data-skin/data-mode, so no global Sky is needed.
  if (pathname.startsWith('/lab/')) {
    return <Outlet />
  }
  // A session whose email isn't confirmed is gated out of the app (H3, defense in depth). Password
  // sign-up with confirmation on creates NO session until the link is opened, so that flow stays on
  // the unauthenticated shell (the auth screen shows "check your inbox"); this gate catches the
  // residual case of a session that exists but is unconfirmed (e.g. OAuth without a verified email).
  const verified = !!session?.user && (!!session.user.email_confirmed_at || !!session.user.confirmed_at)

  if (loading) {
    return (
      <div className="relative z-[1] flex min-h-dvh items-center justify-center text-muted">Loading…</div>
    )
  }

  // Signed out → the gold master-brand front door (landing + auth). It paints its own night sky, so
  // no skin-themed Sky here; that keeps the door gold-on-night regardless of any persisted skin.
  if (!session) {
    return <UnauthShell />
  }

  return (
    <>
      <Sky />
      {!verified ? (
        <VerifyEmail email={session.user.email} />
      ) : (
        <AppShell>
          <Outlet />
        </AppShell>
      )}
    </>
  )
}

export const rootRoute = createRootRoute({ component: RootLayout })
