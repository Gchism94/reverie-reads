# Follow-up — close the gate

Three tasks to finish before sign-off, plus two recorded deferrals. Do them as separate,
explicitly-scoped commits (no `git add -A`). Report pass/fail with evidence per item.

> Note: the "queued next: plan/implement ownership + reviews" line from the last report
> is **stale** — S1/S2/R1/R2/11 are already built and verified in section B. Do **not**
> re-plan them.

## Task 1 — Magnolia Dawn `--muted` contrast (AA, not polish)

- Darken `--muted` in the Magnolia Dawn theme until small text on `--bg0`/`--bg1` and on
  `--panel` clears **4.5:1** (WCAG AA for normal text). One-token change; keep it in the
  same magenta-leaning muted family.
- Re-check any other Dawn text tokens used at small sizes.
- **Done when:** axe-core (Task 2) reports no contrast violations in Magnolia Dawn, and a
  manual spot-check of muted captions/labels passes.

## Task 2 — Both-themes route smoke + axe scan (makes Regression D objective)

- Install Playwright browsers in this environment, then add an e2e smoke that, signed in
  as `dev@reverie.local`:
  - visits **every route** (Home, Library, Book detail, Shelves incl. the Owned·\* smart
    shelves, Planner, Stats, Match, Add, Settings, Club, SharedList) **in both Nocturne
    and Magnolia Dawn**;
  - runs an **axe-core** accessibility scan on each;
  - asserts **no serious/critical violations** (contrast, names/roles, focus order).
- **Done when:** the smoke passes in both themes with zero serious/critical axe issues,
  and is wired into `pnpm e2e`. Report the route list covered and any waived rule with a
  reason.

## Task 3 — Merge partial-failure safety (merge is destructive)

Bulk "merge all N groups" does many client writes and deletes + remaps list/club refs;
a mid-flight failure could orphan refs or lose data.

- Preferred: make merge an **atomic server-side RPC** (one transaction: fold child rows,
  remap memberships, delete losers).
- If staying client-orchestrated for now: make it **ordered (deletes last), idempotent,
  and re-runnable**, and surface a clear partial-failure state.
- **Add a test:** simulate failure mid-merge (kill network / fail one write) and assert
  **no orphaned list/club references and no lost reads/reviews/ratings**; re-running
  completes cleanly.
- **Done when:** the partial-failure test passes and a normal bulk merge still passes.

## Recorded deferrals (approved — note in commit messages)

- **CSV import as Edge Function:** deferred. Client version is complete and uses tested
  `core.importCsv`; no server-only need (no keys/rate-limits/shared cache; user's own
  file). Revisit only for very large or background imports.
- **Route-level code-splitting:** approved to ship as-is (vendor split done, 130 kB gz).
  _Optional quick win:_ lazy-load route components (React.lazy/Suspense or TanStack lazy
  routes) if it's a small, bounded change — mobile-first benefits. Skip if not quick.

## Gate

Close Step 8 / the build when Tasks 1–3 pass, Regression D is a real both-themes pass
(Task 2 + a brief human eyeball via `pnpm dev`), and `lint`/`typecheck`/`test`/`e2e`/
`build`/pgTAP are all green. List anything still deferred for explicit owner approval.
