# ADR 0007 — Connected-series universes are a reader-owned overlay

**Status:** accepted · 2026-08-30

## Context

Reverie has first-class personal series records and ordered series entries, but it does not have a
first-class way to represent several related series inside one fictional universe. The existing
signals are deliberately incomplete:

- `interconnected_standalone` and `interconnected_series` describe the shape of one book's series;
  they do not identify the other series in its universe.
- `series_merge_decisions.ruling = 'related_but_separate'` remembers that two personal series are
  siblings rather than duplicates; it does not name a universe or establish its full membership.
- Library imports retain `Series #`, `Global order`, and `Series type`, but `Global order` is
  currently reported as unused. It has no safe universe identity key.
- the former generic `reading_orders` subsystem was removed after its route and UI had already been
  retired. It had one production order with zero items and no active restore path. Recreating those
  tables under a new label would repeat a feature that never established a useful product shape.

The representative connected-series fixture also proves that universe order is not necessarily a
strict sequence: Rina Kent-shaped data contains three books at the same global position. A model
that makes `(order, position)` unique would reject real input; a renderer that silently linearizes
the tie would invent authority the source did not provide.

The monetization boundary keeps ordinary series tracking free and places connected-series depth in
the private reader-tier module. Corpus administrators inherit the effective Pro entitlement for
testing while their service-managed administrator grant is active.

## Decision

A **universe is a reader-owned overlay above intact series**. It is not a larger series, not a
shared corpus fact, not household membership, and not a generic arbitrary book list.

```text
reader
└── universe
    ├── member series (many-to-many, relationship-labelled)
    └── order variants
        └── ordered tiers of existing series entries
```

### 1. Series remains the membership authority

Each book or ghost keeps its position inside its own series. Adding Royal Elite and Legacy of Gods
to one universe does not merge their `series` rows, rewrite their entry positions, or change their
individual progress. Universe order is a second coordinate, used only while viewing that universe.

Universe items reference structured personal `series_entries`, not the legacy `books.series`
string and not personal `book_id` alone. That preserves ghost slots and makes a universe order work
for books the reader does not yet have. It also means implementation waits until structured series
membership is canonical enough that a page view is no longer manufacturing authority from an
unproven legacy string.

### 2. Membership is many-to-many and explicit

A series may belong to more than one reader-defined grouping: for example, a broad author universe
and a smaller saga inside it. A join row carries a relationship such as `core`, `prequel`,
`spinoff`, `companion`, or `shared_world`; that label is presentation and navigation metadata, not
a second series status.

A `related_but_separate` ruling may seed an **invitation** to create or extend a universe. It never
creates membership automatically. Pairwise relatedness cannot establish the universe name, full
member set, relationship labels, or reading order.

### 3. Order variants are first-class

A universe may have publication, chronological, recommended, or reader-custom order variants. One
is primary for that reader, but changing the active variant never changes the constituent series'
own order. Unlike the single-order launch decision for an ordinary series, alternate order is part
of the universe's core value and is modeled from the first private implementation.

Positions are numeric and ties are valid. Storage is unique on `(variant, series_entry)`, never on
`(variant, position)`. Presentation groups equal positions into a tier. Within a tier the UI uses a
stable secondary order—reader tie order, member-series order, in-series position, normalized title,
then entry id—without claiming those books are sequential.

### 4. Scope and privacy

The first implementation is personal and owner-scoped. Universe names, memberships, order choices,
notes, and progress are not corpus metadata and do not flow to a household. A later shared template
or administrator-curated suggestion can be designed as an adoptable source, but adoption must copy
into a reader-owned universe and preserve the reader's edits.

Progress is derived from the reader's existing book/read state. It is never stored as an aggregate
and never exposed to another reader. A universe may contain a ghost entry, but it cannot create a
personal possession claim.

### 5. Pro entitlement and code boundary

Connected-series universe creation, editing, order variants, import review, and universe-wide
progress are reader-tier Pro features. The effective entitlement is an active reader subscription
or an active corpus-administrator grant. The server is authoritative and fails closed when it
cannot establish either condition.

The implementation lives in the private premium module. The public app may expose a narrow host
contract, but it must render a complete free series experience when the module is absent; it does
not ship a nonfunctional universe tab or advertising-only placeholder.

Backup export and restore remain full-fidelity and free under ADR 0006. An expired entitlement may
make restored universe data read-only, but it cannot make that data unexportable, un-restorable, or
subject to deletion. The private module owns validation of its backup section; the public host owns
the stable hook that carries that section without interpreting premium ordering rules.

### 6. Import requires a reviewed group identity

`Global order` is evidence of an overlay order, not evidence of which rows form one universe.
Author name is not a safe identity key: one author can write unrelated worlds, and shared-author
universes exist. Therefore an import may propose a universe only when it has an explicit mapped
universe column or when the reader reviews and names a detected group.

The review shows every series, unresolved row, duplicate entry, and tied tier before writing.
Skipping the review imports the books and their ordinary series exactly as today and reports the
unused universe metadata; it does not guess.

## Rejected alternatives

- **Merge sibling series into one large series.** This destroys the distinctions that
  `related_but_separate` was created to protect and makes per-series progress and length false.
- **Restore generic reading orders.** The retired subsystem had no useful active product surface,
  accepted arbitrary books, and did not encode series topology or variants.
- **Make universes canonical corpus objects first.** Universe membership and recommended order are
  often interpretive. A global answer would put administrator authority ahead of the reader and
  make corrections much riskier.
- **Group automatically by author plus global position.** This fails for authors with unrelated
  universes and cannot handle collaborative universes.
- **Require unique order positions.** Real connected-series data contains intentional ties.
- **Put the premium implementation in this public repository temporarily.** Published AGPL code
  cannot later be recalled into the private module; the existing monetization decision requires the
  private boundary from the start.

## Consequences

- The next public-repo work is a small, real premium host/entitlement contract, not universe UI.
- The private implementation depends on the series-truth program making structured membership the
  reliable authority and on a server-side subscription provider being selected.
- Corpus administrators can exercise every Pro universe path without creating fake subscription
  data, and revoking the administrator grant removes that override.
- The existing connected-series import fixture becomes a permanent acceptance vector: tied rows
  must survive as tied tiers and ordinary series positions must remain unchanged.
