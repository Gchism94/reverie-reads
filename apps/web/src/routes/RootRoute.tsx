import { Outlet, createRootRoute } from '@tanstack/react-router'
import { Sky } from '../components/Sky'
import { AppShell } from '../components/AppShell'

function RootLayout() {
  return (
    <>
      <Sky />
      <AppShell>
        <Outlet />
      </AppShell>
    </>
  )
}

export const rootRoute = createRootRoute({ component: RootLayout })
