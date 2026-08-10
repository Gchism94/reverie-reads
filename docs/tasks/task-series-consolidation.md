# Task — series consolidation

Referenced by `docs/tasks/task-series-integrity-mechanism.md` § Phase 4 before it existed as a
file. Created 2026-08-09 to hold the first confirmed case, so it stops living in a branch's
commit messages. **This is a holding file, not a plan.** The three-outcome decision table
(same / distinct / related-but-separate) that Phase 4 names as this task's actual content has not
been designed yet, and nothing here should be run until it has.

## Why the task exists

The library holds 23 `public.series` rows against what may resolve to far fewer real series
(Block D of the series-position-integrity audit). Some pairs are one series written two ways;
some are genuinely distinct; some are related but separate (a spin-off, a companion sequence).
Those three outcomes need different actions, and telling them apart is a judgement call that
looks identical in the diff whichever way it went — which is the whole reason it needs a decision
table and owner review rather than a merge heuristic.

## Filed cases

### 1. ACOTAR — `aa4e251e` vs `2bec23ba` (confirmed real, 2026-08-09)

Two `public.series` rows under one owner for one franchise:

| series id  | name                          | created    | live entries | tombstones |
| ---------- | ----------------------------- | ---------- | ------------ | ---------- |
| `aa4e251e` | `A Court of Thorns and Roses` | —          | 5 (post-fix) | 2          |
| `2bec23ba` | `ACOTAR`                      | 2026-08-04 | 1            | 0          |

`2bec23ba` holds exactly one live entry: **"ACOTAR 6", a legitimate ghost slot for the unreleased
sixth book.** Confirmed via `docs/queries/acotar-followup.sql` against production. It is **not**
"A Court of Wings and Ruin" filed under a variant series name — that was the competing reading,
and ruling it out is what let the position correction proceed as a position fix rather than a
series-identity fix.

So this is a **name-variant split of one real series**, not two series: same franchise, same
owner, one row holding the catalogued books and the other holding a forward-looking ghost.

**Deliberately not fixed by `fix/acotar-position-correction`.** That branch staged
`docs/queries/acotar-fix.sql`, which corrects positions inside `aa4e251e` only and asserts in its
post-run audit that `2bec23ba` was left untouched (one live entry, zero tombstones). Consolidating
the two rows is this task's job, under its decision table.

**One consequence to carry into that work, so it is not discovered afterwards:**
`acotar-fix.sql` sets `aa4e251e`'s `series.length` to 5 — five books in the main sequence, the
ruled order being 1, 2, 3, 3.5, (4 vacant), 5. If "ACOTAR 6" is later merged in as a sixth slot,
`length` has to be revisited in the same operation, or the series will carry a slot beyond its own
stated length. Whether an unreleased book should count toward `length` at all is an owner
question, not a derivable one.

Also visible in that fix's post-run audit A2: `set_series_order`'s length sync matches member
books by series **name**, so any book whose `series` string reads `ACOTAR` rather than
`A Court of Thorns and Roses` keeps its old `series_count`. That is this fragmentation showing up
as stale data on the book rows, and it resolves when the rows consolidate — not before.

## Standing

Same discipline as every other data-integrity task here: no production writes from a Code session.
A consolidation is proposed as a staged, guarded incident file under `docs/queries/` and run by
the owner by hand after review. A claim about which series a book belongs to is a claim about the
world and needs a source, not a guess — and a split the sourcing cannot resolve comes back to the
owner as a flagged question rather than being self-resolved.
