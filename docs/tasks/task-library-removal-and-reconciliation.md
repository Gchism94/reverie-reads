# Task: corpus-preserving library removal and owner reconciliation

Status: **membership/removal foundation merged in PR #361 and its reviewed bounded-backfill plus
corpus-admin follow-up merged in PR #364 at `0bd76a5`. The owner reports guarded production
deployment applied `20260830010000` followed by `20260831010000`. The owner-run read-only report
then found unintended anonymous/authenticated table privileges on `work_tropes`; the forward-only
`20260901010000` ACL correction is locally verified but requires independent review and owner
deployment before the report can pass. Private checksum-bound dry run, transaction-consistent
backup approval, owner-executed reconciliation, and post-write smoke checks remain pending.**

## Production migration performance hotfix — 2026-08-26

The first owner-run deployment of `20260830010000_library_membership_foundation.sql` failed safely
and transactionally before its migration-history row was recorded. The public web deployment was
not promoted. Supabase's local CLI trace isolated the failure to the ambiguous reconciliation
backfill: it spent 19.906 seconds running per-book correlated counts over the complete `works`
table. The preceding missing-work backfill had already consumed 16.246 seconds with the same
repeated identity work. No lock, competing long-running query, or network failure was present.

The hotfix on `codex/fix-library-migration-performance` keeps the reviewed identity priority and
safe-refusal behavior unchanged while replacing the repeated scans:

- one non-unique expression index stores the immutable Unicode title/full-author fallback key;
- transaction-local ISBN, fallback-key, and personal-book identity snapshots are built once and
  reused by missing-work creation, ambiguity classification, and final binding;
- newly created provisional and reconciliation works are appended to those snapshots so counts
  remain equivalent to live-table counts;
- binding decisions are staged separately from the row update, and the internal link backfill does
  not rewrite reader-facing `updated_at` values or invalidate unchanged enrichment keys;
- a lightweight source-shape regression prevents the per-row corpus-count and binding subqueries
  from returning without adding another long-running CI lane.

Verification completed before review:

- clean local reset applied the modified migration and seed successfully;
- all 567 pgTAP assertions passed across 26 files;
- the core suite passed with the structural migration regression;
- a pre-migration synthetic scale fixture used 25,004 corpus works and 5,012 personal books under a
  20-second PostgreSQL statement timeout. The complete migration applied in 3.47 seconds, linked all
  5,012 books, created the two expected reconciliation works, recorded the migration version, and
  restored both temporarily suppressed `books` triggers.

This incident was closed by the reviewed combined history merged in PR #364. The owner reports that
the guarded production deployment subsequently applied `20260830010000` before `20260831010000`.
The web deployment remains staged until the owner-run read-only report verifies both migrations,
their RPCs and boundaries, and the covers function is separately verified.

## Corpus-admin and reconciliation checkpoint — 2026-08-27

Implemented, independently reviewed, and integrated through PR #364:

- service-managed corpus-administrator grants plus a dry-run-by-default owner operator;
- an audited, fill-only corpus completion path for contributors, series identity when known, pages,
  publication precision, publisher, language, description, ISBNs, genres, external edition/work
  identity, provenance, and confidence;
- corpus-owned cover objects under `w/{work}/{revision}`. Existing personal-object or upstream
  corpus covers are re-ingested without changing the selected artwork, so deleting a personal
  library row, account, or `u/{reader}/...` object cannot take the corpus cover with it. Google
  Books remains the explicit display-only exception and is never stored;
- last-chance fill-only preservation before personal soft removal, merge deletion, or account
  cascade deletion, including ordered contributor roles and valid ISBN-10 conversion to canonical
  ISBN-13. Reader state and private annotations never cross that boundary;
- additive canonical corpus tropes. A corpus administrator can add directly, or promote by adding
  in a personal or household library. Removing the personal/household assignment does not retract
  the accepted corpus association. Ordinary-reader household tropes remain household-only;
- a generic service-role-only atomic household-membership reconciliation RPC and a private
  CSV-specific dry-run/write operator. The ignored CSV currently contains 1,166 rows: 100 Account A
  markers, 175 Account B markers, 13 carrying both markers, 904 carrying neither, and 57 rows marked
  duplicate. No title-level output is committed;
- pre-write backups and dry-run reports are written only to an owner-selected directory outside the
  repository with owner-only permissions. Any unmatched or ambiguous normalized title/author match
  blocks all writes.

The later three-reader vote mechanism is deliberately not implemented here. It will decide when an
ordinary-reader proposal is authorized, then call the same additive corpus-trope promotion boundary
with `source_scope = 'vote'`. Vote evidence and thresholds need their own schema, abuse controls,
retraction/correction policy, and task review.

## Implementation checkpoint — 2026-08-26

Completed in the feature branch:

- stable `books.corpus_work_id` links that ordinary owner updates cannot mutate, with server-owned
  rebinding constrained to one unambiguous ISBN or Unicode-preserving title/full-author identity;
  unmatched rows create attributable provisional works and ambiguous fallbacks create explicit
  reconciliation works instead of selecting a UUID by sort order;
- first-class `household_works`, per-person borrowed-share sources, and a household enrichment
  overlay;
- owned auto-inclusion, borrowed opt-in/opt-out, wishlist exclusion, and one work-level household
  card with active-copy attribution;
- soft personal removal that preserves reads, lists, corpus identity, household membership, and
  household enrichment;
- independent household removal that preserves personal rows and corpus data and refuses removal
  while an active owned copy requires membership;
- corpus synchronization for genre, subgenre, and cover candidates with an append-only edit audit;
  a cover becomes shared only when its exact `u/{owner}/{book}/{revision}` object exists behind the
  signed project issuer's origin and its option uses the reviewed object schema; request Host headers
  are not trusted, and a different `COVER_PUBLIC_URL` origin remains safely unsupported until it has
  an explicit database-controlled trust configuration;
- field-scoped household synchronization for tags and tropes: an intentional tag edit updates only
  household tags, an intentional trope edit updates only household tropes, and both preserve the
  independently curated sibling field without exposing ratings, reading state, plans, favourites,
  moods, or notes. Only an exact owned copy or exact actively shared borrowed copy can publish;
- database, unit, cache-authorization, and presentation regression coverage.

The PR review hardening pass also closes the following privacy boundaries:

- both household read contracts admit owned rows or an active share for that exact borrowed book;
  one copy admitting a work never exposes another member's unshared borrowed copy, and the legacy
  compatibility RPC always reports `wishlist = false`;
- migration deployment creates no household enrichment from historical personal tags/tropes and
  promotes no historical personal tag or arbitrary cover into a provisional corpus work. Historical
  annotation reconciliation remains a separate target-scoped operator data fix after inventory,
  dry run, and owner approval; neither automatic owned inclusion nor the explicit borrowed checkbox
  publishes pre-existing annotations;
- every membership/corpus mutation and automatic annotation path rechecks current membership and
  exact-copy/work/link eligibility at its serialization point. Annotation paths lock the personal
  book as well as the household. Trope INSERT/UPDATE authorization permits only canonical
  vocabulary or the authenticated reader's own private vocabulary, and the definer aggregation
  independently filters both mismatched join owners and cross-owner referenced tropes left by legacy
  or operator writes. The expected work binding is captured before a book-lock wait; moved joins
  capture both bindings and prelock both books in UUID order before either household lock, then
  refresh source before destination so a duplicate-copy destination remains the final snapshot. The
  local two-session harness
  proves five explicit mutations plus both annotation triggers against an uncommitted concurrent
  unlink, an exact personal-book removal race, ordinary and moved-join server-rebind races, moved
  join lock ordering, and the final-unlink lifecycle, without timing sleeps;
- backup restore replays historical personal tropes while restored books are staged as unowned, then
  restores owned state in sequential batches of at most 100 UUIDs so household membership is rebuilt
  without publishing backup history or exceeding gateway request-line limits;
- canonical ISBN resolution locks all normalized identifiers in stable sorted order before lookup
  and insertion. The same harness proves concurrent first-time adds with one ISBN and distinct title
  keys create one ordinary corpus work and two links, while historical ambiguous ISBN ownership
  continues to route to reconciliation;
- household trope overlays are typed and rendered, including when a trope is the overlay's only
  content.

Still pending and intentionally not performed:

- inspection and dry-run classification of the private CSV;
- owner execution and approval of the deterministic private dry run and rollback artifact;
- the owner-run production postcondition report and owner-executed reconciliation;
- production Account A/B and household smoke verification.

## Stage 02 operator revalidation — 2026-08-28

- A clean local database rebuild applied every migration through `20260831010000`; the initial
  owner-run rollout report returned 42/42 current-state invariants true locally. Production exposed
  a default-grant difference that the original one-operation pgTAP assertion did not cover; the
  forward ACL correction and exact twelve-operation regression are the required follow-up.
- The forward-only ACL correction then passed a fresh rebuild through `20260901010000`; the expanded
  rollout report returned 43/43 invariants true. Full pgTAP passed 650 assertions across 28 files,
  including the 12-operation ACL matrix after deliberately reproducing the legacy exposure first.
- The deterministic multi-session harness passed all 17 authorization, owner-fence, roster,
  fingerprint, ISBN, and final-unlink races.
- The bounded migration fixture applied both migrations to 25,005 initial works and 5,012 personal
  books under its 20-second per-statement timeout, binding every personal row and safely retaining
  the reviewed ambiguity paths.
- Core and web unit suites passed 2,426 and 626 assertions respectively. TypeScript, ESLint,
  Prettier, the production build, and `git diff --check` passed.
- The complete browser matrix passed 218 runnable cases with 10 expected project skips, one worker,
  and zero retries from a fresh database.
- A disposable two-account fixture exercised the real three-phase operator: deterministic dry run,
  independently checksum-verified read-only backup, checksum-bound write, exact convergence, and a
  subsequent stale-backup refusal before the RPC. Files were mode `0600` under a mode `0700`
  directory; the synthetic fixture and artifacts were moved to Trash afterward.

Historical integration verification:

- 2,952 unit assertions passed across 146 test files;
- 567 pgTAP assertions passed across 26 files after a clean local database reset;
- the complete Playwright matrix passed with 218 runnable cases and 10 expected project skips;
- typecheck, lint, formatting, production build, and `git diff --check` passed.

The review hardening follow-up was checked with 107 focused membership pgTAP assertions, 80 focused
core assertions, 36 focused household-web assertions, 50 focused restore assertions, and all 13
deterministic harness cases covering authorization/eligibility revocation, exact-book removal,
server rebinding, moved-join prelocking, concurrent first-ISBN resolution, and final-unlink lifecycle.
The latest three-fix diff also received a fresh bounded blind review for bypasses, lock-order
regressions, legitimate-write breakage, and false-positive tests; it found no blockers before the
whole-repository rerun recorded above.

The first pgTAP invocation was intentionally discarded because it ran concurrently against the
same local database just populated by Playwright. Its inflated global counts demonstrated fixture
contamination; a clean reset followed by the isolated pgTAP run above matches the fresh database
provided to the GitHub Actions job.

Private input: the owner-supplied, gitignored `chism-books-library.csv`. Never commit the file, its
reader data, a production export, or a title-level reconciliation report.

## Product invariant

The shared corpus and a personal library have different lifecycles. A reader may remove a book from
their library, but that operation must not delete or degrade the corpus work, edition, contributors,
ISBNs, sourcing provenance, or another reader's library record.

## Library inclusion and data-scope rules — owner rulings, 2026-08-25

The household library is a first-class collection, not a view derived continuously from personal
possession. Personal actions may add a work to the household, but the two memberships then have
independent lifecycles:

`personal membership -> may create household membership`

`removing personal membership -/-> removing household membership`

Wishlist, reading history, ratings, notes, plans, favourites, and personal list membership never
create household membership by themselves.

| Personal state                     | Personal library | Household library | Rule                                                                                                              |
| ---------------------------------- | :--------------: | :---------------: | ----------------------------------------------------------------------------------------------------------------- |
| Owned                              |       Yes        |        Yes        | Adding or marking owned ensures household membership. There is no owned-book household opt-out while it is owned. |
| Borrowed                           |       Yes        |   No by default   | The reader may explicitly check **Add this borrowed book to my household library**.                               |
| Borrowed + added to household      |       Yes        |        Yes        | Household membership remains until separately removed, even if the personal record is later removed.              |
| Wishlist only                      |       Yes        |        No         | Wishlist is private personal intent.                                                                              |
| Borrowed + wishlist                |       Yes        |  Only when added  | Wanting a permanent copy while borrowing one is valid; household never sees the wishlist flag.                    |
| Owned + wishlist                   |       Yes        |        Yes        | Valid when the reader owns one format or edition and wants another; wishlist remains private.                     |
| Owned + borrowed                   |       Yes        |        Yes        | Valid across formats or copies.                                                                                   |
| Reading history without possession |       Yes        |        No         | A read or DNF may stay personal but does not create household membership.                                         |
| Household-only work                |        No        |        Yes        | Valid. The household collection does not require a surviving personal owner row.                                  |
| Corpus-only work                   |        No        |        No         | Valid. The shared catalog record remains available without belonging to either library.                           |

Additional rules derived from that contract:

1. **Borrowed household inclusion is explicit, off by default, and household-scoped.** Never infer it
   from reading history, wishlist, or prior membership in another household. Adding a borrowed book
   creates household membership; it is not merely a live mirror of the borrowed flag.
2. **Wishlist is an independent flag, not a possession state.** It may coexist with owned or
   borrowed because the reader may want another format, edition, or permanent copy. It is never
   included in the household RPC payload.
3. **Creation is automatic where required; removal is always explicit.** Marking a book owned ensures
   household membership. Clearing owned status, returning a borrowed book, or removing the entire
   personal record does not remove household membership. Household removal is a separate confirmed
   action. While any member still marks a copy owned, the owned-book rule prevents removing the work
   from the household; the UI must explain which member/copy keeps it there.
4. **Personal deletion never cascades to the household or corpus.** Removing a book from a personal
   library removes only that reader's membership and reader-owned dependent state selected by the
   final removal design. If the work is in the household, it stays there and loses only the deleted
   personal copy/owner attribution. Removing it from the household likewise leaves every personal
   library and the corpus unchanged.
5. **No silent deletion when flags clear.** Clearing owned, borrowed, and wishlist does not itself
   delete the personal book row when reads, reviews, notes, plans, tags, favourites, or list
   membership remain. Actual removal is a separate explicit action with an accurate consequence
   warning.
6. **Household display preserves ownership.** Combine matching works for presentation only when the
   UI still identifies every visible owner/copy. Removing one member's personal copy must not remove
   household membership or another member's copy.
7. **Only the personal owner may mutate personal state.** Household members cannot edit another
   member's possession, wishlist, reading activity, rating, notes, plans, favourites, or lists.
   Household collection membership and household-shared enrichment use their own authorized write
   path; no household action may delete or rewrite another member's personal row.
8. **Data edits have one explicit scope.** Do not copy a mutable `books` row between scopes.
   - **Corpus:** canonical bibliographic identity and standard catalog data. At minimum, genre,
     subgenre, available cover options, and accepted canonical tropes are corpus changes and must
     flow to every linked view.
     Cover options are shared candidates; a personal or household display choice may remain a scoped
     preference without deleting or overwriting the corpus options.
   - **Household:** shared descriptive enrichment such as household tags and tropes. Editing it from
     an eligible personal-book surface updates only the corresponding field on the single household
     overlay, preserving the independently curated sibling field, so every household member sees the
     same result. Ordinary-reader edits do not become global corpus data. A corpus administrator's
     added trope is also promoted additively to the canonical work; removing it from the household
     later does not erase the accepted corpus association.
   - **Personal:** ownership/borrowing, wishlist, owned formats, reading status and logs, rating,
     notes, progress, plans, favourites, and personal lists. These remain private and never become
     household fields merely because the work also belongs to the household. Personal trope
     assignments remain personal for ordinary readers; a corpus administrator's newly assigned
     trope is also promoted additively to the canonical work.
9. **Shared enrichment survives personal deletion.** Household tags, tropes, and other explicitly
   household-scoped enrichment attach to household membership or the household-work overlay—not to
   one member's personal row—so deleting that row cannot erase the household's edits. Removing the
   final household membership may delete or archive that overlay according to a separately reviewed
   recovery policy; it must not alter the corpus.
10. **Canonical changes are validated and attributable.** Genre, subgenre, cover-option, and trope
    writes go through explicit corpus boundaries with provenance, validation, and conflict handling.
    A personal row must not silently override global data. Trope promotion is immediate only for a
    service-granted corpus administrator; ordinary-reader household enrichment is never promoted by
    accident.
11. **Existing private enrichment needs an explicit migration decision.** The shipped model treats
    tags, moods, and tropes as owner-scoped and omits them from household reads. Do not bulk-expose
    historical values merely because the new overlay exists. Inventory them in the reconciliation
    dry-run, migrate only the values approved as household-shared, and leave private values personal.
12. **Import and restore do not invent borrowed consent.** New borrowed personal rows default to not
    added to a household. Restoring a personal library must not add a borrowed work to a different
    household. The current CSV reconciliation is an explicit household assignment because the owner
    ruled that every resolved CSV row belongs to the present household.
13. **Offline and revoked access fail closed.** A cached household result, including an added borrowed
    book, is not renderable while household authorization is paused, unavailable, revoked, or
    replaced.

## Implemented baseline and compatibility path

Personal Book Detail now calls the owner-scoped `remove_personal_book` RPC. It archives the personal
row with `removed_at` instead of deleting it, and every ordinary personal-library read filters those
rows out. Reads, list membership, tropes, moods, series links, and other dependent state therefore
remain recoverable. The confirmation names the personal scope and explicitly says the household and
history remain.

`household_library_works()` is the primary work-level household contract. The previous
`household_library_books()` signature remains temporarily as a staged-deploy compatibility path and
hides archived, wishlist-only, and unshared borrowed personal rows. Its retained `wishlist` field is
always false; new UI must not derive household membership or personal intent from it.

## CSV reconciliation contract

- Every resolved CSV title becomes a direct member of the present household library, including rows
  with no personal-account marker.
- A `TC read` marker assigns that title to Account A.
- A `GC read` marker assigns that title to Account B.
- A row carrying both markers may create one personal record for each account only after edition and
  duplicate behavior is reviewed.
- A row carrying neither marker is household-only; it is not assigned to either personal account.
- Existing Account A/B personal-library rows absent from the CSV leave the affected personal
  libraries. They leave the household only if they are also absent from the CSV and an approved
  household-removal plan explicitly says so. All remain in the corpus.
- Match by stable ISBN/edition identity first, then exact normalized title/author. Fuzzy or conflicting
  matches require owner review and never write automatically.

## Owner handoff: production verification, private dry run, and backup

All commands in this section are owner-run from a clean checkout of the reviewed commit. Code does
not receive production credentials, run these commands against production, inspect the private
artifacts, or perform the write.

### 1. Verify the deployed database without reading private rows

Run the complete `docs/queries/library-membership-rollout-verification.sql` file in the production
Supabase SQL Editor. It reports catalog facts and aggregate binding counts only. Every returned row
must have `ok = true`. Stop on any false row; guarded deploy command success is not evidence that
the database reached the required state.

The report cannot prove claims that require a pre-migration baseline: the exact correctness of each
legacy binding choice, preservation of former `updated_at`/`enriched_at` values, unchanged historical
row counts and private annotations, or production runtime. Record those as unavailable rather than
inferring them from current non-null bindings.

### 2. Produce and approve the deterministic private dry run

Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` only in the owner's private shell. Keep the CSV
and artifact directory outside Git. Use a new directory below an existing parent, or an existing
owner-private mode-`0700` directory. The operator never changes an existing directory's permissions.
Filesystem root, home, temp roots, and repository paths are refused. A symbolic-link final
directory is refused; ancestors are canonicalized, and any path resolving inside the repository is
also refused. Artifacts are mode `0600`.

```sh
pnpm household:reconcile -- /absolute/private/path/library-reconciliation.csv \
  --account-a-id=<ACCOUNT_A_UUID> \
  --account-b-id=<ACCOUNT_B_UUID> \
  --artifact-dir=/absolute/private/path/reverie-reconciliation
```

Review the exact title-level `dry-run-detail-<prefix>.json`, not aggregate counts alone. Confirm the
endpoint and two-account roster, every duplicate/unmatched/conflicting row, both-marker behavior,
household-only rows, personal archives, household archives, and historically private enrichment.
The file deliberately contains no timestamp, so unchanged inputs reproduce the same SHA-256.
Record the exact printed dry-run checksum after independently confirming it against the file:

```sh
shasum -a 256 -- /absolute/private/path/reverie-reconciliation/dry-run-detail-<prefix>.json
```

Any CSV edit or database plan change requires a new dry run and approval.

### 3. Capture and approve the transaction-consistent backup without writing

Also set `SUPABASE_DB_URL` in the owner's private shell. The password is removed from the child
process argument list and supplied through a minimal environment; ambient libpq routing/TLS
overrides, the original URL, and unrelated secrets are not inherited. This phase opens one direct
PostgreSQL `REPEATABLE READ READ ONLY` snapshot and does not call the mutation RPC.

```sh
pnpm household:reconcile -- /absolute/private/path/library-reconciliation.csv \
  --account-a-id=<ACCOUNT_A_UUID> \
  --account-b-id=<ACCOUNT_B_UUID> \
  --artifact-dir=/absolute/private/path/reverie-reconciliation \
  --backup-only \
  --approved-dry-run-sha256=<APPROVED_DRY_RUN_SHA256>
```

Review the exact `prechange-backup-<timestamp>.json` and independently verify its printed checksum
with `shasum -a 256 -- <absolute-backup-path>`. The backup contains both accounts' registered
owner-scoped rows plus the complete household, roster, works, shares, and enrichment state. It is a
private row-level recovery source, not an automatic restore button; do not authorize production
write until the owner accepts its recovery scope and the exact checksum.

### 4. Owner-only write after both exact approvals

Write mode requires the static confirmation plus both approved checksums and the exact reviewed
backup path. It takes a fresh read-only snapshot, rejects a changed dry-run plan, rejects any scoped
row difference from the approved backup, passes the full-row/roster fingerprints into the atomic
RPC, and verifies convergence afterward.

```sh
pnpm household:reconcile -- /absolute/private/path/library-reconciliation.csv \
  --account-a-id=<ACCOUNT_A_UUID> \
  --account-b-id=<ACCOUNT_B_UUID> \
  --artifact-dir=/absolute/private/path/reverie-reconciliation \
  --write \
  --confirm=RECONCILE_CHISM_HOUSEHOLD \
  --approved-dry-run-sha256=<APPROVED_DRY_RUN_SHA256> \
  --approved-backup=/absolute/private/path/reverie-reconciliation/prechange-backup-<timestamp>.json \
  --approved-backup-sha256=<APPROVED_BACKUP_SHA256>
```

After success, retain the backup, dry-run detail, and `postchange-verification.json` under owner-only
access. Complete Account A, Account B, household-only, corpus-preservation, owner-label, scoped-edit,
cache-invalidation, personal-removal, and household-removal smoke checks before declaring this task
complete or unblocking the CI/release stage.

## Required sequence

1. Audit the CSV headers, marker values, duplicates, missing identifiers, both-marker rows, and
   neither-marker rows without exposing title data in committed artifacts.
2. Export a complete, restorable pre-change snapshot of both affected personal libraries and all
   dependent reader-owned rows. Store it outside Git with restricted access and verify counts plus a
   checksum.
3. Design and migrate first-class household-work membership plus the household enrichment overlay.
   Define stable links to corpus work/edition identity, RLS/RPC permissions, provenance, duplicate
   behavior, removal recovery, and a safe backfill from the shipped derived view.
4. Route writes by scope and prove their propagation: corpus genre/subgenre/cover options to every
   linked view; household tags/tropes to every household member; personal state only to its owner.
5. Build the two independent removal paths and a deterministic reconciliation operator. Dry-run is
   the default; production write mode requires an explicit flag and owner confirmation.
6. Produce an owner-facing dry-run with exact counts for unchanged, added, reassigned, duplicated,
   household-only, removed-from-personal, removed-from-household, unmatched, conflicting, and
   historically private enrichment rows. Prove corpus row counts and identities are unchanged by
   the proposed membership removals.
7. Obtain explicit approval of the exact dry-run and rollback artifact before any production write.
8. The owner executes the production operation; a Code session does not write production data.
9. Verify both personal scopes, the independent household collection, household-only books,
   duplicate/owner labels, scoped edit propagation, corpus preservation, backup restorability, cache
   invalidation, and both removal controls in desktop and mobile flows.

## Completion gate

The task is complete only when personal, household, and corpus memberships have independent tested
lifecycles; personal deletion demonstrably preserves household membership and shared enrichment;
household removal preserves personal and corpus data; scoped edits propagate only to their intended
layer; cross-owner personal mutation is impossible; the rollback artifact is verified; the
owner-run reconciliation matches the approved dry-run; and post-write Account A/B plus household
smoke checks pass.
