# Backlog task: retire Claude/vendor tooling and contributor metadata

Priority: **P0 immediately after the private recovery mirror is verified**.

The private recovery repository is the deliberate exception to the removal goal: it preserves the
pre-cleanup history for disaster recovery, remains private, and has Actions/Pages/integrations
disabled. The canonical repository and its ordinary GitHub surfaces should no longer attribute,
configure, authorize, invoke, or advertise Claude/vendor tooling when this task completes.

## Audit boundary

- Review the existing `codex/chore-retire-vendor-tooling` branch against current `origin/main`.
- Inventory GitHub Apps/OAuth authorization, collaborators, deploy keys, webhooks, Actions, bots,
  workflow files, configuration, prompts/instructions, badges, comments, commit authors/committers,
  co-author trailers, tags, releases, branches, and generated artifacts that create contributor or
  tooling attribution.
- Treat the Contributor License Agreement (`cla`) check separately; its name is not evidence that it
  belongs to Claude.
- Include any owner-approved tracked private source-data removal in the same one-time history rewrite
  so collaborators pay the rewrite/re-clone cost once, not repeatedly.

## Safety and execution

Produce an exact before/after ref map, object-removal rules, affected commit count, required force
updates, branch-protection changes, open-PR impact, deployment risk, collaborator instructions, and
rollback procedure. Verify every source ref in the private recovery mirror before rewriting.

No rewrite begins while unpreserved worktrees, unique commits, open feature work, or an unverified
backup exists. Freeze canonical writes for the execution window. Rewrite in a fresh mirror, scan the
result, review it, then replace only the explicitly approved canonical refs. Never rewrite the
private recovery repository.

## Completion gate

Canonical refs pass attribution/configuration searches and a full secret/privacy scan; GitHub
integration and authorization state is verified; the application builds and its essential gate
passes at the rewritten `main`; production remains on a known commit until a separately reviewed
post-rewrite deployment; and recovery instructions can restore the old repository if necessary.
