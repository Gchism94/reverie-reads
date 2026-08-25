# Task: corpus-preserving library removal and owner reconciliation

Status: **queued after recovery, contributor-history cleanup, and workspace pruning**.

Private input: the owner-supplied, gitignored `chism-books-library.csv`. Never commit the file, its
reader data, a production export, or a title-level reconciliation report.

## Product invariant

The shared corpus and a personal library have different lifecycles. A reader may remove a book from
their library, but that operation must not delete or degrade the corpus work, edition, contributors,
ISBNs, sourcing provenance, or another reader's library record.

## Existing baseline to audit, not rebuild

Personal Book Detail already renders **Remove book** and calls `useDeleteBook`, which performs a
direct owner-RLS-scoped delete from `public.books` with an optimistic cache removal. The current
confirmation says only “Remove this book from your library?” Several dependent tables cascade on
book deletion, while `series_entries.book_id` uses `on delete set null`. The corpus tables are
referenced by the personal row and are not deleted by that direction of the relationship.

Treat this as an existing capability that needs a full consequence and UX audit. Do not add a
second deletion path with different semantics. Determine exactly which reader-owned data is lost,
which series ghosts remain, how list membership and reads behave, whether an undo/soft-removal model
is justified, and what the confirmation must disclose.

The current household is a read-only union of linked personal libraries, not an independently owned
collection. Therefore:

- Personal scope may offer **Remove from my library** for the signed-in reader's row.
- Household scope may offer the same operation only for a copy owned by the signed-in reader, with
  copy and owner identity stated explicitly.
- Another member's copy remains read-only.
- The work disappears from household scope only when no remaining household member owns a matching
  visible copy.
- A future ability to hide a personal book from household scope while keeping it personal would
  require a new sharing/visibility model and an explicit owner decision; do not imply that behavior
  with a destructive button.

Before implementation, trace every dependent personal object—reads, reviews, notes, plans, tags,
lists, series entries, clubs, and cached/offline state—and decide what removal retains, deletes, or
requires a warning. Prefer a recoverable removal model if these dependencies make a hard delete
surprising. RLS and RPC grants must prevent cross-owner removal.

## CSV reconciliation contract

- Every resolved CSV title belongs in the household view through at least one personal owner.
- A `TC read` marker assigns that title to Account A.
- A `GC read` marker assigns that title to Account B.
- A row carrying both markers may create one personal record for each account only after edition and
  duplicate behavior is reviewed.
- A row carrying neither marker is ambiguous under the derived-household model and must be reported,
  not guessed.
- Existing Account A/B personal-library rows absent from the CSV leave their personal and household
  views but remain in the corpus.
- Match by stable ISBN/edition identity first, then exact normalized title/author. Fuzzy or conflicting
  matches require owner review and never write automatically.

## Required sequence

1. Audit the CSV headers, marker values, duplicates, missing identifiers, both-marker rows, and
   neither-marker rows without exposing title data in committed artifacts.
2. Export a complete, restorable pre-change snapshot of both affected personal libraries and all
   dependent reader-owned rows. Store it outside Git with restricted access and verify counts plus a
   checksum.
3. Build the corpus-preserving removal path and a deterministic reconciliation operator. Dry-run is
   the default; production write mode requires an explicit flag and owner confirmation.
4. Produce an owner-facing dry-run with exact counts for unchanged, added, reassigned, duplicated,
   removed-from-library, unmatched, and ambiguous rows. Prove corpus row counts and identities are
   unchanged by the proposed removals.
5. Obtain explicit approval of the exact dry-run and rollback artifact before any production write.
6. The owner executes the production operation; a Code session does not write production data.
7. Verify both personal scopes, the household union, duplicate/owner labels, corpus preservation,
   backup restorability, cache invalidation, and removal UI in desktop and mobile flows.

## Completion gate

The task is complete only when the self-service removal behavior and bulk operator share the same
ownership/corpus semantics, cross-owner removal is impossible, all ambiguous CSV rows are resolved,
the rollback artifact is verified, the owner-run reconciliation matches the approved dry-run, and
post-write Account A/B plus household smoke checks pass.
