# ADR 0008 — Canonical shared-series catalog

Status: accepted for implementation, 2026-09-02.

## Context

`works.series`, `works.position`, and `works.series_count` give the corpus one reviewed primary
series tuple per work. They correctly seed eligible personal defaults and feed the household view,
but they do not form a series catalog: identity is still repeated text, aliases cannot resolve to
one record, secondary memberships are lost, and a book absent from the corpus cannot occupy a
known slot. The personal `series` and `series_entries` tables do model an ordered graph, but they
belong to one reader and preserve that reader's choices. They cannot become shared authority.

The private Pro universe overlay connects personal series. That remains a reader-authored layer;
the shared catalog must not replace its series ids or silently rewrite a universe.

## Decision

Add five shared, objective tables:

- `corpus_series`: canonical identity, creator discriminator, publication status, declared length,
  evidence, lifecycle state, and an optimistic revision.
- `corpus_series_names`: the canonical name and aliases. Name plus creator is used only when it
  resolves to exactly one active record; stable provider identity distinguishes true homonyms.
- `corpus_series_sources`: stable provider identities such as a Hardcover series id. Provider
  identity outranks name matching and lets a multi-author series remain one record.
- `corpus_series_entries`: ordered memberships. A row may link a corpus work or retain an unbound
  title/author slot; membership and position provenance stay independent.
- `corpus_series_edits`: append-only synchronization and administrator decision history.

`works.series/position/series_count/status` remain the deployed compatibility projection. Reviewed
classifier and shared-editor writes synchronize the catalog. Administrator catalog changes project
back through `works`, which preserves the existing household view and eligible-personal default
rules. Reader/import claims remain authoritative and are never overwritten.

The initial catalog is a durable schema backfill from already-reviewed nonblank `works.series`
tuples. It creates no personal books and infers no missing memberships. Later source refreshes may
add unbound slots only when they carry relational evidence; a search label alone remains a review
candidate.

## Editing and concurrency

Ordinary readers may select the catalog but cannot mutate it. Corpus administrators edit through
security-definer RPCs with explicit ACL resets. Every lifecycle write takes affected personal-book
locks, then work locks, then normalized-name advisory locks, then catalog rows. That matches the
existing personal-default projection order. A required expected revision makes a stale browser fail
closed instead of overwriting a newer administrator decision.

Personal book writes do not need catalog locks. Readers can therefore keep editing ownership,
reading state, ratings, notes, personal taxonomy, and personal series choices during catalog work.
Only a simultaneous shared-series decision concerning the same work may wait briefly, and a stale
administrator form must refresh.

Rename retains the old canonical name as an alias. Merge re-parents all memberships and provider
identities, retains the losing name as an alias, and archives the losing record. Archive is
reversible: it suspends primary intent and clears only the shared compatibility projection; restore
reapplies it only where no newer canonical primary exists. Administrators can also correct linked
positions and add or tombstone an unbound known-book slot without fabricating a personal book.

## Consequences

- Household series information updates immediately through the corpus work projection.
- Eligible automatic personal defaults follow shared corrections; reader and import decisions do
  not.
- Personal series and Pro universes remain editable, private overlays.
- Shared catalog history is auditable and destructive deletion is not a reader-facing operation.
- A full missing-book graph can be accumulated without fabricating personal library rows.
