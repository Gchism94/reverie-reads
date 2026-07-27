import { defineConfig, devices } from '@playwright/test'

// A dedicated, unusual port so the suite can never adopt a stray dev server (e.g. another local
// project squatting Vite's default 5173) and silently test the wrong app. Three guards:
//  - the pinned port below is shared by baseURL and webServer.url;
//  - `--strictPort` makes Vite abort loudly if 4317 is taken instead of drifting to the next free
//    port (which is how a foreign server slips in);
//  - `reuseExistingServer: false` means Playwright always boots its own Reverie server, never an
//    existing one — even in local runs.
const PORT = 4317
const BASE_URL = `http://localhost:${PORT}`

// Worker count is a CAPACITY setting, not a correctness one — hence an env var rather than a new
// hardcoded number, because a CI runner's capacity is not this machine's.
//
// It used to default to Playwright's own choice, which is half the cores: 4 on the 8-core box this
// suite is developed on. That saturated it. Four Chromiums plus axe plus the Vite dev server plus
// the Docker Supabase stack do not fit in 8 cores, and the suite failed nondeterministically for
// the whole of one development arc — measured at 8 failures per run across two runs, six of them
// overlapping, none of them attributable to one worker changing another's rows. The symptoms were
// saturation throughout: PostgREST answering `PGRST002 Could not query the database for the schema
// cache`, GoTrue returning empty sign-in failures, and ordinary round-trips missing 15–20s budgets.
//
// Measured on this box, fresh DB before every run, retries 0:
//
//   workers=1   3 runs, 3 green            mean 6.3m
//   workers=2   5 runs, 4 green            mean 5.7m   ← default
//   workers=3   1 run,  1 green                 5.2m
//   workers=4   3 runs, 0 green            (8, 8 and 3 failures)
//
// Two is the default because it is the cheapest setting that is mostly reliable, not because it is
// proven clean: one of its five runs still failed. Parallelism buys very little here — the a11y
// sweep alone is ~4.4m and is the wall-clock floor, so serializing the entire rest of the suite
// costs only ~10% (6.3m vs 5.7m), and going past 2 buys no speed at all while going red.
//
// The residual failure is NOT worker count. It is that a11y, fonts and cover-sheet still share the
// one seeded dev account, so the heaviest test runs concurrently with the heaviest sweep against
// the same rows. Migrating those three to per-file users is the follow-up that should actually
// close this; raise the worker count again only after it lands and five consecutive runs are green.
const WORKERS = Number(process.env.E2E_WORKERS ?? 2)

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: WORKERS,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    // `on-first-retry` was inert here: retries are 0, so there is never a first retry and every
    // failure was reported with no trace at all. Retries STAY 0 — this suite exists to measure
    // flake, not to absorb it — so the trace has to be kept on the first (only) attempt.
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Runs from this config's dir (apps/web), so `pnpm dev` boots @reverie/web with its own
    // .env.local. The port/strictPort flags override vite.config's default 5173 for e2e only —
    // the normal `pnpm dev` workflow keeps 5173.
    command: `pnpm dev --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
