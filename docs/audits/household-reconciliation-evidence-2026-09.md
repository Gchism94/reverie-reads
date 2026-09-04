# Household reconciliation evidence — 2026-09

## Decision

The owner accepted the current production household outcome on 2026-09-04 and directed the roadmap
to move forward. This closes reconciliation as an active product/release blocker. It does **not**
retroactively turn an incomplete dry run into proof of a checksum-bound production write.

No title-level library data, account UUIDs, provider credentials, or production secrets belong in
this report.

## Durable evidence available

The retained source CSV has 1,166 data rows. Its SHA-256 is:

```text
4d54d2e38126b073521162d73ca0e633834c0922f9a76f41f038567989639847
```

The retained 2026-08-30 dry-run detail has SHA-256:

```text
6e7ff9c8453763daf896f8f64f221e5fbdc12b0c34050a09c46589029aca2ad4
```

That report recorded:

- two expected household accounts and two household roster rows;
- 1,106 CSV rows after duplicate handling, including 57 explicitly dropped duplicates and three
  collapsed exact rows;
- 1,096 resolved identities, 10 unmatched identities, and zero conflicting corpus matches;
- proposed personal changes of 155 creates, zero restores, 1,253 archives, and 83 unchanged rows;
- proposed household changes of two creates, zero restores, 203 archives, and 1,094 unchanged rows;
- `canWrite = false`.

The report is useful evidence of the planned transformation and its refusal boundary. Because it
was not writable, it is not evidence that those proposed changes were applied.

## Current production observation

An authenticated Chrome check on 2026-09-04 reached the live private production build
`edd1ccbd7fa7`. The Household view rendered the expected two-member household, a populated shared
library, entries attributed to each reader, entries attributed to both, and household-only entries.
The permission allowing a household peer to add a neutral book to the other reader's personal
library was enabled.

This confirms that the shipped household projection is populated and that the two-reader scope and
cross-reader presentation are active. The screen's visible header count and its paged accessibility
state did not expose the same total, so neither was promoted into this report as an exact
reconciliation count.

## Evidence not found

The expected operator artifacts were not present in the retained reconciliation directories:

- an approved, writable dry-run detail;
- a transaction-consistent `prechange-backup-*.json` and its approved checksum;
- `postchange-verification.json` from a successful checksum-bound write.

A fresh read-only operator run was not possible from the local shell because the production service
environment was not installed there. No production database write was attempted.

## Closure classification

Roadmap state is **owner-accepted operational closure, formal operator proof incomplete**. Current
production household behavior may be used and product work may continue. Do not claim that the
historical CSV plan was applied exactly, or that rollback/post-write checks passed, unless a future
owner-run reconciliation produces and retains the three missing artifact classes above.
