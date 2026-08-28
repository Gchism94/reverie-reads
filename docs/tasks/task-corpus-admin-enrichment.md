# Task: corpus-administrator enrichment and durable corpus metadata

Status: **implementation and local verification complete on
`codex/feat-corpus-admin-enrichment`; pending independent diff review and integration. No production
data or deployment has been changed.**

## Objective

Make the corpus the durable owner of every objective fact that can outlive a personal or household
library membership. Authorize a small, service-managed administrator set to complete missing corpus
metadata and accept canonical tropes without granting direct table writes from the browser.

## Implemented boundaries

- `corpus_admins` is service-managed and excluded from personal backup/restore.
- `complete_corpus_work_metadata` is authenticated-reachable but enforces the caller's administrator
  grant, accepts an exact field allowlist, fills gaps instead of replacing curated facts, rejects
  ISBN collisions, validates corpus-owned covers, and appends a before/after audit record.
- Personal soft deletion, merge hard deletion, and account cascade deletion first preserve all
  unambiguous objective gaps in the bound work, including ordered contributor roles and valid
  ISBN-10 conversion to canonical ISBN-13. Ratings, reading history, notes, ownership, wishlist,
  lists, moods, personal tags, and other reader state never cross that boundary.
- Shared covers are ingested to `w/{work}/{revision}`. Existing `u/{reader}/...` and upstream cover
  URLs are candidates for exact-artwork relocation; Google Books URLs remain display-only.
- `work_tropes` stores additive canonical work associations. Administrator additions from personal
  books, household enrichment, and the direct RPC converge on one internal promotion path. Scoped
  removal does not retract accepted corpus data.
- Ordinary readers cannot call direct promotion, and their household edits remain household-only.
  A future three-vote mechanism is an authorization source for the same promotion path, not part of
  this task.
- Personal trope promotion refuses another reader's private vocabulary row even if its UUID is
  supplied directly. A malformed personal `canonical_id` can resolve only to a true ownerless
  canonical row; it cannot place private vocabulary in the corpus.

## Cover recovery audit — 2026-08-27

The private Git recovery mirror was inspected across its archived local, branch, tag, and pull-ref
history. It correctly preserves code history, including the tracked 290-row reader seed with its
historical external cover references, but deliberately contains no database export or Storage
backup. The two archived source workbooks contain library identity/state but no cover column.

A read-only production audit found:

- 1,335 corpus works: 486 with covers and 849 without;
- 1,343 personal book rows: 1,291 with covers and 52 without;
- 797 coverless works with exactly one current personal-book cover candidate, plus one ambiguous
  multi-candidate work that must not be guessed;
- 789 coverless works with an enrichment-cache cover candidate;
- 2,767 cover objects, all under personal `u/` paths, with zero missing full-size or thumbnail
  objects among the currently referenced book covers;
- 45 full-size objects belonging to personal book UUIDs that no longer exist. Supabase reports no
  available physical backup and PITR is disabled, so those objects cannot be safely re-associated
  with a work from Storage paths alone. They are retained, not deleted or guessed.

This is primarily a corpus-promotion gap rather than lost image bytes. The administrator sweep now
runs an owner-scoped recovery preflight before external lookup: it promotes the administrator's
exact selected personal covers through the same validation used by removal preservation, refetches
the corpus, and relocates fragile `u/`/upstream references to durable `w/` objects before calling
metadata providers. Cover-only relocation leaves the enrichment clock unchanged, so rate limiting
cannot hide unfinished metadata work. Corpus-only works with no historical personal cover remain
ordinary missing-cover candidates; the app must source them rather than invent a recovery record.

## Independent-review corrections — 2026-08-27

The first exact-range review found four data-preservation and cover-boundary defects. The corrected
candidate now:

- preserves every account-owned book from a `BEFORE DELETE ON auth.users` trigger, while the full
  contributor graph still exists, before the independent profile/author/book cascades begin;
- parses Google cover URLs and accepts only the two observed exact Google Books image hosts, so a
  lookalike, userinfo trick, or path substring cannot become a shared corpus hotlink;
- revalidates the terminal URL after a followed cover redirect and rejects Google display-only
  bytes before reading the response body or writing personal/corpus Storage; and
- routes all five collective household rollback sections through the existing exact-count paging
  guard with declared primary-key total ordering, while preserving the artifact's established keys
  and row shapes.

Focused regressions cover account deletion with a secondary contributor, both SQL publication
paths, TypeScript and Edge URL classification, terminal-response check ordering, and the complete
collective-backup registry.

A later security-focused review found four additional defects, followed by three bypasses in the
first correction. The final working candidate now also:

- refuses every reader-controlled server-fetch origin before DNS and keeps arbitrary pasted URLs
  usable as display-time hotlinks; only exact Open Library/Internet Archive, Hardcover asset, and
  configured project-cover origins can supply durable bytes, with every redirect rechecked;
- preserves missing secondary contributors additively by normalized name + role while keeping
  corpus order/spelling and idempotently renumbering positions;
- prelocks reviewed books, preserves the exact archive set before any household lock, revalidates
  that no account book appeared meanwhile, and includes deterministic existing-edit and
  concurrent-insert lock regressions; and
- detects rollback-page overlap by immutable declared primary-key tuples, never by mutable payload
  or owner attribution, while retaining exact-count and deterministic-order checks.

The required fresh read-only bypass review completed one cycle. Its confirmed findings were
corrected and re-exercised locally; the committed head still requires the normal exact-range
integration review.

The subsequent exact-range correctness review found two operator-integrity gaps. The corrected
candidate now also:

- creates every write-mode rollback artifact from one direct PostgreSQL `REPEATABLE READ`/`READ
ONLY` snapshot instead of independently paginated HTTP reads, while retaining the established
  artifact keys and row shapes; and
- records the complete sorted household roster plus deterministic full-row fingerprints for the
  reviewed account books and household-work memberships, then makes the mutation RPC reject a stale
  artifact or an omitted/concurrently added household member before changing any row.

Focused source-contract and pgTAP regressions cover the snapshot boundary, the complete-roster
requirement, stale fingerprints, and a deterministic in-flight household extension that must win
before reconciliation is refused.

The final exact-range review found three reconciliation/operator gaps. The corrected candidate now
also:

- places a shared transaction fence at the start of every personal-book insert and takes the
  exclusive form for both reviewed owners before reconciliation locks any book row, closing the
  late predicate-insert window without blocking unrelated readers;
- verifies that every corpus work in the authoritative snapshot still exists after the write,
  while recording count changes only as audit information, so an unrelated concurrent corpus
  addition cannot turn a successful write into a false verification failure; and
- removes the database password from `psql` argv, supplies it only through the child environment,
  and omits the original secret-bearing `SUPABASE_DB_URL` from that environment.

The deterministic harness exercises both owner-fence orders: an earlier insert commits and makes
reconciliation reject its stale fingerprint, while an insert begun after final revalidation is
proven blocked until reconciliation commits. Unit/source-contract coverage verifies encoded and
query passwords, multi-host URI preservation, the snapshot count baseline, and secret-free argv.

## Reconciliation coupling

The private owner CSV is interpreted only by the gitignored operator. Exact normalized title and
full-author matching is required because the file has no ISBN column. Ambiguity or an unmatched row
blocks the atomic write. Dry-run and backup artifacts must live outside the repository with mode
`0600` files inside a mode `0700` directory. Write mode also requires `SUPABASE_DB_URL`: the
service-role HTTP client still performs the narrow RPC, but the rollback artifact and its mutation
fence are captured over one read-only database snapshot. The password is removed from the `psql`
argument and the original connection URL is not inherited by that child process. The operator
verifies that the reviewed household roster contains exactly Account A and Account B before either
dry-run or write planning.

## Required rollout order

1. Integrate and deploy the bounded-backfill hotfix for migration `20260830010000`.
2. Apply `20260830010000` from clean synchronized `main` through the owner-confirmed deploy guard.
3. Independently review and integrate this feature branch.
4. Deploy the covers function and migration `20260831010000` from clean synchronized `main`; the
   owner personally answers the migration guard because the migration changes write behavior.
5. Dry-run both administrator grants and the CSV reconciliation. Review the exact external reports
   and backup checksums; do not approve from aggregate counts alone.
6. The owner executes both production writes and completes Account A, Account B, household-only,
   corpus-only, removal, cover-completion, and trope-promotion smoke checks.

## Local verification — 2026-08-27

- Clean database rebuild applied every migration through `20260831010000`.
- Full pgTAP: 27 files and 635 assertions passed. The focused corpus administration, cover recovery,
  host validation, account-cascade, snapshot-fence, and complete-roster contract passed all 68
  assertions after the clean rebuild.
- Core/web unit suites: 80 + 71 files and 2,412 + 625 assertions passed.
- The deterministic 17-scenario multi-session database harness passed reconciliation edit, earlier
  insert, post-revalidation insert, and complete-roster races, along with the existing
  authorization, ISBN, and final-unlink cases.
- A disposable two-account CSV exercise ran the real dry-run and write operator end to end. It
  created mode-`0700`/`0600` artifacts from the direct read-only snapshot, archived the one planned
  personal and household extra, preserved corpus count, and converged to a zero-change post-check;
  the local fixtures were then removed and the temporary artifacts moved to Trash.
- The real libpq option probe preserved `%20` in `options` and reported the configured `5s`
  statement timeout. A fresh read-only bypass review of the complete corrective patch found no
  remaining actionable finding after the URI and post-verification edge corrections.
- TypeScript, ESLint, Prettier, production build, and `git diff --check` passed. Schema lint added no
  finding; its two reports are the existing temporary-table analysis limitations in
  `backfill_series_from_titles` and `merge_series`.
- Browser matrix from a fresh database, one default worker, and zero retries: 218 cases passed and
  10 expected project-specific cases skipped. The first run exposed a test-only race after the
  shelf range scrubber's `End` key: the React selection changed before its deliberate smooth scroll
  settled, allowing Playwright's generic live locator to re-resolve to an interim book while it
  waited for stability. The regression now waits for the physical end position and activates the
  exact terminal book. The focused mobile case and both full-matrix copies passed; no product shelf
  code changed.
- The covers Edge Function's personal/corpus prefix separation, mixed-target refusal, trusted-origin
  gate, and service-managed admin lookup are guarded by source-contract tests. The real local Edge
  runtime also refused arbitrary and private targets before fetch, followed the legitimate Open
  Library → Internet Archive chain, and stored the resulting image. Temporary accounts, books, and
  objects were removed after the check.

## Completion gate

- Clean local reset and full pgTAP suite pass.
- Core/web unit suites, typecheck, lint, formatting, build, and the complete browser matrix pass.
- Edge-function corpus cover authorization and path isolation are reviewed and exercised.
- An independent diff review finds no correctness, privacy, authorization, deadlock, or data-loss
  issue.
- Owner-run dry-runs are exact, backups are restorable, production writes match the approved plan,
  and post-write counts prove corpus works were neither removed nor silently reassigned.
