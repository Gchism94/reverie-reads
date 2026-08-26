# Task: recovery mirror and workspace hygiene

Status: **recovery complete; first safe pruning set complete; second reviewed set awaits owner
approval**.

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

## Post-prune review and proposed second set

| Path                                       | Decision                            | Evidence and required handling                                                                                                                                                                                                                                                           |
| ------------------------------------------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/Users/gregchism/dev/book-corpus`         | Keep and realign                    | This is the canonical project, but its clean checkout is still on the obsolete, recovery-archived `codex/chore-retire-vendor-tooling` branch. After the review worktrees are resolved, switch it to an up-to-date local `main` tracking `origin/main`; do not merge the obsolete branch. |
| `book-corpus-prioritized-roadmap` worktree | Keep until integrated               | Four documentation commits are ahead of `origin/main` and preserved by an exact private-recovery ref. The checkout location is operational only; the artifacts are the committed files in this repository.                                                                               |
| `book-corpus-household-hardening-log`      | Safe pruning candidate              | Clean; its head is contained in production `main` and the reviewed household range is preserved.                                                                                                                                                                                         |
| `book-corpus-series-overhaul`              | Safe pruning candidate              | Clean; its head is contained in production `main` and has an exact private-recovery ref. It is a historical implementation worktree, not the queued series-overhaul task.                                                                                                                |
| `reverie-works-isbns`                      | Safe pruning candidate              | Clean; exact head preserved privately and the reviewed feature is integrated.                                                                                                                                                                                                            |
| `.worktrees/series-consolidation`          | Safe pruning candidate after unlock | Clean, detached, and stale-locked as `initializing`. Its head is not in current `main`, but it is reachable from multiple exact recovery refs. Unlock only as part of the approved removal.                                                                                              |
| `reverie-calendar-scope`                   | Safe pruning candidate              | Its only untracked file is an older copy of `docs/tasks/task-calendar-cluster-scope.md`; `main` has the corrected `AGENTS.md` reference and non-stale backlog wording. Discard the untracked copy during removal. The detached head is recovery-reachable.                               |
| `rv-cal-main`                              | Safe pruning candidate              | Its only untracked browser-audit source file is byte-identical to the file already on `main`. The detached head is recovery-reachable.                                                                                                                                                   |
| `reverie-layout-sweep`                     | Needs protected-file decision       | Tracked state is clean and the exact head is preserved, but its ignored `apps/web/.env.local` differs from the canonical copy. Do not read, copy, or delete it without an explicit secrets-handling decision.                                                                            |
| `reverie-star-targets`                     | Needs protected-file decision       | Same protected-file boundary as `reverie-layout-sweep`.                                                                                                                                                                                                                                  |
| `reverie-withheld-click`                   | Needs protected-file decision       | Same protected-file boundary as `reverie-layout-sweep`.                                                                                                                                                                                                                                  |
| Canonical `_to_delete/`                    | Safe debris candidate               | Contains only staged stale zero-byte Git locks, abandoned rebase metadata, and a scratch genre patch script whose intended behavior is already present on `main`. Keep excluded from Git; move to Trash only with the approved second set.                                               |

Proposed second safe pruning set: the five redundant review worktrees named above, the nested series
worktree after unlocking it, and canonical `_to_delete/`. Do not include the three worktrees with
distinct protected configuration, the canonical checkout, or the roadmap worktree.

## Completion gate

Phase 1 and both read-only audits are complete. Execute the second proposed set only after explicit
owner approval, using normal Git worktree removal where possible and Trash for excluded debris.
Afterward, prune registrations, verify the retained worktrees, and realign the canonical checkout.

No production data, deployment, migration, contributor rewrite, or CSV reconciliation is in scope.
