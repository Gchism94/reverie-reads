# Completed task: retire vendor tooling and contributor metadata

Status: **completed 2026-08-25 with historical pull-request preservation approved by the owner**.

The private recovery repository is the deliberate exception to the removal goal: it preserves the
pre-cleanup history for disaster recovery, remains private, and has Actions/Pages/integrations
disabled. The canonical repository and its ordinary GitHub surfaces no longer attribute,
configure, authorize, invoke, or advertise the retired vendor tooling.

## Audit boundary

- Review the existing `codex/chore-retire-vendor-tooling` branch against current `origin/main`.
- Inventory GitHub Apps/OAuth authorization, collaborators, deploy keys, webhooks, Actions, bots,
  workflow files, configuration, prompts/instructions, badges, comments, commit authors/committers,
  co-author trailers, tags, releases, branches, and generated artifacts that create contributor or
  tooling attribution.
- Treat the Contributor License Agreement (`cla`) check separately; its name is unrelated to the
  retired assistant and its workflow remains intentional.
- Include any owner-approved tracked private source-data removal in the same one-time history rewrite
  so collaborators pay the rewrite/re-clone cost once, not repeatedly.

## Completion record

- The private recovery repository is verified private, non-fork, owner-only, and integration-free.
  It preserves every source ref and all intentionally retained pre-cleanup objects.
- Canonical `origin/main` remains the released `18f20af0fd276ca1ae2cd360f1d20ace91b1158f`.
  Its 831 commits resolve to the owner's GitHub identity; the live contributor API returns only
  `Gchism94`.
- The current canonical tree and all seven ordinary remote branches contain zero retired-vendor
  paths, content, commit-message attribution, or co-author trailers.
- Repository collaborators contain only `Gchism94`; hooks, deploy keys, Actions secrets, and Actions
  variables are empty. The owner removed the GitHub App and revoked its separate OAuth authorization.
  Pull-request titles, bodies, issue comments, and review comments contain no remaining vendor
  attribution.
- The old `codex/chore-retire-vendor-tooling` branch is based on a pre-integration stack. Its intended
  tree cleanup is already present on `origin/main`; merging that branch would regress released ISBN
  and household work and is forbidden.
- GitHub retains read-only refs for 359 historical pull requests. Of these, 355 can reach old commit
  objects containing retired-vendor attribution. These refs cannot be force-updated. GitHub's purge
  support is limited to sensitive-data incidents and does not remove ordinary attribution metadata.
  On 2026-08-25 the owner explicitly chose to preserve the public PR history rather than delete and
  recreate the repository. This is an accepted historical record, not an active contributor,
  integration, configuration, or canonical ref.

No additional history rewrite, force-push, branch-protection change, deployment, repository
recreation, or production operation was required or performed during the closing audit.

## Completion gate

Complete. Canonical refs pass attribution and configuration searches; the contributor surface and
integration state are verified; production remains on its known released commit; recovery can
restore the prior repository; and the only residual is the owner-approved preservation of historical
pull-request refs described above.
