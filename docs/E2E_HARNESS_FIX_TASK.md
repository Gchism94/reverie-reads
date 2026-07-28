# coding agent task — fix the e2e harness + reconcile the stale shell test (apps/web)

Context: pnpm e2e failed because Playwright's webServer.reuseExistingServer adopted a STRAY dev server on
the shared Vite port 5173 (a different local project, "Redmond Compass") instead of starting Reverie -> the
e2e tested the wrong app (no data-theme, no magic-link; identical fail on main + desktop-align). Confirmed:
lsof -i :5173 (foreign node, PID 21069) + the test DOM snapshot ("Welcome to Redmond Compass").

1. HARNESS -- make e2e impossible to hijack (apps/web/playwright.config.ts):
   - Pin a dedicated unusual port (e.g. 4317) for webServer + use.baseURL + webServer.url.
   - Add --strictPort to the webServer command (Vite fails loudly, never drifts).
   - reuseExistingServer: false (never adopt a foreign server).
   - Ensure command boots @reverie/web on that port with its local env.

2. ASSERTIONS -- reconcile shell.spec.ts with Reverie's ACTUAL signed-out page, from source (no run):
   - asserts <html data-theme=/nocturne|dawn/>: check what the theme provider really sets on <html>
     (convention is data-skin/data-mode, incl. the signed-out default) -> update assertion to match.
   - asserts a "magic link" button + Email: check the real signed-out auth UI. Auth design = password +
     Google/Apple -> if signed-out uses password, update; if genuinely magic-link, leave + note auth
     screens unbuilt.
   - skim a11y.spec.ts for the same staleness (suite has been dormant -- never executed in sandbox).

CONSTRAINTS: can't run e2e here (needs local Supabase + Chromium) -- change from source, do NOT claim the
suite passes; report changes + tell Greg to run pnpm e2e (and lsof -i :5173). Keep typecheck/lint/build
green; stage source only; docs untouched.

FOLLOW-UP (note, not now): wire e2e into CI with a Supabase service so it actually gates and can't silently
rot or point at the wrong app again.
