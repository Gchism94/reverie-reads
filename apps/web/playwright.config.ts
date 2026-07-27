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
// Two is green, and costs nothing: the a11y sweep alone runs ~4.4 minutes and is the wall-clock
// floor, so a full run takes about as long at 2 workers as at 4. Above 2 this suite buys contention
// and no speed. Serialized (workers=1) it is also green but ~40% slower.
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
