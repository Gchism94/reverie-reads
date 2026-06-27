import { Outlet, createRootRoute } from '@tanstack/react-router'
import { Sky } from '../components/Sky'
import { AppShell } from '../components/AppShell'
import { useAuth } from '../auth/AuthProvider'
import { SignIn } from '../auth/SignIn'
import { VerifyEmail } from '../auth/VerifyEmail'

function RootLayout() {
  const { session, loading } = useAuth()
  // A session whose email isn't confirmed is gated out of the app (defense in depth — magic-link
  // verifies inherently, but a password signup could land here unconfirmed).
  const verified = !!session?.user && (!!session.user.email_confirmed_at || !!session.user.confirmed_at)
  return (
    <>
      <Sky />
      {loading ? (
        <div className="relative z-[1] flex min-h-dvh items-center justify-center text-muted">
          Loading…
        </div>
      ) : !session ? (
        <SignIn />
      ) : !verified ? (
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
