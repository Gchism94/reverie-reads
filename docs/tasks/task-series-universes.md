# Task: Pro connected-series universes

Status: **blueprint complete; implementation not started**.

Decision: [`ADR 0007`](../decisions/0007-series-universes.md). Monetization boundary:
[`ADR 0006`](../decisions/0006-monetization-boundary.md).

## Outcome

A Pro reader can keep several real series separate while viewing them as one connected universe,
choose among publication/chronological/recommended/custom orders, see universe-wide progress and
gaps, and review connected-series import metadata without Reverie inventing an order or a
membership. Corpus administrators receive the same effective Pro access for testing.

Ordinary series tracking remains complete and free. The open app has no empty universe tab when the
private premium module is absent.

## What exists today

| Signal                                           | Useful evidence                                          | Missing authority                                              |
| ------------------------------------------------ | -------------------------------------------------------- | -------------------------------------------------------------- |
| personal `series` + `series_entries`             | one ordered series, including ghosts and tombstones      | no grouping above a series                                     |
| `interconnected_*` status                        | the shape of one series                                  | universe identity and siblings                                 |
| `related_but_separate` ruling                    | two series are siblings, not duplicates                  | group name, complete membership, relationship, order           |
| import `Series #`, `Global order`, `Series type` | candidate topology and tied order tiers                  | safe universe identity; no current consumer                    |
| retired `reading_orders`                         | historical evidence that generic overlays were attempted | no current table, route, restore, or useful production content |

The committed representative fixture has 13 rows across two authors. Its Rina Kent-shaped subset
has 10 books across four series, six global-order tiers, and two three-way ties. The archived real
validation reported the same structural problem at larger scale. Those ties are the most important
model test: they must remain concurrent tiers, not be rejected or silently flattened.

## Product boundary

### Free

- create/edit one series;
- order its entries, including decimals;
- ghosts, gaps, Next Up, length, and progress;
- import and edit ordinary series membership;
- backup and restore series data at full fidelity.

### Pro

- create and edit a universe containing several series;
- multiple universe order variants;
- universe-wide progress, gaps, and Next Up;
- connected-series import review and mapping;
- relationship labels and universe navigation;
- later: adoptable curated universe templates and release-aware universe planning.

### Administrator override

Effective access is `active reader subscription OR active corpus administrator`. Administrator
access is derived from the existing service-managed grant and never writes or fakes a subscription.
The server authorizes every premium mutation. The client consumes one effective entitlement result
and fails closed if it is unavailable.

| Subscription proof | Administrator proof | Effective result                        |
| ------------------ | ------------------- | --------------------------------------- |
| active             | any                 | Pro                                     |
| any                | active grant        | Pro                                     |
| inactive           | no grant            | not Pro                                 |
| unavailable        | no grant            | unavailable; premium writes fail closed |
| inactive           | unavailable         | unavailable; premium writes fail closed |

An administrator does not wait on a failed billing provider: one confirmed positive proof is
sufficient. “Any” above includes unavailable because the other source already established access.

Revocation cases are part of done:

- removing the administrator grant removes the override on the next authoritative check;
- an independently subscribed administrator stays Pro after the grant is removed;
- entitlement loss makes existing universe data read-only/exportable, not deleted;
- no in-flight mutation may succeed after the server observes the revoked entitlement.

## Model blueprint

Names below are contracts for the private implementation, not tables that exist in the public
schema today.

### `series_universes`

| field                      | shape         | rule                                                      |
| -------------------------- | ------------- | --------------------------------------------------------- |
| `id`                       | uuid          | primary key                                               |
| `owner_id`                 | uuid          | immutable, cascades with the account                      |
| `name`                     | text          | nonblank; unique by normalized owner/name key             |
| `description`              | text nullable | private reader prose                                      |
| `primary_variant_id`       | uuid nullable | deferred FK or transactional setter to avoid insert cycle |
| `created_at`, `updated_at` | timestamptz   | server timestamps                                         |

### `series_universe_members`

| field           | shape   | rule                                                      |
| --------------- | ------- | --------------------------------------------------------- |
| `universe_id`   | uuid    | owner-consistent FK                                       |
| `series_id`     | uuid    | owner-consistent FK to personal `series`                  |
| `relationship`  | enum    | `core`, `prequel`, `spinoff`, `companion`, `shared_world` |
| `display_order` | numeric | stable series grouping order; ties not useful here        |
| `source`        | enum    | `reader`, `import`, `suggestion`                          |
| `user_edited`   | boolean | protects reader choice from later suggestions             |

Primary key is `(universe_id, series_id)`. Do not constrain one universe per series: broad and
narrow reader groupings may overlap.

### `series_universe_variants`

| field                     | shape         | rule                                                    |
| ------------------------- | ------------- | ------------------------------------------------------- |
| `id`                      | uuid          | primary key                                             |
| `universe_id`, `owner_id` | uuid          | owner-consistent                                        |
| `name`                    | text          | reader-facing, nonblank                                 |
| `kind`                    | enum          | `publication`, `chronological`, `recommended`, `custom` |
| `source`, `source_ref`    | text nullable | provenance, never authority by itself                   |
| `is_primary`              | boolean       | exactly one active primary per nonempty universe        |

Use a partial unique index for one primary variant per universe and a transaction/RPC that cannot
leave a nonempty universe with none. Renaming or selecting a variant never rewrites items.

### `series_universe_order_items`

| field             | shape         | rule                                                      |
| ----------------- | ------------- | --------------------------------------------------------- |
| `variant_id`      | uuid          | parent variant                                            |
| `series_entry_id` | uuid          | existing live personal entry, ghost allowed               |
| `owner_id`        | uuid          | owner-consistent across every ancestor                    |
| `position`        | numeric       | nonnull tier coordinate; duplicates intentionally allowed |
| `tie_order`       | numeric       | deterministic presentation inside an equal-position tier  |
| `note`            | text nullable | variant-specific private explanation                      |
| `user_edited`     | boolean       | source refresh cannot overwrite it                        |

Unique `(variant_id, series_entry_id)`. **No unique constraint on `(variant_id, position)`.** The
read is a total presentation order:

1. universe position;
2. explicit tie order;
3. member-series display order;
4. in-series entry position;
5. normalized title;
6. entry id.

Steps 2–6 make rendering deterministic; only step 1 is claimed as the reading-order tier. The UI
must not relabel a tied tier as a sequence.

### Mutation boundary

Do not expose direct authenticated writes to the four tables. Private RPCs perform create, member
changes, variant changes, reorder, and delete/archive with these checks in one transaction:

- authenticated owner;
- effective Pro entitlement (subscription or corpus administrator);
- every referenced series and entry belongs to that owner;
- every order item belongs to a series currently in the universe;
- tombstoned entries are not newly added; a concurrent series removal safely wins;
- locks follow one documented global order;
- RPC execute and table ACLs are explicitly reset for `PUBLIC`, `anon`, `authenticated`, and
  `service_role`, then only required privileges are granted.

Entitlement loss does not cascade or erase data. Reads needed for export and an honest read-only
view remain available; premium mutations refuse with a distinct authorization result.

## Import blueprint

### Accepted inputs

- explicit `Universe` column plus series and order metadata: eligible for a grouped review;
- explicit mapping supplied by the reader in the import review;
- `Global order` without a universe identity: detected and reported, but not written until the
  reader selects the rows and names the universe;
- no universe metadata: ordinary import unchanged.

Never use author alone as the group key. Never infer that all `interconnected_series` rows share one
universe. Never convert tied positions into incrementing positions.

### Review screen

Before a universe write, show:

- proposed universe name;
- included and excluded series;
- relationship label per series;
- unresolved books and duplicate series-entry matches;
- every order tier, with ties visibly grouped;
- which variant is being created and why;
- a count of rows that will import only as ordinary books/series.

The reader may import books without creating the universe. That path must preserve the current
unused-metadata notice and perform no premium write.

## Responsive experience

### Entry points

- Series page: a quiet “Part of …” breadcrumb and “View universe” action when the private module
  returns an entitled universe projection.
- Series consolidation: a `related_but_separate` ruling may offer “Build a universe” after the
  ruling succeeds. It is never automatic and never blocks the queue.
- Import result: “Connected order found” opens the reviewed grouping flow.
- Library: an optional Universes section appears only after the reader has one. Do not add an empty
  premium tab to the default free navigation.

### Universe page

The page leads with the universe name, progress, and Next Up. A variant control follows; the order
then renders as tiers. Each book card shows its series badge and in-series position so the reader
can understand both coordinates. Tied books share one visible tier marker.

```text
Desktop                                      Mobile
┌──────────────────────────────────────┐     ┌──────────────────────┐
│ Rina Kent universe       Edit        │     │ Rina Kent universe   │
│ Read 18 of 41 · 7 to get              │     │ 18 of 41 · 7 to get  │
├────────────┬─────────────────────────┤     │ [Publication  ▾]     │
│ 11 series  │ [Publication] [Chron.]  │     ├──────────────────────┤
│ Royal Elite│                         │     │ Tier 1               │
│ Legacy …   │ Tier 1                  │     │ [book] [book] [book] │
│ ...        │ [book] [book] [book]    │     │ same-time options    │
│            │ same-time options       │     ├──────────────────────┤
│            │                         │     │ Tier 2               │
│            │ Tier 2                  │     │ [book] [book]        │
│            │ [book] [book]           │     │                      │
└────────────┴─────────────────────────┘     │ [Series & progress]  │
                                             └──────────────────────┘
```

“Same-time options” is explanatory copy for a tied tier, not another ordering control. Book cards
retain the established cover aspect ratio; the tier layout adds space instead of squeezing covers
to make three fit.

Desktop may use a persistent series/member rail beside the order. Mobile uses a single column with
the member list in a sheet or disclosure. Both use the same content order and actions; no desktop-
only editor.

### Editor

- create/name the universe;
- add or remove intact series;
- label relationships;
- create/rename/select variants;
- drag items between tiers or type a numeric tier;
- explicitly group/ungroup ties;
- preview changes before a destructive member removal.

Removing a series from a universe removes only that membership and its variant items. It never
deletes the series, books, ghosts, reading history, or corpus/household data.

## Acceptance and test blueprint

### Pure private-module model tests

- Three entries at universe position 1 survive as one tier of three.
- Equal-position rendering is deterministic under every input permutation.
- One entry has independent in-series and universe positions; editing either leaves the other
  unchanged.
- The same entry may have different positions in publication and chronological variants.
- A series may join two universes without duplicating or moving its entries.
- An order item referencing a nonmember series fails validation.
- Duplicate `(variant, entry)` fails; duplicate `(variant, position)` succeeds.
- Progress counts each entry once per selected variant and does not double-count a tied tier.

### Connected-series fixture

Keep `data/fixtures/library_connected_series.csv` as the standing representative vector:

- 13 rows and two authors parse;
- the Rina Kent-shaped subset has 10 books, four series, six global tiers;
- positions 1 and 2 each contain three books;
- ordinary `Series order` values are unchanged after proposing a universe;
- the second author is not grouped with Rina Kent merely because their global positions overlap.

### Database tests

- cross-owner universe/member/variant/item references are impossible;
- ordinary authenticated and anonymous direct table writes are refused;
- an entitled owner can mutate only their own universe;
- an ordinary reader without a subscription is refused by the RPC;
- a corpus administrator succeeds without a subscription row;
- administrator revocation removes that override; a paid subscription still succeeds;
- unavailable entitlement state fails closed;
- tied positions commit; duplicate entries do not;
- concurrent entry removal versus universe reorder leaves no dangling item;
- account deletion cascades every owner-scoped universe row;
- backup/export and restore preserve data without requiring an active Pro entitlement; the private
  module validates its section, and restore never restores an entitlement or administrator grant.

### Browser tests — Chrome, desktop and mobile

- create a universe from two `related_but_separate` series;
- switch between publication and chronological variants and verify the visible consequence;
- create and undo a tied tier;
- add a ghost entry through its series and include it in a universe variant;
- remove a member series and verify its books/series remain intact;
- reload and verify active variant, positions, and progress;
- ordinary/free reader sees complete series pages with no broken universe affordance;
- administrator sees and can use every Pro path;
- entitlement loss produces a read-only state, not disappearance;
- keyboard reorder has a non-drag alternative and announces the resulting tier;
- no cutoff/overflow at supported desktop and mobile widths in every skin/mode sweep;
- axe and contrast checks cover the new controls; reduced motion is respected.

## Delivery order

1. **Public prerequisite — series truth Phase 2B.** Make structured membership the reliable
   authority, decide multiple membership, and stop page views from materializing unproven series.
   **Implemented in the Phase 2B follow-up branch; production rollout pending.** Historical changes
   still wait for the owner-run aggregate inventory.
2. **Private platform prerequisite.** Select the subscription source and implement one server-side
   effective Pro entitlement with the corpus-administrator override. Expose only the narrow host
   contract the public app needs. **The public positive-proof combiner and provider registration
   seam are implemented; subscription selection and server-side premium-write enforcement remain
   private work.**
3. **Private universe model.** Add the four owner-scoped relations and RPCs, with model and database
   tests. Additive schema only; no historical backfill.
4. **Private creation/editor and import review.** Ship behind entitlement, test Chrome desktop and
   mobile, and keep ordinary imports unchanged.
5. **Private presentation.** Universe page, series breadcrumb, Library section, progress and gaps.
6. **Optional curated templates.** Design separately after personal universes prove useful. A
   template is adoptable input, never a global overwrite.

No production deployment or data reconciliation belongs to this blueprint branch.

## Completion gate

The feature is complete only when it preserves each constituent series as an independent truth,
keeps tied global positions as visible tiers, fails closed at the server when Pro status is absent
or unavailable, grants corpus administrators the effective entitlement without billing mutation,
works in Chrome on desktop and mobile across skins, and leaves the public/free app fully functional
when the private module is absent.
