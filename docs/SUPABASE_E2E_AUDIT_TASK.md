# Audit task for Claude Code: local Supabase setup for e2e (2026-06-28)

GOAL: AUDIT + REPORT (don't change anything this pass -- propose fixes, await green-light). The desktop-align
merge is gated on the a11y axe sweep, which currently fails NOT on accessibility but on infrastructure:
page.goto ERR_CONNECTION_REFUSED at http://127.0.0.1:55321/auth/v1/verify?...&redirect_to=http://127.0.0.1:3000
during the magic-link signIn round-trip in e2e/a11y.spec.ts. shell.spec.ts (signed-out, no Supabase) PASSES.

CENTRAL QUESTION (resolve FIRST): is this repo configured for a LOCAL supabase stack used by e2e, or has it
only ever pointed at a REMOTE/hosted Supabase? The .env has carried a real (publishable) Supabase URL/key, so
the app may only have used remote -- in which case `supabase start` has nothing to start and 127.0.0.1:55321
never existed. The whole fix path forks on this.

REPORT each -- present / missing / misconfigured + recommended fix:

1. CLI + stack location: `supabase --version`; where `supabase/` lives (repo root vs apps/web); is config.toml
   present? Is Docker installed AND running (local stack needs it)?
2. config.toml API port: does it match the 55321 the app/test expect? (CLI default is 54321 -- confirm this
   repo sets 55321, and what sets it.)
3. config.toml auth: `site_url` + `additional_redirect_urls`. Magic link redirects to :3000 but e2e app now
   serves on :4317 (vite --port 4317 --strictPort). Is http://127.0.0.1:4317 allow-listed? Where does :3000
   originate -- config site_url, or the app's emailRedirectTo on signInWithOtp?
4. config.toml auth email: is OTP/email signup enabled, auto-confirm on for local, and what are the OTP/email
   RATE LIMITS (could a re-run trip them)?
5. Local email catcher: Inbucket/Mailpit enabled + which port? How does the e2e helper latestMagicLink(DEV_EMAIL)
   read the email (service/port/REST path)? Does it come up under `supabase start`?
6. Web app client config during e2e: which env/mode does `pnpm e2e` use, and what VITE_SUPABASE_URL / anon key
   does the app load -- local 55321 or a remote project? (This answers the central question.)
7. Test user: does DEV_EMAIL need to pre-exist (seed.sql) or does signInWithOtp create it? Is there a seed.sql,
   and does `supabase start` / `db reset` apply it?
8. Preflight/robustness: any Playwright globalSetup ensuring the stack is up? Report feasibility of (a) a
   preflight that fails fast with a clear "run supabase start" message (or starts it), and (b) replacing the
   brittle magic-link EMAIL round-trip with a directly-seeded session (admin token -> set auth storage) so the
   a11y sweep doesn't depend on Inbucket.

DELIVERABLE: a short present/missing/misconfigured report + the MINIMAL change set to get `pnpm e2e` to a real
AA verdict (incl. the redirect-port alignment). Propose diffs; DO NOT apply until reviewed. Read-only this pass.

## DECISION (Greg green-light, 2026-06-28): Option B + preflight

Audit resolved the central question: LOCAL stack, up + seeded (dev user, 289 books). Earlier ERR*CONNECTION*
REFUSED@55321 = stack-was-down snapshots. Current real blocker = item 3 (redirect allow-list): app passes
emailRedirectTo=window.location.origin (:4317), :4317 not allow-listed -> GoTrue falls back to site_url :3000
-> dead. The :4317 pin exposed it.
APPLY:

- Option B (seeded signInWithPassword session + token-hash; detectSessionInUrl consumes it). Drops Mailpit +
  redirect + rate-limit dependencies; runs now, no config restart. Matches the "seed a session not email
  round-trip" robustness direction already flagged.
- globalSetup PREFLIGHT: ping auth health -> "run pnpm db:start" if down; assert dev user/library (or run
  seed-dev.mjs) -> "run pnpm db:seed" if absent.
- ALSO: fix stale site_url :3000 -> :5173 (hygiene; latent local-dev footgun). SKIP allow-listing :4317 (B
  doesn't use the redirect).
- ALSO: sign in once in globalSetup + persist storageState (tests reuse one session; zeroes rate-limit
  exposure). Kill stray node PID 21069.
  NOT losing much: B skips the real magic-link round-trip (mostly GoTrue; shell.spec covers signed-out; auth
  changes when password+social lands). If the live magic-link path is ever wanted -> a SEPARATE dedicated auth
  e2e, not on the a11y sweep. DEV_PASSWORD = local throwaway only.
  NEXT: apply -> run AA sweep -> first real accessibility verdict -> if green, merge desktop-align.
