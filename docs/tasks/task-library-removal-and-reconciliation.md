# Task: corpus-preserving library removal and owner reconciliation

Status: **queued after recovery, contributor-history cleanup, and workspace pruning**.

Private input: the owner-supplied, gitignored `chism-books-library.csv`. Never commit the file, its
reader data, a production export, or a title-level reconciliation report.

## Product invariant

The shared corpus and a personal library have different lifecycles. A reader may remove a book from
their library, but that operation must not delete or degrade the corpus work, edition, contributors,
ISBNs, sourcing provenance, or another reader's library record.

## Library inclusion rules — owner ruling, 2026-08-25

Household visibility is derived from possession, not from the mere existence of a personal book
record:

`household visible = owned OR (borrowed AND explicitly shared with this household)`

Wishlist, reading history, ratings, notes, plans, favourites, tags, and list membership never make a
book household-visible by themselves.

| Personal state                                             |                           Personal library                           |           Household library           | Rule                                                                                                   |
| ---------------------------------------------------------- | :------------------------------------------------------------------: | :-----------------------------------: | ------------------------------------------------------------------------------------------------------ |
| Owned                                                      |                                 Yes                                  |                  Yes                  | Household inclusion is automatic; there is no owned-book opt-out under this model.                     |
| Borrowed                                                   |                                 Yes                                  |             No by default             | The reader may explicitly check **Share this borrowed book with my household**.                        |
| Borrowed + shared                                          |                                 Yes                                  |                  Yes                  | Household sees a borrowed copy attributed to its owner.                                                |
| Wishlist only                                              |                                 Yes                                  |                  No                   | Wishlist is private personal intent.                                                                   |
| Borrowed + wishlist                                        |                                 Yes                                  | Only when borrowed sharing is checked | Wanting a personal copy while borrowing one is valid; household never sees the wishlist flag.          |
| Owned + wishlist                                           |                                 Yes                                  |           Yes because owned           | Valid when the reader owns one format/edition and still wants another; wishlist remains private.       |
| Owned + borrowed                                           |                                 Yes                                  |           Yes because owned           | Valid across formats/copies; the borrowed-share checkbox has no effect while owned visibility applies. |
| No possession flags, but reading history                   |                                 Yes                                  |                  No                   | A read or DNF stays in the reader's default personal library but does not imply household possession.  |
| No possession or reading history, but other personal state | Stored until explicitly removed; visibility follows personal filters |                  No                   | Notes, plans, favourites, tags, and list membership do not imply household possession.                 |

Additional rules derived from that contract:

1. **Borrowed sharing is explicit, off by default, and household-scoped.** Never infer it from the
   fact that the book was formerly owned or formerly visible. Unlinking or joining a different
   household must not expose an old borrowed-share choice to the new household without a new
   confirmation.
2. **Wishlist is an independent flag, not a possession state.** It may coexist with owned or
   borrowed because the reader may want another format, edition, or permanent copy. It is never
   included in the household RPC payload.
3. **Transitions recompute visibility immediately.** Marking a book owned makes it household-visible.
   Removing owned status leaves it visible only if it is still borrowed and explicitly shared with
   the current household. Returning a borrowed book disables its household visibility; a remaining
   wishlist or reading history keeps it personal.
   The borrowed-sharing control is relevant only to borrowed-only visibility and must not imply that
   it can hide a book that is also owned.
4. **No silent deletion when flags clear.** Clearing owned, borrowed, and wishlist does not itself
   delete the personal book row when reads, reviews, notes, plans, tags, favourites, or list
   membership remain. Actual removal is a separate explicit action with an accurate consequence
   warning.
5. **Household display preserves ownership.** Combine matching works for presentation only when the
   UI still identifies every visible owner/copy. One member removing or unsharing a copy must not
   remove another member's copy.
6. **Only the personal owner may mutate possession or sharing.** Household members cannot edit,
   unshare, return, or remove another member's book. From household scope, an owned personal copy may
   be removed only through the same reviewed personal-removal operation; a borrowed personal copy
   may leave household scope by unchecking sharing without leaving the personal library.
7. **Household privacy remains curated.** Household responses may expose the bibliographic fields,
   owner label, relevant copy/format facts, and whether the visible copy is owned or shared-borrowed.
   Shared borrowed copies should read as **Borrowed by [member]**, never as household-owned.
   They must not expose wishlist, reads/read status, ratings, reviews, notes, progress, plans,
   favourites, personal tags, moods, tropes, or other private reader state.
8. **Import, restore, and reconciliation do not invent consent.** New borrowed rows default to not
   shared. A restore must not re-share a borrowed book into a different household. The current CSV
   reconciliation is a narrow exception only because the owner explicitly ruled that every resolved
   CSV row belongs in the present household; any borrowed CSV row therefore needs an explicit,
   reviewed household-share assignment in the dry-run.
9. **Offline and revoked access fail closed.** A cached household result, including a shared borrowed
   book, is not renderable while household authorization is paused, unavailable, revoked, or
   replaced.

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

The current household remains a read-only union of the eligible personal rows defined above, not an
independently owned collection. A work leaves household scope only when no member has an owned copy
or an explicitly shared borrowed copy.

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
