---
description: Run the full verification gate and report the result honestly
---

Run every check, from the repo root, in order. Do not stop at the first failure — collect all of it.

1. `pnpm install --frozen-lockfile`
2. `pnpm build`
3. `pnpm lint`
4. `pnpm test` (core + web unit)
5. `cd apps/web && npx playwright test --reporter=list` (full e2e, default worker count —
   `E2E_WORKERS` is unset; the config's own default is 1)

Report a table: check, result, counts.

## Rules

- A pre-existing failure is still a failure. Verify against `main` before calling it pre-existing,
  and say you verified.
- Never re-run until green and report only the green run. If a test is flaky, say so, say how many
  runs you did, and characterise it — timing, shared fixture, ordering.
- If you fixed something to make the gate pass, that fix is part of the report.
