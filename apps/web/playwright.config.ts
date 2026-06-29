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

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
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
