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
//   workers=1   3 runs, 3 green            mean 6.3m   ← default
//   workers=2   5 runs, 4 green            mean 5.7m
//   workers=3   1 run,  1 green                 5.2m
//   workers=4   3 runs, 0 green            (8, 8 and 3 failures)
//
// One is the default because parallelism buys almost nothing here and costs reliability. The a11y
// sweep alone is ~4.4m and is the wall-clock floor regardless of worker count, so serializing the
// entire rest of the suite costs only ~36s (~10%: 6.3m vs 5.7m) — and at workers=2 that ~10% bought
// a run that still failed one time in five. Going past 2 buys no speed at all while going red.
//
// The failure that survived workers=2 was NOT contention between arbitrary specs — it was a11y and
// cover-sheet, specifically, racing each other for the one seeded dev account they both sign in as:
// a11y holds one worker for the whole sweep while cover-sheet runs concurrently against the same
// rows. workers=1 dissolves that by serializing everything; it doesn't fix the underlying sharing.
// The real fix is the follow-up that migrates a11y/fonts/cover-sheet to per-file users, which is
// what would make raising this back above 1 worth doing — only re-raise it once that lands and five
// consecutive runs are green at the higher count.
const WORKERS = Number(process.env.E2E_WORKERS ?? 1)

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
