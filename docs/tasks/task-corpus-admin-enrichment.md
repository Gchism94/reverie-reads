# Task: corpus-administrator enrichment and durable corpus metadata

Status: **PR #367 and owner deployment stop at `20260902010000` plus the updated `covers`
function; production web stayed held. The local branch stacks corrected `20260903010000` behavior
and the forward-only `20260904010000` release-gate repair. Fresh review of the first correction
found a stale exact-cover approval race, authenticated accepted-option retraction, six incomplete
table ACLs, dead cache invalidation, and a fail-open review-status error state. The current repair
binds review to the locked work and URL, preserves accepted options across authenticated edits,
resets the table ACLs, invalidates every real consumer, and disables the switch when status is
unknown. Independent re-review found no remaining issue. Integration, owner deployment, the
71-row report, and final web smoke remain required. Production has not received either local
migration.**

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
- removes the database password from `psql` argv, supplies it only through a minimal child
  environment, and excludes the original URL, libpq routing/TLS overrides, and unrelated secrets.

The deterministic harness exercises both owner-fence orders: an earlier insert commits and makes
reconciliation reject its stale fingerprint, while an insert begun after final revalidation is
proven blocked until reconciliation commits. Unit/source-contract coverage verifies encoded and
query passwords, multi-host URI preservation, the snapshot count baseline, and secret-free argv.

## Combined migration blocker closure — 2026-08-27

The independently reviewed combined tree now closes all three pre-integration blockers:

- the bounded legacy backfill creates a per-book reconciliation work when an identity has neither a
  unique ISBN target nor a unique fallback target. Unique ISBN remains first priority,
  reconciliation second, and unique fallback third;
- the exact mixed-ISBN/fallback failure has a deterministic executable fixture: two personal rows
  share title/full-author, the selected candidate's ISBN points to a differently keyed corpus work,
  and the unmatched sibling safely receives its own reconciliation work;
- the source regression now rejects any extra `public.works` scan in classification, including the
  reviewer's differently spelled correlated lateral aggregate mutation. A separate bounded fixture
  applies both migrations to 25,005 initial works and 5,012 personal books under a 20-second
  per-statement PostgreSQL timeout.

The scale fixture bound all 5,012 books, preserved the unique ISBN/fallback and ambiguous-refusal
paths, retained `updated_at`/`enriched_at`, dropped every temporary identity table at commit,
restored both temporarily disabled book triggers, installed both corpus-binding triggers, and found
the shared insert and exclusive reconciliation owner fences in their final function definitions.
Pre-integration browser CI then caught that service-managed corpus inserts could not evaluate the
`works_library_work_key_idx` expression after direct helper execution was revoked. The final grant
allows only `service_role` to execute that immutable identity helper; anonymous and authenticated
roles remain denied, and an exact service-role corpus insert now succeeds.
The clean-schema pgTAP suite passed 638 assertions across 27 files; the complete unit suites passed
2,417 core and 625 web assertions. TypeScript, ESLint, Prettier, production build, and
`git diff --check` passed. The browser matrices remain an integration gate because the combined
migration changes service-managed corpus seeding behavior.

## Reconciliation coupling

The private owner CSV is interpreted only by the gitignored operator. Exact normalized title and
full-author matching is required because the file has no ISBN column. Ambiguity or an unmatched row
blocks the atomic write. Dry-run and backup artifacts must live outside the repository with mode
`0600` files inside a mode `0700` directory. Write mode also requires `SUPABASE_DB_URL`: the
service-role HTTP client still performs the narrow RPC, but the rollback artifact and its mutation
fence are captured over one read-only database snapshot. The password is removed from the `psql`
argument and supplied through a minimal child environment that excludes the original URL, ambient
libpq overrides, and unrelated secrets. The operator verifies that the reviewed household roster
contains exactly Account A and Account B before either dry-run or write planning.

## Required rollout order

1. **Complete:** independent review closed and PR #364 integrated the real-merge history to `main`.
2. **Complete:** the owner deployed all three migrations through the guard; the production report
   returned all 43 rows true.
3. **Complete for the exercised personal-cover path:** the owner deployed the covers function and
   confirmed the selected cover survives refresh. The corpus-admin positive path remains part of
   the later administrator smoke set.
4. **Complete through the held web gate:** PR #367 integrated; the owner deployed
   `20260902010000`; all 51 report rows passed; and the updated `covers` function deployed. Pre-web
   smoke correctly kept production web held after exposing the personal-cover projection gap.
5. Independently review and integrate `20260903010000`. The owner deploys it through the migration
   guard and requires all 55 expanded report rows true. Deploy the web surface last, then verify
   Household-only Add creates no personal copy, trusted eligible personal covers display in
   Household, the administrator switch starts off, explicit review adds the option without
   replacing an existing default, and the first reviewed option fills a missing default.
6. Resolve the 10 aggregate missing-corpus dry-run rows through Household Add books, then dry-run
   both administrator grants and the CSV reconciliation again. Run the reconciliation's separate
   backup-only phase and review the exact external title-level report and backup checksums; do not
   approve from aggregate counts alone.
7. The owner executes both production writes and completes Account A, Account B, household-only,
   corpus-only, removal, cover-completion, and trope-promotion smoke checks.

## Household catalog remediation verification — 2026-08-28

The independently reviewed candidate closes every finding from the review passes: global
corpus administrators can edit unrelated works through the audited writer; ISBN-10/13 checksums are
validated and nonblank inputs containing characters beyond digits, spaces, hyphens, or a checksum
`X` are refused; profile-first locking removes the add/unlink inversion; shared series adoption retires
the prior structured entry atomically and overwrites a stale pre-existing target series length;
owner corpus edits prelock every active personal copy before household membership, matching the
cross-member administrator trope-trigger lock order; persistent desktop/mobile Add controls preserve
household scope; Google
preview covers are preserved directly, owner/admin Hardcover previews are made durable through the
corpus cover pipeline, and the shared editor can select reviewed cover options; the editor covers
canonical genre, subgenre, complete series metadata, and publication precision; and shared-detail
comparison includes series length and status. Browser assertions now prove the post-write UI and
ordinary-member editor denial, not merely service-role reads behind the page.

- A clean database rebuild applied through `20260902010000`; the expanded read-only rollout report
  returned 51/51 true.
- Full pgTAP passed 722 assertions across 29 files. The deterministic concurrency harness passed all
  22 scenarios, including the worker-first add/unlink race, concurrent same-ISBN household adds,
  the owner-edit/personal-tag lock-order regression, and the exact cross-member administrator trope
  topology against both metadata and cover edits.
- The bounded 25,005-work/5,012-book fixture completed both foundation migrations under the
  20-second statement timeout, bound all 5,012 personal books, and retained the exact mixed-ISBN
  reconciliation refusal.
- Core unit tests passed 2,432 assertions across 81 files; web unit tests passed 645 assertions
  across 74 files.
- The complete household browser spec passed 11 cases with one expected project skip. The full
  browser matrix passed 220 cases with 10 expected project-specific skips, one worker, and zero
  retries.
- TypeScript, ESLint, Prettier, the production build, and `git diff --check` passed. ESLint emitted
  no warning after the shared scope helper was separated from the component module.

### Superseded first personal-cover candidate verification — 2026-08-28

- A second clean rebuild applied every migration through `20260903010000`; the focused cover-scope
  pgTAP passed 17/17 and the full suite passed 739 assertions across 30 files.
- The expanded local rollout report returned 55/55 true, and all 22 deterministic concurrency
  scenarios remained green.
- Core/web unit suites passed 2,435 + 647 assertions. The household browser spec passed 11 cases
  with one expected mobile-project skip, including the rendered personal-cover fallback and the
  household-only Add path.
- TypeScript, ESLint, Prettier, production build, and `git diff --check` passed. That first candidate
  defined a trigger and read projection only and performed no automatic cover backfill. Independent
  review later rejected the trigger design for the three blockers below; these results are retained
  as implementation history, not release approval.

No production data, credentials, migration, function, web deployment, or remote repository state
was touched. Integration remains the next gate.

### Three-blocker remediation — 2026-08-28

The first cover-scope candidate did not pass independent review. Its automatic book trigger could
publish an enrichment-selected administrator cover with no review gesture, projected arbitrary
member-controlled URLs into a peer browser, and took book → administrator locks opposite the
administrator corpus editor. The corrected candidate replaces that trigger with the explicit
`admin_review_personal_cover_for_corpus` RPC and personal-book switch. The RPC is restricted to an
authenticated corpus administrator's own active book, accepts only the established hosted/Google
cover boundary, remains additive/fill-only/audited, and uses profile → administrator → book → work
locks. Household peers receive only hosted or exactly allowlisted Google URLs; a reader may still
see their own personal fallback.

Local verification of this correction is recorded before re-review; no production or remote state
was changed. The candidate is not deployable until the refreshed independent review passes.

- Two clean database rebuilds applied every migration through `20260903010000`. The focused
  correction pgTAP passed 27/27; the full suite passed 749 assertions across 30 files; and all 55
  read-only rollout invariants returned true.
- The deterministic concurrency harness passed 23/23 scenarios. Its new two-session fixture holds
  the personal-book row while an administrator corpus edit waits, then proves both commits complete
  with no `40P01`; the old book-trigger design deadlocked in that topology.
- The bounded 25,005-work/5,012-book fixture passed its 20-second per-statement timeout, bound all
  personal books, and preserved the exact mixed-ISBN reconciliation refusal.
- Core/web unit suites passed 2,435 + 653 assertions. The focused household browser run passed 8/8
  desktop and 7/7 mobile with one expected project skip, including the off → reviewed switch and a
  zero-request assertion for an arbitrary peer hotlink.
- TypeScript, ESLint, Prettier, production build, and `git diff --check` passed. No production data,
  credentials, deployments, or remote repository state were touched.

### Fresh release review and forward correction — 2026-08-29

The next independent review accepted the original peer-cover and lock-order corrections but found
five remaining release gates. The UUID-only review RPC approved whichever cover was current when it
finally locked the book; the shared editor could replace `cover_options` with a stale snapshot and
retract a newly accepted option; review success invalidated an unused `['works']` cache namespace;
six household tables had never reset legacy platform grants; and a failed review-state query showed
an actionable “off” switch.

`20260904010000` is a forward-only repair because neither the already-deployed
`20260902010000` nor either `20260903010000` candidate may be rewritten. It revokes the UUID-only
review signature, exposes an exact `(book, expected work, expected cover URL)` replacement, and
rechecks both expected values after the established profile → administrator → book lock sequence.
An authenticated works trigger preserves every accepted option URL omitted by a stale writer while
still allowing validated additions, same-URL provenance refreshes, and complete-set reordering;
service-role maintenance remains the explicit governance escape hatch. The same migration resets
PUBLIC, anon, authenticated, and service-role table grants before restoring authenticated SELECT
only on household roster tables and service-role ALL on all six implementation tables.

Verification completed before the final re-review:

- a clean rebuild applied every migration through `20260904010000`; full pgTAP passed 827
  assertions across 31 files, including a 72-operation dirty-ACL fixture and 33 cover-scope
  assertions;
- both original rollback-only proof scripts now stop at the retired RPC privilege boundary, while
  the replacement regression refuses stale work/URL context and preserves a reviewed option from
  the exact stale editor call;
- the deterministic concurrency harness passed 25 scenarios, including a queued review that waits
  for a concurrent personal-cover update and then refuses the stale browser context, plus a
  competing ISBN identity claim that must win before review can publish;
- the bounded 25,005-work/5,012-book migration fixture passed its 20-second per-statement timeout,
  bound all 5,012 books, and retained the mixed-ISBN reconciliation refusal;
- the owner-run local report returned 71/71 true; core and web unit suites passed 2,438 and 656
  assertions; TypeScript, ESLint, Prettier, production build, and `git diff --check` passed;
- the full Playwright matrix ran with one worker and zero retries: 224 passed and 10 expected
  project-specific cases skipped, including desktop and mobile household-only add, personal
  adoption, hostile peer-cover withholding, and explicit administrator review flows;
- a fresh independent bypass review of the final candidate found no remaining issue.

No production data or credentials were accessed, and no migration, function, web, remote branch,
or pull-request state was changed. The owner-run deployment and smoke sequence remains blocked on
review, integration, and an in-sync clean `main`.

## Post-rollout operator correction — 2026-08-29

Production proved that the structural rollout report could return 71/71 while the service-managed
`corpus_admins` table was empty. The report now carries a separate runtime-assignment row and cannot
be called a rollout pass until at least one administrator grant exists. The grant operator reads the
complete roster and supports `--require-exact`; it refuses unexpected grants rather than silently
revoking another account.

The Settings action also used the ordinary corpus-enrichment candidate count as its enablement gate.
That proxy could be zero while the signed-in administrator still had exact personal covers missing
from otherwise complete corpus works, so the owner-scoped recovery RPC never ran. **Complete shared
corpus covers & info** now remains actionable for a corpus administrator, always runs personal-cover
recovery first, refetches the resulting corpus candidates, and only then starts ordinary enrichment.
The first correction retained the same signed-in-profile boundary. Production smoke testing then
showed why that boundary was incomplete: the designated administrator had no personal books, while
the household library's 1,000 covers belonged to the other active member.

## Household-cover follow-up — 2026-08-29

`20260905010000` adds an exact household review boundary that binds the administrator gesture to
the displayed household, personal copy, corpus work, and cover URL. It accepts only an active owned
copy or exact live borrowed share from an active member of the caller's household, retains the
hosted/Google ingestion allowlist and unambiguous identity checks, fills only a missing default,
adds the reviewed option without replacement, and records the administrator in the corpus edit
audit. The existing completion RPC name remains stable, but its preflight now includes these safe
active household-peer covers; it still exposes neither unrelated households nor arbitrary cover
hotlinks.

The web follow-up renders the same fail-closed one-way review control beside each eligible household
copy. Shared metadata editing moves out of the narrow desktop detail rail into a responsive dialog,
and personal/household cover grids share a larger row gap and a consistent metadata baseline.
Production database deployment and authenticated write smoke tests remain owner-run operations.

### Household-cover follow-up verification — 2026-08-29

- The focused corpus-cover pgTAP contract passed all 45 assertions, including the exact-context
  household review, missing-default promotion, additive option behavior, audit row, unrelated-
  household refusal, and peer-cover bulk recovery for an administrator with no personal books.
- Core/web unit suites passed 2,440 + 663 assertions; TypeScript, ESLint, the production build, and
  `git diff --check` also passed.
- The authenticated household browser flow passed 17 desktop/mobile cases with one expected skip.
  Chrome inspection at 1440px and 390px confirmed the shared editor opens in the native top layer,
  remains usable over the mobile detail drawer, has no horizontal overflow, and preserves the
  revised cover-card baselines and row rhythm in personal and household libraries.
- A full pgTAP attempt was not accepted as clean evidence because the existing local stack contained
  unrelated browser fixtures, including a retained ISBN-owning work. The focused transaction rolled
  back cleanly; no destructive database reset was used to manufacture a full-suite result.

## Local verification — refreshed 2026-08-28

- Clean database rebuild applied every migration through `20260831010000`.
- Full pgTAP: 27 files and 638 assertions passed. The focused corpus administration, cover recovery,
  host validation, account-cascade, snapshot-fence, and complete-roster contract passed all 68
  assertions after the clean rebuild.
- Core/web unit suites: 81 + 71 files and 2,426 + 626 assertions passed.
- The deterministic 17-scenario multi-session database harness passed reconciliation edit, earlier
  insert, post-revalidation insert, and complete-roster races, along with the existing
  authorization, ISBN, and final-unlink cases.
- A disposable two-account CSV exercise ran the real three-phase operator end to end. It created a
  deterministic dry run, captured and independently checksum-verified a direct read-only snapshot,
  accepted only those exact two approvals for write, converged to a zero-change post-check, and then
  refused a stale approved backup before the RPC. The mode-`0700`/`0600` fixtures and artifacts were
  moved to Trash afterward.
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

### Forward ACL correction — 2026-08-28

- Fresh reset applied `20260901010000` after the two already-deployed migrations.
- The focused ACL pgTAP deliberately granted all four checked operations through the legacy
  production exposure shape, re-applied the idempotent repair, and passed all 12 role/operation
  assertions.
- Full pgTAP passed 650 assertions across 28 files. The expanded owner-run report returned 43/43
  invariants true and printed each `work_tropes` role's `SELECT`/`INSERT`/`UPDATE`/`DELETE` state.
- The migration source contract passed and requires the exact four-role reset followed by only
  authenticated `SELECT` and service-role `ALL`. Independent review and owner deployment remain
  mandatory; Code did neither.

## Completion gate

- Clean local reset and full pgTAP suite pass.
- Core/web unit suites, typecheck, lint, formatting, build, and the complete browser matrix pass.
- Edge-function corpus cover authorization and path isolation are reviewed and exercised.
- An independent diff review finds no correctness, privacy, authorization, deadlock, or data-loss
  issue.
- Owner-run dry-runs are exact, backups are restorable, production writes match the approved plan,
  and post-write counts prove corpus works were neither removed nor silently reassigned.
