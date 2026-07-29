# Shelf model — stage A (data model)

Owner-specified, 2026-07-28. Data model only: no new UI, no breakdown toggles, no pills.

## Context

The four-state enum (`owned | borrowed | wishlist | unset`) made possession a single-choice
field, so borrowed and wanted competed for one slot. Three consequences:

- **A book both owned and wanted had no representation.** "Own the paperback, want the special
  edition" is a real reader state that one enum slot cannot hold.
- **Every shelf that wanted to ask "is this borrowed?" had to ask the enum**, which meant
  possession questions and want questions went through the same field.
- **The merge engine resolved possession by rank**, taking the strongest single value — so
  merging a borrowed duplicate into an owned book silently dropped the borrowed copy.

Separately, the Phase 1 audit found two defects that this stage fixes because they are the same
model:

- **`scripts/seed-dev.mjs` never wrote `ownership` at all.** All 290 seeded books took the
  column default — `'unset'` after ownership-v2 — so every one failed the in-hand gate and all
  three Owned·format shelves rendered empty over a library of 290 real books. No test asked how
  many books were on a shelf, so nothing was red.
- **A DNF book you never owned was invisible.** Not in hand, not read, so outside
  `inDefaultLibrary` and reachable only through the wishlist chip.

## Target model

```
ownership ∈ { 'owned', 'unowned' }        default 'unowned'
flags:  owned_physical ('paperback' | 'hardcover' | 'yes' | null)
        owned_ebook, owned_audiobook, borrowed, wishlist
```

Five independent signals. **All combinations legal; no constraint prevents unusual ones.**

Suppress-not-clear survives, rekeyed: format flags persist through possession changes, and the
gate in `bookOwnedFormats` moves from `isPossessed` reading an enum to `isPossessed` reading
`ownership === 'owned' || borrowed`. Same set of books, different derivation.

`possessionState()` / `possessionPatch()` are the derived four-state WORD and its inverse, for
controls and badges that must show one answer. Views, never stored.

## Migration mapping

| old        | new                                    |
| ---------- | -------------------------------------- |
| `owned`    | `ownership='owned'`                    |
| `borrowed` | `ownership='unowned'`, `borrowed=true` |
| `wishlist` | `ownership='unowned'`, `wishlist=true` |
| `unset`    | `ownership='unowned'`, no flags        |

**No row loses meaning.** Checked before applying:

- `borrowed → unowned + borrowed=true` — borrowed was never owned (`isOwnedBook` already
  returned false for it) and stays in hand (`isPossessed` still true). Nothing that read the old
  value reads differently.
- `unset → unowned` — `'unset'` was **already the column default**, and the only consumer that
  distinguished it from other non-owned states was the fourth button of the possession control,
  which maps 1:1 onto "unowned with no flags". Same information content under a name that
  matches the narrowed question. This is a rename of the no-claim state, not a collapse of two
  states — `wishlist` keeps its own flag.

## Union rules (merge / import)

There is no single "strongest" value any more, so each signal gets its own rule
(`mergePossession`):

- `ownership` — `'owned'` if **any** side owns a copy. A real copy never loses to a non-copy.
- `borrowed` — OR. A borrowed copy on either side survives.
- `wishlist` — OR, then **suppressed** if the merged record is owned or borrowed: a want the
  merge itself satisfied is no longer a want.

That last rule is what reproduces the old rank exactly. `ownership.test.ts` proves the
equivalence exhaustively — all sixteen ordered pairs of the four words merge to the same word
`strongerPossession` would have given. The new information is what the old model had to
discard: owned + borrowed now keeps both.

## Predicates

- `isPossessed` = `ownership === 'owned' || borrowed`.
- **New** `hasReadingHistory` = `isBookRead(b) || readStatus === 'DNF'` — visibility only.
- `inDefaultLibrary` = `isPossessed || hasReadingHistory`.
- `isBookRead` **unchanged**. It feeds series progress, the taste profile, stats and the matcher,
  where a DNF must not count as read.

All 15 `isBookRead` call sites were reviewed; none should see DNF. They fall in four groups:
series progress (`seriesShelf.ts` ×3, `readingOrders.ts` ×2), taste (`tasteProfile.ts`,
`tasteEval.ts`, `matcher.ts` ×2), stats and facets (`filters.ts` ×2, `MoodRoute`, `TropeRoute`),
and library scope (`filters.ts:inDefaultLibrary`) — the only one that wanted DNF, which is why
it got a separate predicate rather than a widened `isBookRead`.

## Seed

`source` (provenance) → possession, at seed time only, since provenance is all the seed carries.
Only two values exist in `data/personal_seed.json`; an unrecognised source claims nothing.

| source × format             | rows | → possession                      |
| --------------------------- | ---: | --------------------------------- |
| Owned × Paperback           |  148 | owned, `physical='paperback'`     |
| Owned × Hardcover           |   42 | owned, `physical='hardcover'`     |
| Owned × Audiobook           |   20 | owned, `audiobook`                |
| Owned × Kindle Unlimited    |    3 | owned, `ebook`                    |
| Borrowed × Kindle Unlimited |   65 | unowned + `borrowed`, `ebook`     |
| Borrowed × Audiobook        |   12 | unowned + `borrowed`, `audiobook` |

Resulting shelves: **physical 190, ebook 68, audiobook 32**; 213 owned, 77 borrowed, 290 in hand.

Two notes on what this does **not** produce:

- **No wishlist rows.** The seed carries no wanting signal, and inventing one would falsify a
  file of 290 real books. Stage A has no wishlist shelf, so nothing is left untested; when one
  exists it needs a fixture, not a fabricated seed.
- **The DNF fix is invisible on seeded data.** All four DNF books are `source` Owned or
  Borrowed, so after the seed writes possession they reach the library through `isPossessed`
  and the read-status leg never runs. `shelf-membership.spec.ts` therefore builds its own
  unowned DNF book — the only fixture in the set that is not in hand.

## Out of scope (stage A)

Breakdown toggles (format, DNF), Borrowed/DNF pills, any shelf UI, profile columns for the
toggles. `/library`'s Zustand store stays as it is.

## Acceptance

- Migration round-trip verified against a copy of dev data: counts per state before and after,
  every row landing in a representable combination.
- Full gate (lint, typecheck, unit, build) + the standing e2e run.
- The migration is **not** deployed from this branch — prod runs from `main` after merge through
  `pnpm deploy:migrations`.

## Completion report

See the branch's PR body.
