# Task: recovery mirror and workspace hygiene

Status: **complete**.

## Purpose

Establish a recoverable boundary before contributor-history cleanup and reduce the large collection
of stale Reverie Reads worktrees and clones without discarding unique work.

## Phase 1 — private recovery mirror

- Create `Gchism94/book-corpus-recovery` as a private, non-fork, uninitialized repository.
- Mirror every canonical remote branch, tag, ref, reachable object, and any genuine Git LFS object.
- Verify identical ref targets and that recovery `main` contains production commit
  `18f20af0fd276ca1ae2cd360f1d20ace91b1158f`.
- Keep Actions and Pages disabled; verify no unexpected collaborator, deploy key, webhook,
  environment, or integration.
- Copy no untracked files, credentials, environment files, build output, or database exports.

Completed. `Gchism94/book-corpus-recovery` is private and independently verified. Every commit
reachable from the remaining review worktrees is recoverable there, including the detached series
and calendar baselines. Protected ignored files were deliberately excluded.

## Phase 2 — read-only workspace audit

- Inventory every worktree registered to `book-corpus`, wherever it lives.
- Inspect app-related directories directly under `/Users/gregchism/dev` whose names begin with
  `book-corpus`, `rv-`, or `reverie-`; explicitly exclude `/Users/gregchism/dev/reverie`.
- For each item record repository identity, branch/HEAD, dirty/staged/untracked/ignored counts,
  upstream state, unique commits, recovery reachability, approximate size, and stale/broken
  registration state.
- Classify each as Keep, Safe pruning candidate, Needs preservation, Needs investigation, or Stale
  registration only.

Completed twice: the initial inventory before pruning, then a post-prune review on 2026-08-25.
The first owner-approved execution removed 12 clean worktrees, three stale registrations, and one
temporary audit directory. The saved Codex project points to `/Users/gregchism/dev/book-corpus`.
`/Users/gregchism/dev/rv-calendar` was one of the removed worktrees; any later `ENOENT` for that path
is a stale workspace-root reference and must not be repaired by recreating the directory.

## Post-prune review and second-set execution

| Path                                       | Decision                           | Evidence and required handling                                                                                                                                                                                                                                  |
| ------------------------------------------ | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/Users/gregchism/dev/book-corpus`         | Kept and realigned                 | Its stale local `main` belonged to the pre-cleanup history and had no merge base with rewritten canonical history; the exact old ref is preserved privately. Local `main` now tracks and exactly matches `origin/main` without merging the unrelated histories. |
| `book-corpus-prioritized-roadmap` worktree | Keep until integrated              | Five documentation commits are ahead of `origin/main` and preserved by exact private-recovery refs. The checkout location is operational only; the artifacts are the committed files in this repository.                                                        |
| `book-corpus-household-hardening-log`      | Removed in second safe set         | Was clean; its head is contained in production `main` and the reviewed household range is preserved.                                                                                                                                                            |
| `book-corpus-series-overhaul`              | Removed in second safe set         | Was clean; its head is contained in production `main` and has an exact private-recovery ref. It was a historical implementation worktree, not the queued series-overhaul task.                                                                                  |
| `reverie-works-isbns`                      | Removed in second safe set         | Was clean; its exact head is preserved privately and the reviewed feature is integrated.                                                                                                                                                                        |
| `.worktrees/series-consolidation`          | Removed in second safe set         | Was clean, detached, and stale-locked as `initializing`. Its head is not in current `main`, but it is reachable from multiple exact recovery refs. It was unlocked immediately before removal.                                                                  |
| `reverie-calendar-scope`                   | Removed in second safe set         | Its only untracked file was an older copy of `docs/tasks/task-calendar-cluster-scope.md`; `main` has the corrected `AGENTS.md` reference and non-stale backlog wording. The detached head is recovery-reachable.                                                |
| `rv-cal-main`                              | Removed in second safe set         | Its only untracked browser-audit source file was byte-identical to the file already on `main`. The detached head is recovery-reachable.                                                                                                                         |
| `reverie-layout-sweep`                     | Removed after private preservation | Its distinct ignored `apps/web/.env.local` was moved without inspection to the owner-only local backup, then the clean tracked worktree was removed. Its exact head remains in private recovery.                                                                |
| `reverie-star-targets`                     | Removed after private preservation | Same preservation and removal boundary as `reverie-layout-sweep`.                                                                                                                                                                                               |
| `reverie-withheld-click`                   | Removed after private preservation | Same preservation and removal boundary as `reverie-layout-sweep`.                                                                                                                                                                                               |
| Canonical `_to_delete/`                    | Moved to Trash in second safe set  | Contained only staged stale zero-byte Git locks, abandoned rebase metadata, and a scratch genre patch script whose intended behavior is already present on `main`. It remains recoverable in the 2026-08-25 Reverie safe-prune Trash batch.                     |

The owner-approved second safe set removed the five redundant review worktrees named above and the
nested series worktree, then pruned the registrations. Canonical `_to_delete/` moved to Trash. The
post-run audit confirmed that all seven paths are absent, all retained worktrees are clean, all
removed branch refs remain available, the three distinct protected files remain untouched, and Git
connectivity succeeds. No garbage collection was run.

The final owner-approved pass moved the three distinct environment files without reading them to
`/Users/gregchism/.codex/private-backups/reverie-reads/env-2026-08-26/`, with directory mode `700`
and file mode `600`, then removed their worktrees. The final registry contains only canonical
`book-corpus` and this roadmap worktree. Canonical `main` exactly matches production
`18f20af0fd276ca1ae2cd360f1d20ace91b1158f` and tracks `origin/main`.

## Completion gate

Phase 1, both read-only audits, both safe pruning sets, protected-file preservation, registration
cleanup, and canonical realignment are complete. Integrate this roadmap branch through its normal
reviewed PR; no further workspace mutation is required before product work.

No production data, deployment, migration, contributor rewrite, or CSV reconciliation is in scope.
