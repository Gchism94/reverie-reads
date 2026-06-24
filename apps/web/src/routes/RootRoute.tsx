import { Outlet, createRootRoute } from '@tanstack/react-router'
import { Sky } from '../components/Sky'
import { AppShell } from '../components/AppShell'
import { useAuth } from '../auth/AuthProvider'
import { SignIn } from '../auth/SignIn'

function RootLayout() {
  const { session, loading } = useAuth()
  return (
    <>
      <Sky />
      {loading ? (
        <div className="relative z-[1] flex min-h-dvh items-center justify-center text-muted">
          Loading…
        </div>
      ) : session ? (
        <AppShell>
          <Outlet />
        </AppShell>
      ) : (
        <SignIn />
      )}
    </>
  )
}

export const rootRoute = createRootRoute({ component: RootLayout })
