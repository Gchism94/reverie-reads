import { useEffect } from 'react'
import { createRoute, useNavigate } from '@tanstack/react-router'
import { rootRoute } from './RootRoute'

/** Post-auth seam STUB. New readers are meant to land here for onboarding (built next chunk); for
 *  now it forwards to the library, so the route + the post-auth redirect target already exist and the
 *  sign-up → first-run flow is wired end-to-end. Replace the body with the real onboarding. */
function OnboardingStub() {
  const navigate = useNavigate()
  useEffect(() => {
    void navigate({ to: '/library', replace: true })
  }, [navigate])
  return (
    <div className="relative z-[1] flex min-h-dvh items-center justify-center text-muted">
      Setting up your library…
    </div>
  )
}

export const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'onboarding',
  component: OnboardingStub,
})
