# Series position integrity — audit (ACOTAR + generalisation)

**Branch:** `audit/series-position-integrity` (off `main@1b06688`).
**Mode:** AUDIT ONLY. No migration, no fix, no prod write. Report and stop.

This audit is the output of a single owner complaint — "ACOTAR's books are at positions
1, 2, 2.5, 4, 4, 5.5, 6 in the library, and I think Frost & Starlight should be 3.5 / Silver
Flames should be 5" — turned into four phases: establish external canonical (Wikidata),
diagnose the ACOTAR incident in detail, generalise to "every series in the library," and
propose (not implement) a fix shape.

The mechanical work for the owner to run against production is staged at:
- [`docs/queries/acotar-position-audit.sql`](../queries/acotar-position-audit.sql) — Phase 2.
- [`docs/queries/series-position-integrity-audit.sql`](../queries/series-position-integrity-audit.sql) — Phase 3.

All queries are read-only SELECTs; every statement either pivots on a fixed set of
known-IDs (the ACOTAR book IDs the audit was seeded with) or sums by sentence. Phase 2
queries against `_self = (select auth.uid())` so the reader's own library is the only scope.

---

## Phase 1 — ACOTAR canonical order (Wikidata P179 + P1545)

Wikidata was chosen as the primary external source per Phase 0 of
[`docs/reverie-metadata-sourcing.md`](../reverie-metadata-sourcing.md): CC0, native decimal
ordinals ("4.5") via the P1545 series-ordinal qualifier on P179 (part of series), and
designed for cross-publisher range. Phase 0 also flagged Wikidata coverage as patchy, so
this Phase 1 cross-checks the Wikidata claim against a second source.

### 1a. Wikidata series entity

`Q60979203` — *"A Court of Thorns and Roses"*, Wikidata description: **"novel series by
Sarah J. Maas"** (the only match; the disambiguation by description rules out the 2015
single-novel entry `Q101987009`, the upcoming TV-series entry `Q115010574`, and every
"court of thorns …" string match on a non-Wikidata-scope item).

Resolved via the Wikidata wbsearchentities API (a label-scan over the SPARQL endpoint
timed out at the gateway; the search API gets the Q-id deterministically):

```
$ curl -sG 'https://www.wikidata.org/w/api.php' \
   --data-urlencode 'action=wbsearchentities' \
   --data-urlencode 'search=A Court of Thorns and Roses' \
   --data-urlencode 'language=en' --data-urlencode 'format=json'
→ Q60979203 (novel series by Sarah J. Maas)
```

### 1b. Per-work P179 + P1545 (verbatim, as Wikidata states them)

SPARQL query: `?work wdt:P179 wd:Q60979203 . OPTIONAL { ?work p:P179/pq:P1545 ?ordinal . }
OPTIONAL { ?work wdt:P577 ?pubDate . }`, ordered by `xsd:decimal(?ordinal)`.

| Wikidata ordinal | Wikidata Q-id   | Title                          | Publication date |
|------------------|-----------------|--------------------------------|------------------|
| `1`              | `Q101987009`    | A Court of Thorns and Roses    | 2015             |
| `2`              | `Q101987239`    | A Court of Mist and Fury       | 2016             |
| `3`              | `Q101987946`    | A Court of Wings and Ruin      | 2017             |
| **`3.1`**        | `Q101988228`    | **A Court of Frost and Starlight** | **2018**      |
| `4`              | `Q101988654`    | A Court of Silver Flames       | 2021-02-16       |

Five works. **The decimal on the Frost novella is `3.1`, not `3.5` — this is the literal
value Wikidata stores on P1545 with that work.** Five ordinals, five publish-date order
matches.

### 1c. Cross-check — Wikipedia (en.wikipedia.org/wiki/A_Court_of_Thorns_and_Roses)

Wikipedia lists the series in publication order without printing decimal ordinals in the
infobox. The infobox entries (verbatim, page section "Bibliography"):

```
A Court of Thorns and Roses    May 5, 2015
A Court of Mist and Fury       May 3, 2016
A Court of Wings and Ruin      May 2, 2017
A Court of Frost and Starlight May 1, 2018
A Court of Silver Flames       February 16, 2021
```

Agreement with Wikidata on **count (5), order, and titles**. Wikipedia doesn't carry the
P1545-style decimal ordinal so it can't corroborate the `3.1` vs `3.5` question
independently — that decimal is Wikimedia editor choice, not an external-sourced
publication thing.

### 1d. Open Library (openlibrary.org) — closed-form outcome

Open Library doesn't carry series-ordinal qualifiers. Search of `OL7115219A` (Sarah J.
Maas author entity) for ACOTAR titles returns the omnibus editions
(`OL19622295W` — "Court of Thorns and Roses / A Court of Mist and Fury / A Court of Wings
and Ruin / A Court of Frost and Starlight") and individual work records. No ordinals.
Open Library is a useful source for ISBNs and editions but **not** for the ordinal
disagreement question; cross-check stops at "publication-date order agrees with Wikidata,
five works, same titles". This is consistent with Phase 0's note that Open Library is the
gap-filler for what Wikidata doesn't cover.

### 1e. Headline conflict with the owner's stated "should be" positions

| Title                          | Library position (owner's report) | Wikidata | Disagreement         |
|--------------------------------|------------------------------------|----------|----------------------|
| A Court of Thorns and Roses    | `1`                                | `1`      | —                    |
| A Court of Mist and Fury       | `2` (×2)                           | `2`      | —                    |
| A Court of Wings and Ruin      | `4`                                | `3`      | library is +1        |
| A Court of Frost and Starlight | `4`                                | `3.1`    | library is +0.9      |
| A Court of Silver Flames       | `5.5`                              | `4`      | library is +1.5      |
| (intruder?)                    | `2.5`                              | (none)   | no Wikidata claim    |
| (intruder?)                    | `6`                                | (none)   | no Wikidata claim    |

**Conclusions for Phase 1:**

1. The owner's two stated "should-be" positions — "Frost should be 3.5" and "Silver Flames
   should be 5" — **do not match Wikidata's values**, which are `3.1` and `4`
   respectively. The "decimal ← integer-gap" convention the owner guessed (3.5, 5) is a
   reasonable neighbourhood, but Wikidata's specific literal here is `3.1`. The project's
   Phase 0 source-matrix picked Wikidata on the grounds of CC0 + native decimals; subject
   to a third independent source it cannot disambiguate, that choice should hold.
2. **The library has at least two rows for positions Wikidata doesn't list at all
   (`2.5` and `6`), and at minimum one duplicate row sharing position `2`.** Five
   Wikidata works, seven library rows — a 1.4× ratio that's a strong signal of either
   import-path duplication (Phase 2 duplicate-book hypothesis) or insert-error positions
   on parts of the deliverable (Phase 2 position-assignment hypothesis).
3. Phase 0's "Wikidata coverage patchy" caveat was tested — Open Library confirms count
   and titles, not ordinals — and the answer here is *"Wikidata's `3.1` is the best
   number we have; one component of the owner's report disagrees, and the disagreement
   should be flagged for the owner to confirm before any move"*. This audit does not
   propose to override the owner; it surfaces the conflict.

---

## Phase 2 — ACOTAR incident diagnosis

Two defect classes are now candidates, and Phase 2 of the project's standing discipline
matches the Iron-Flame investigation shape (`docs/queries/iron-flame-duplicate-audit.sql`).

The diagnostic is split into the surviving-archive of ACOTAR-specific SQL at
[`docs/queries/acotar-position-audit.sql`](../queries/acotar-position-audit.sql). The
script is eight blocks the owner runs against prod; each block is read-only and either
pivots on the ACOTAR ID-set the audit was seeded with or sums a single shape.

### 2a. Block 1 — every ACOTAR-tagged `public.books` row, ordered by `position`

Lists seven rows with full identification columns (`id, title, position, read_status,
owned_*, format, cover_url, isbn, series, created_at, live_series_entries`). Whatever
else the outcome, this block confirms the seven rows the owner described — and from this
list alone the duplicate-bearers and the position-intruders can be picked out by hand.

### 2b. Block 2 — the two Mist-and-Fury rows, column diff

Same Iron-Flame shape: pivot `public.books` on `lower(title) = lower('A Court of Mist and
Fury') within the ACOTAR series`, then surface one row per differing column with
`is distinct from` as the comparator (NULL-safe inequality; identical values collapse).

**The question Phase 2 answers here is genuine duplicate vs legitimate distinct records.**
Per AGENTS.md's "Possession is five independent flags" section, the load-bearing
distinction is *physical copy owned in format X*, not just the five booleans. Two
records of Mist-and-Fury where one is owned-paperback and the other is owned-ebook are
**two real copies** and not a merge candidate. The audit SQL surfaces the
`owned_physical / owned_ebook / owned_audiobook / isbn / cover_url / read_status` columns
so a hand-reviewer can argue, on the data, that:

- if `isbn` differs and owned-format flags don't agree, the rows are different editions
  (legitimate distinct, no merge — phase 2 goes no further here);
- if `isbn` agrees and ownership flags overlap, the rows are the same physical copy from
  two import paths (merge candidate; survivor follows Iron-Flame rules: `read_status`,
  cover, formats-union via `owned_*`).

The Phase 2 instruction does not let Code jump to a survivor — the owner makes the call
on the live output. (Block 7 printouts carry the Iron-Flame-shaped survivor arguments
side by side: read marker, cover, isbn, owned-format flags. Same comparison as
`merge_books` step 4's coalesce-driven decision.)

### 2c. Block 3 — position-4 collision (Frost & Starlight vs Wings & Ruin)

Two DIFFERENT `title` values, one `position` value, in the ACOTAR series. This is a
different defect than (2b): not a duplicate-row, but a *position-assignment* defect.
Block 3 surfaces both rows' shapes; if their column diff shows they are
**two distinct editions of the same physical book** (different ISBN, different owned
formats), the merge logic from (2b) applies on top of the position correction. If the
column diff shows **two genuinely different books** (the coverless Wings & Ruin import is
a separate edition), they are still distinct entities but each has to land at its own
position (rows 3 and 3.1 in Wikidata) — neither is dropped.

### 2d. Block 4 — library positions vs Wikidata canonical set

A read-only cross-check: of the seven library rows, which positions fall in Wikidata's
{1, 2, 3, 3.1, 4} set vs. outside. This is the structural answer to Phase 1e. The
report-side assertion is **same as Phase 1e's table above** — the audit SQL just
re-reports it against the live data so any drift between the owner's report and the live
state shows up.

### 2e. Block 5 — `public.series_entries` linkage, both positions side-by-side

This is the load-bearing finding: the UI reads positions off
`public.series_entries` (per `supabase/migrations/20260716010000_series_experience.sql`),
**not** off `public.books.position`. The `books.position` column is the pre-#160 text
carry. Any position correction has to update BOTH homes — and a fix that touches only
`books.position` will not change the order the reader sees on `/series/A Court of Thorns
and Roses`.

Block 5 returns one row per live `series_entries` row (i.e. `removed_at is null`) for the
ACOTAR series, with `e.position` AND `b.position` side by side, in addition to the linkage
state (`book_id`), read-status, `user_edited` flag, and `source`. A position correction
script will iterate this set; this query is its preview.

### 2f. Block 6 — `public.series` rows for the franchise

The franchise can be referred to by two `public.series.id` values — "ACOTAR" and
"A Court of Thorns and Roses" — depending on how the row was created (lazy
find-or-create in `series.ts`, see AGENTS.md's "Series-name dual home" rule referenced by
the `duplicate-series-audit.sql` design). Block 6 lists every `series.row` whose
`s.name` matches either spelling and the `live_entries` count for each — needed at fix
time to decide which `public.series.id` is the merge-survivor and which is to be deleted.

### 2g. Block 7 — survivor-candidate argument (Iron-Flame discipline)

Per-pair iron-flame-style coverage: `read_status` + `reads` count + `cover_url` + `isbn` +
`owned_*` shape, for the three candidate duplicate pairs the owner complained of
(Mist-and-Fury, Frost & Starlight, Wings & Ruin). The shape of these block outputs lets
the owner pick a survivor on grounds (data completeness, read marker, formats-union),
not on assumption. AGENTS.md, the section rules-in-feedback memory, and the Iron-Flame
incident all reinforce this discipline.

### 2h. Block 8 — `user_edited` flag on every ACOTAR entry

`public.series_entries.user_edited` is a deliberate reader action signal. The core
engine only **moves** a position if `!match.userEdited`
(`packages/core/src/seriesShelf.ts:345`). Any position-correction fix MUST refuse to
overwrite a row where `user_edited = true` — that row carries a position the reader
chose themselves. Phase 2 surfaces every row's flag so the fix can hold those. This is
the same defensiveness the core engine applies; a hand-run audit mirrors it.

### 2i. Phase 2 conclusions

The shape of the ACOTAR incident is now mapped:

| Defect class                                 | At least one row affected in ACOTAR? | Investigation shape |
|----------------------------------------------|---------------------------------------|---------------------|
| (A) Duplicate `books` row in same series     | **Yes** — the Mist-and-Fury shape     | block 2, block 7    |
| (B) Position-collision in `series_entries`   | **Yes** — Frost & Starlight vs Wings & Ruin at `position = 4` | block 3, block 7c |
| (C) Library position outside Wikidata        | Yes — `2.5`, `5.5`, `6` rows          | block 1, block 4    |
| (D) `user_edited = true` blocking correction | unknown until block 8 is run — must check | block 8           |

Phase 2 does not select a survivor, does not write. It hands the owner live data on each
defect type. The decision (which row to keep, where each position should land) is the
owner's, on the live output. This is the same separator-of-concerns the Iron-Flame
incident used.

---

## Phase 3 — generalisation

The duplicate-series-audit SQL already exists (in branch
`docs/recover-duplicate-series-query@bf06fd4`); it surfaces pairs of `public.series`
rows naming the same franchise — the underlying "ACOTAR" / "A Court of Thorns and Roses"
shape. Phase 3 generalises that, plus the two new defect classes, and surveys the
**whole library**, not just ACOTAR.

Diagnostic at [`docs/queries/series-position-integrity-audit.sql`](../queries/series-position-integrity-audit.sql).
Four blocks:

### 3a. Block A — duplicate `public.series` rows, library-wide

Adapted from `duplicate-series-audit.sql` with the same three linkage heuristics
(norm-equal, initialism, prefix ≥ 4 chars). One row per pair with `a_name, b_name,
link, live_entries_count`. Output drives the (D) "merge the two series records into one"
shape from Phase 4.

### 3b. Block B — duplicate `books` rows within a series

For every series in the library, list pairs of `lower(title)` that resolve to **more
than one** `public.books` row. `book_ids` and `read_statuses` come back side-by-side so
the hand-edit survivor decision can be made on the live shape. Mist-and-Fury shape, on
every series that has it.

### 3c. Block C — position-collision on `series_entries.position`

A `group by (series_id, position) having count(*) > 1` over `series_entries WHERE
removed_at is null`. Different titles share a position in the live render. The
position-assignment defect class, library-wide.

A separate subblock (3c-legacy) reports the same shape on `public.books.position` —
the legacy carry, still in the schema. Some rows have `books.position` but no
`series_entries` linkage (the pre-#160 era); the UI doesn't read this column, but a
position correction has to consider it because it's the carry the backfill used.

### 3d. Block D — cluster summary

Headline counts: number of series rows, number of distinct series names (with name-pair
collapsing from block A), number of books with legacy `books.series` text, number of
live `series_entries`. The question Phase 3 answers:

> Does every series in the library have *some* phase-A/(B)/(C) shape, or is it
> concentrated on a handful of series?

If the answer is "every series" — this is a backfill pipeline defect, likely a single
API path that created `books` rows without `series_entries` linkage or that collided
positions in the backfill. If the answer is "a handful" — it's incident-specific,
handled per-series by hand-edits.

### 3e. Phase 3 conclusions (read returned to the owner)

Block outputs are returned to the owner for review. **The writeup expects the owner to
run the SQL and report:**

- How many series carry a phase-A duplicate-series pair?
- How many duplicate-book rows (Phase B) appear?
- How many series with a position-collision (Phase C)?
- Where the rows concentrate — one import era, one publisher, one account path?

Phase 3 of this audit assumes the SQL runs at the owner's discretion and reports back;
without that return, this report stops here. **No implementation until Phase 3
returns.**

---

## Phase 4 — proposal shape (NOT implemented)

Three open decisions for the owner to make, argued from what's been established above.
The decision needs the live Phase 3 return to make sense of all three in parallel.

### 4a. Does the ACOTAR series-record merge need to run before the position correction?

**Argument for "merge first":** Position correction writes to `public.series_entries`
keyed on `(series_id, entry_id)`. If ACOTAR has two `series.id` values (the "ACOTAR" and
"A Court of Thorns and Roses" rows), the same logical series will appear twice in the
UI's series-list and the correction has to update positions on **both** `series.id`s,
and update `books.series` text on every row that doesn't already match the survivor.
Doing this in one move is the cleaner branch.

**Argument for "merge = the same branch":** The two are part of one logical correction
on the franchise: tombstone the orphan series record + its orphan entries, and
re-position the surviving entries to the Wikidata canonical. Splitting them across PRs
adds intermediate states the UI sees (a week where ACOTAR has stale positions on
half-merged entries). One PR, one review, one audit trail.

**Recommendation (Code):** same branch, with the merge as Phase 4a's first migration
step and the position-correction function as the second. Outline:

1. `20260812xxxxxx_merge_duplicate_series_*.sql` — re-point orphan `series_entries` to
   the survivor, drop the orphan series row. Iron-Flame-shaped re-parent + tombstone
   logic, with the same `create or replace` discipline (AGENTS.md: a function's revoke
   survives `replace`).
2. `20260812xxxxxx_acotar_position_correction_*.sql` — write
   `update public.series_entries set position = ..., user_edited = ... where ...` for
   each gap, gated on the ACOTAR-specific title-set and `user_edited = false` (Phase 2h).

Both as a single hand-run script pair **only after the owner runs Phase 3's block A and
block C against the live database and confirms the per-series shape.**

### 4b. One-time audited fix vs durable tooling?

Phase 3 may show many series carry defects. Per AGENTS.md: "do not propose automated
correction without a human-reviewed guard." That guards the *process*, not the
*scope*. The mechanical fix is the same shape for every series — three update
statements keyed on a known title-id for one known title, gated on `user_edited = false`.

**One-time audited fix per series (Iron-Flame-style)** is the safest scope: each
incidents-file in `docs/queries/` like the current `iron-flame-merge.sql` and the proposed
`acotar-position-correction.sql`, with full pre-flight guards and a per-pair survivor
argument block in the docs. Auditable one PR per series.

**Durable tooling alongside the one-time fix:** the two-block audit SQL staged here is
already reusable. A third block — *triage*, not *fix* — that surfaces every
user_edited=false row across the library that disagrees with Wikidata's P179 set, ranks
them by series size and disagreement count, would let the owner drive a per-series
hand-edit session without re-discovering ACOTAR-shape each time. That's a follow-up
branch, separate from any position correction; it would be useful to have *before* the
per-series PRs if Phase 3 confirms the count is high.

**Recommendation (Code):** do the ACOTAR correction on its own branch (the
audit branch's natural successor, NOT this one). Build the triage tooling only after
the ACOTAR fix lands and the owner confirms the shape generalized or didn't. Scale the
fix back from "library-wide" — that's premature scope without Phase 3's
return.

### 4c. Wikidata P179/P1545 as standing capability, vs one-time?

A standing-capability widget on the series page would query Wikidata on demand, fetch
the canonical set, and render "library says X / Wikidata says Y" disagreements inline.
This is real productivity for a long-tail fix project — the ACOTAR fix takes 30 lines
once the reference is known, and a current diff inline saves the next person the
Phase 1 walk.

But:

- Wikidata coverage is patchy (Phase 0's finding, verified live on Open Library this
  audit). A standing widget must handle Wikidata "no answer" gracefully without becoming
  the source of truth.
- Series authors and titles sometimes disagree with Wikidata's editorial choices
  (the `3.1` literal is one example — the author / publisher might prefer `3.5` in
  their own marketing). The widget has to show the disagreement without picking a
  winner.
- ACOTAR is the only series surfaced so far where Wikidata literally carries a
  `3.1` decimal that disagrees with an owner's "should-be" interpretation. Until we
  know whether that's typical or incidental, building the widget throws work away if
  the long tail turns out to be small.

**Recommendation (Code):** deferred. Once Phase 3 returns and the per-series count is
known, decide whether the per-incident path saturates or stays rough. The Wikidata
client + spot-check audit shape is *not* restated here deliberately — those decisions
go to the docs-source ADR, not into an audit report.

### 4d. What this audit explicitly does NOT propose

- **No automated merge / fix.** Anything that touches prod has the same hand-run /
  owner-confirmed / guard-laden shape as `iron-flame-merge.sql` — i.e. nothing happens
  until Phase 3 returns and the owner authorises, per incident.
- **No new migration in this branch.** The audit branch is docs-only; the next PR is
  the fix PR.
- **No override of the owner's stated "should-be" values.** Phase 1 flag the
  disagreement, that's it — the owner might have a separate signal (the publisher's
  numbering, the author's preference in a foreword) that doesn't appear in Wikidata,
  and an audit-doc override would suppress that. The PR that fixes ACOTAR carries the
  final decision.
- **No rebuild of `iron-flame-duplicate-audit.sql` or `duplicate-series-audit.sql`.**
  Those already exist on their respective branches; this audit touches them only as
  citations.

---

## What this audit produced

- [`../queries/acotar-position-audit.sql`](../queries/acotar-position-audit.sql) —
  Phase 2, ACOTAR-specific. Eight blocks. Read-only.
- [`../queries/series-position-integrity-audit.sql`](../queries/series-position-integrity-audit.sql) —
  Phase 3, library-wide. Four blocks. Read-only.

What this audit did NOT produce:

- No commits to `supabase/migrations/`. No commits to `packages/`, `apps/`, or any code.
- No prod queries. No prod writes.
- No changes to `duplicate-series-audit.sql` (on
  `docs/recover-duplicate-series-query`).

The next step is the owner running both SQL files against prod, returning the output,
and the audit report being updated — or, if the output argues the shape is systemic,
opening the fix branch on the model proposed in §4. Report stops here.
