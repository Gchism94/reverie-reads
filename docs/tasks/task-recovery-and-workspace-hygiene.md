# Task: recovery mirror and workspace hygiene

Status: **in progress; audit and backup only until the owner approves a pruning set**.

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

## Phase 2 — read-only workspace audit

- Inventory every worktree registered to `book-corpus`, wherever it lives.
- Inspect app-related directories directly under `/Users/gregchism/dev` whose names begin with
  `book-corpus`, `rv-`, or `reverie-`; explicitly exclude `/Users/gregchism/dev/reverie`.
- For each item record repository identity, branch/HEAD, dirty/staged/untracked/ignored counts,
  upstream state, unique commits, recovery reachability, approximate size, and stale/broken
  registration state.
- Classify each as Keep, Safe pruning candidate, Needs preservation, Needs investigation, or Stale
  registration only.

## Completion gate

Phase 1 is complete only after the private mirror is independently verified. Phase 2 is complete
only when the report names the exact proposed pruning set and proves every candidate recoverable.
Nothing is deleted, moved, or pruned in this task. A later owner-approved task executes the reviewed
set and audits the result.

No production data, deployment, migration, contributor rewrite, or CSV reconciliation is in scope.
