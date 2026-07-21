# Contributing

Contributions are welcome from designated collaborators under the **training-fork grant**
in [`LICENSE`](LICENSE): you may fork, run, and modify the code locally for personal
learning and to prepare contributions back to this repository. The project is
**proprietary** — there is no redistribution, production deployment, or commercial use.

These are the house rules the project runs on. They are enforced, not aspirational.

## The golden rule

**Nothing merges until it has been eyeballed on the real, authenticated app** — signed in,
against real data flows. Never sign off from the `/lab` specimen screens; those exist to
build components in isolation, not to prove a feature works in context.

## Workflow

- **Branches:** cut from an up-to-date `main`. Name by intent — `feat/…`, `fix/…`,
  `chore/…`, `docs/…`.
- **One concern per PR.** Keep the diff reviewable; split unrelated changes.
- **Explicit-merge authorization.** A PR is merged only on the owner's **explicit word**
  ("merge 42") — never on implied approval or because checks are green. Do not self-merge
  on inferred consent.

## The gate a PR must pass

- `pnpm build` green — **including `tsc`** (type errors fail the build, not just lint).
- `pnpm test` — the full unit suite.
- `pnpm lint` — ESLint clean.
- `pnpm e2e` — Playwright, **including the all-skins `axe` accessibility sweep**.

## Accessibility & skins (part of "done")

- **No hardcoded colors.** Every color comes from the design tokens so both modes and all
  nine skins stay correct.
- The **registry-keyed contrast test must pass across all nine skins** (every text-on-
  surface pair clears WCAG AA in each skin × mode). A new skin without a fixture row fails
  loudly — that's intended.
- Respect `prefers-reduced-motion`; keyboard focus stays visible.

## Deploy discipline

- Migrations and edge-function deploys run **from `main`, after the PR merges**, through
  the guard scripts (`pnpm deploy:migrations` / `pnpm deploy:functions`) — **never from a
  feature branch mid-flight**. The guard's `--force` override is for a deliberate,
  confirmed exception only. Full runbook: [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Shell safety

- **Heredocs containing shell examples must be single-quoted** — `<<'EOF'`, not `<<EOF` —
  so backticks and `$(…)` inside are text, never evaluated.
- **A deploy command must never appear as an unquoted literal** in a PR body, commit
  message, or report (an unquoted `` `supabase functions deploy …` `` inside a
  double-quoted string will execute). Write it fenced/inline in a single-quoted heredoc or
  a `--body-file`.

## Security

Do not open a public issue for a vulnerability — see [`SECURITY.md`](SECURITY.md).
