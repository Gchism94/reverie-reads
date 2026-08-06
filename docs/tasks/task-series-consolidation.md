# Task: fix/series-consolidation

Branch: `fix/series-consolidation` off `main`.
Repo: book-corpus.
Phase 1 audit: complete, on `fix/duplicate-series` at `bf06fd4`. Read it first.

## What Phase 1 established

Eleven candidate duplicate sets in production. **Two are real:** ACOTAR ↔ A Court of Thorns and Roses (linked by initialism), and The Freckled Fate ↔ The Freckled Fate Series (suffix variant). The other nine are prefix-linked false positives — Legend / The Legendborn Cycle / The Legends of Thezmarr are three unrelated series; Ravenhood Legacy ↔ The Ravenhood was already adjudicated distinct during the backfill review; Sinners ↔ Sinners and Saints and Mountain Men ↔ Mountain Men Matchmaker are spinoff relationships, not duplicates.

The discriminating fact: **one initialism link was real, nine of ten prefix links were noise.** Any design that treats these signals as equivalent will destroy real distinctions.

The second discriminating fact: **the ACOTAR row was created at `2026-08-04 00:01:16Z`** — minutes before the screenshots, by the act of opening the series page. Mountain Men Matchmaker was minted the day before; The Freckled Fate Series on July 31. Lazy find-or-create (series.ts:189–196) mints a permanent row from a stale book string with no near-match check and no delete path. This is not a legacy mess sitting still. Browsing generates it, and the count only rises.

Three defects sit underneath, all live today for anyone with a single series:

- `displayTotal` reads `books.find(b => b.seriesCount != null)` (SeriesIndexRoute.tsx:60) — **order-dependent**. A Court of Thorns and Roses has `books_with_count: 3, max_series_count: 7` and displayed "6 in all". The number can change between page loads with no write occurring.
- `book.seriesCount` is a per-book column the backfill deliberately never touched, so a book carries a fossil answer to "how long is this series" from before it was renamed. Same class as the enrichment stamp: a stored value invalidated by a later write to a related field, with no mechanism to notice. Unlike the stamp, it never self-heals.
- `useUpdateSeries` (series.ts:352–365) renames a row and re-points books by old name, but `unique (owner_id, name)` makes renaming into an existing name fail at the constraint. It is structurally a rename and cannot be bent into a merge. No delete path for a series row exists anywhere in app code.

## The model

Consolidation must not be a standing chore. It also must not be an autonomous background merger — Phase 1's own output shows a job with merge authority would have flattened three unrelated series. The resolution is that **prevention is automatic; merging is remembered.**

The work is not-manual because you answer each series _once in its lifetime_, not because the app decides for you. Today nothing records that a pair was examined and ruled on, so any future pass re-proposes everything forever. A decision table fixes that. Eleven sets today, most resolvable in one sitting, near-zero thereafter because prevention stops new ones.

### Tier 1 — Prevention. Automatic, silent, ships first.

`getOrCreateSeries` consults a normalized index before minting. Normalization strips case, punctuation, leading articles, and a trailing "Series". If a normalized match exists, return that row; do not create a second one.

This is safe to automate because **refusing to create a duplicate destroys nothing.** It is the highest-value change in this spec and the only one that stops the problem growing while the rest is decided.

### Tier 2 — Exact-variant merge. Automatic, silent.

Where two rows already exist whose normalized names are identical — "The Freckled Fate" vs "The Freckled Fate Series" — merge without asking. There is no judgment in that pair, and a prompt would be theatre.

### Tier 3 — Strong-match proposal. Queued, never modal.

Initialism and other strong structural matches surface as a quiet, dismissible queue the reader clears when they choose. Never a modal, never blocking, never on load. ACOTAR ↔ A Court of Thorns and Roses is the archetype.

### Tier 4 — Prefix-only. Not proposed at all.

Your data says these are 90% noise, and a suggestion stream that is mostly wrong trains the reader to dismiss it unread — worse than silence. Prefix matching stays in the audit query, where a human is already looking, and out of the product.

### The decision table

Every ruling persists: **same** (with the alias recorded, so the losing name is recognized forever) or **distinct** (so the pair is never proposed again). Both directions must be durable. A "distinct" ruling is as valuable as a "same" — it is the thing that makes this a one-time triage rather than a recurring prompt.

## Thesis boundary — recorded

Consolidating two names for one series is an identity judgment about the reader's own data. It derives nothing about a book: no taste, no mood, no trope, no genre. Auto-merging exact variants does not cross the no-derivation line. **Auto-deciding that Sinners and Sinners and Saints are one series would**, because that overrules a reader distinction — which is exactly why Tier 4 does not exist as a product surface.

## Merge mechanics — what must survive

`on delete cascade` (20260716010000:39) means a naive delete silently destroys entry data. The surviving record must absorb, at correct positions:

- **Live entries** and their positions, including decimals.
- **Ghost entries.** The long ACOTAR record holds 2. These are reader decisions about books that do not exist yet.
- **Tombstones.** The long record holds 1. This is the highest-risk cargo: losing a tombstone resurrects something the reader deliberately suppressed, and the reader will not know it happened.

Correct one Phase 1 assumption: "ACOTAR 6" is **not** a ghost (`ghost_entries: 0, live_entries: 1, books: 1`). It is a real book row added through the acquire flow. Cascade would not destroy the book, only its entry linkage.

Position collisions are inevitable when two records both hold a #4. Decide and state the rule rather than discovering it at runtime; surviving-record-wins with the incoming entry appended at the next free position is acceptable if argued, but a silent overwrite is not.

## Also in scope — the three underlying defects

1. **Order-dependent total.** Replace the `find`-first-non-null read with a deterministic rule. State the rule and why.
2. **Stale per-book `seriesCount`.** Decide what invalidates it. The enrichment-stamp trigger is the precedent: a DB-level rule beat five client writers because the incident's writer was SQL that never ran client code. Argue whether the same reasoning applies here, or why the cases differ.
3. **No delete path.** Merging requires one. Whatever is built must be owner-scoped and RLS-safe, and must not become a general series-deletion affordance by accident.

## Out of scope — recorded

- "The Heart" appears as a one-book series name in two sets. Likely a truncated or dirty string rather than a real series. Report it; do not fix here.
- The Discover cover-quality defect (`fix/discover-cover-quality`) is unrelated and has its own branch.

## Sequencing

Ship as **three PRs**, not one:

1. **Prevention** — the near-match guard in `getOrCreateSeries`, plus the three underlying defect fixes. Small, safe, stops the bleeding. Merge before anything else is written.
2. **Merge machinery + decision table** — the delete path, cargo-preserving merge, persistence of same/distinct rulings.
3. **Tiered proposals** — Tier 2 automatic, Tier 3 queued surface.

Do not begin PR 2 until PR 1 has merged and been eyeballed on the real authenticated app.

## Guards

This defect class — a stored value invalidated by a later write with nothing to notice — is now at five instances (enrichment stamp, sourcePace comment, unmounted texture tokens, dropped monogram, stale `seriesCount`). Guard the invalidation itself, not the happy path:

- A test proving lazy creation refuses a normalized-duplicate name.
- A test proving a merge preserves ghosts, tombstones, and positions — asserting the surviving record's contents, not that the call returned ok.
- A test proving a "distinct" ruling suppresses re-proposal permanently.
- A test proving the total is stable across member-book fetch order.
- Mutants for each.

## Standing

- Investigate and report root cause before fixing.
- Verify rendered output, not computed values — assert what the series page displays, not what the reducer returns.
- No writes to the production database from a Code session, including throwaway accounts.
- Full gate including `format:check` against a clean worktree of the committed HEAD. Full e2e at default workers.
- No merge without explicit per-PR authorization.
