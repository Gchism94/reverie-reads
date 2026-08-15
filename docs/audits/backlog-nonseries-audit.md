# BACKLOG audit — the 19 non-series entries

**Branch:** `docs/backlog-nonseries-audit`. **Mode:** AUDIT ONLY — no code changed, nothing struck
in BACKLOG.md. Findings here; what to batch is a separate decision.

PR #233 audited the 8 series-data-integrity entries in **Real bugs, outstanding** and explicitly
left the other 19 alone, recording their state as unknown. This is that pass, same methodology: read
the entry as literally worded, then check the file/function/RPC it names **as it exists now**.

## Result

| outcome                            | count  |
| ---------------------------------- | ------ |
| **Already fixed** — entry is stale | **2**  |
| **Genuinely still open**           | **16** |
| **Doesn't exist as described**     | **1**  |

Two of the 16 need a **product decision** rather than a code fix, and are called out separately
below. One "already fixed" entry is fixed **in the part it names** but the check surfaced a narrow
residue it never covered — recorded rather than folded into either bucket silently.

Line numbers are `main` at the time of writing.

---

## Already fixed (2)

### L128 — "Every `security definer` RPC in the repo is anon-callable" — **FIXED, with a residue**

Closed by **`9f338d9`** (2026-07-29, #110), which is the migration the entry itself proposes:
`20260801010000_revoke_public_execute.sql` revokes `execute … from public` on `merge_books`,
`remove_series_entry`, `set_book_contributors`, `similar_books`, `vibe_books`, `taste_centroid`,
`taste_calibration` and others. Verified on the local stack — both functions the entry names by
`proacl` now read `{postgres=X/postgres,authenticated=X/postgres}`, with the empty-grantee PUBLIC
entry gone.

**The residue, found by cross-checking rather than by reading the entry.** Querying `pg_proc` for
_every_ `security definer` function in `public` still carrying `=X/` returns **two**:

| function             | proacl                              | returns   | named in `20260801010000`? |
| -------------------- | ----------------------------------- | --------- | -------------------------- |
| `bump_club_activity` | `{=X/postgres,postgres=X/postgres}` | `trigger` | no                         |
| `handle_new_user`    | `{=X/postgres,postgres=X/postgres}` | `trigger` | no                         |
| `set_updated_at`     | `{=X/postgres,postgres=X/postgres}` | `trigger` | no                         |

> **CORRECTION (2026-08-15).** Two errors above, both mine. **(a) There are three, not two** —
> `set_updated_at` also carries PUBLIC execute; the query filtered on `prosecdef` and that one is not
> `security definer`, so the audit's own predicate hid it. **(b) It needs no decision.** The
> framing below ("worth a decision on whether the convention covers trigger functions") is wrong:
> the decision was taken and written down at the time. `20260801010000`'s commit message names all
> three and records the check — calling one raises _"trigger functions can only be called as
> triggers"_, a hard Postgres restriction independent of any grant, confirmed as superuser so no
> grant could have been the reason. A deliberate exclusion, not an oversight. I had not read the
> commit message before writing this section.

**Not an exposure**: PostgREST does not expose functions returning `trigger` as RPCs, so neither is
reachable the way `remove_series_entry` was. But the entry asks for "a convention for new ones", and
the convention is not uniformly applied — these two were simply never in scope. Worth a decision on
whether the convention covers trigger functions at all, not an urgent fix.

⚠️ Local `proacl` is **not** evidence about production. L96 (below) records a platform-side bulk
grant that re-added `anon=X` to all 17 functions in prod for days, invisibly. That check is still
unrun.

### L360 — "Swallowed Supabase errors" — **FIXED**

Closed by **`0e8d4ef`** (2026-07-28, #92). Both halves:

- `a11y.spec.ts` imports `authFailure` and `ok`/`okData`/`okUser`, and its sign-ins now read
  `if (error || !data.session) throw new Error(authFailure(context, DEV_EMAIL, error))`. The file
  carries a comment describing the exact `.data.user!.id` defect the entry names.
- `scripts/seed-dev.mjs:265` now reports `describeSupabaseError(e)` rather than `Seed failed: {}`.

---

## Doesn't exist as described (1)

### L479 — `useConfirmedLookup` — **NOT A DEFECT**

This entry describes no bug. It is a **convention note** — _"the established pattern … use it rather
than reinventing per route"_ — recording what `fix/state-pills-flake` established, why
`ShelfRoute`/`MoodRoute`/`TropeRoute` needed it, and why `SeriesRoute` is explicitly not a candidate.
The hook exists at `apps/web/src/hooks/useConfirmedLookup.ts:38` and behaves as described.

It is filed under **Real bugs, outstanding**, where a reader scanning for work will keep re-reading
it as one. It belongs in a conventions section, not this one. **No code action.**

---

## Genuinely still open (16)

Each verified against source, not taken from the description.

| #    | entry                                                  | verified at                                               | note                               |
| ---- | ------------------------------------------------------ | --------------------------------------------------------- | ---------------------------------- |
| L55  | six `sameRiskAsPowerSymbol` glyphs unconverted         | all six still literal in source                           | description drift — see below      |
| L67  | `a11y.spec.ts` 600s timeout, one occurrence            | watch item                                                | **no recurrence** — see below      |
| L79  | Supabase MCP reaches only project "Steppe"             | environment                                               | unverifiable from here — see below |
| L96  | production ACL verification not in the deploy protocol | `DEPLOY.md` — **0** mentions of `proacl`                  |                                    |
| L116 | `db push`'s own prompt takes EOF as yes                | `deploy-guard.sh` — no `--yes` anywhere                   |                                    |
| L341 | `scrollRestoration` unconfigured                       | `router.tsx:61` — `createRouter({ routeTree })`           |                                    |
| L347 | search text lost on back-navigation                    | `TropesRoute.tsx:18` — `const [q, setQ] = useState('')`   |                                    |
| L351 | `/shelves` `openListId` lost                           | `ShelvesRoute.tsx:360` — `useState<string \| null>(null)` |                                    |
| L354 | `/library` filters in a module-level store             | `filterStore.ts:34` — `create<FilterState>`               | **product decision**               |
| L365 | `apps/web/e2e` outside `tsc`                           | `apps/web/tsconfig.json:9` — `["src", "vite.config.ts"]`  |                                    |
| L381 | `cleanup()` sequential chain hides later steps         | `a11y.spec.ts:231` — still a bare `await` chain           | deliberate deferral                |
| L403 | restore guardrail — no warning on a non-empty library  | no pre-restore count check found                          | **product decision**               |
| L407 | flash of the wrong mode on a fresh device              | `index.html:45` — falls back to `'system'`                |                                    |
| L439 | `OwnedCopies` write-clobbering                         | `scopeBookId` exists in `books.ts:65`, routed nowhere     | two defects, not one               |
| L453 | `ProgressSlider` writes twice per release              | `BookDetailRoute.tsx:100-101` — both handlers mutate      |                                    |
| L459 | `useRealtimeRefetch` covers only clubs + shared lists  | only `ClubRoute:49`, `SharedListRoute:77`                 |                                    |

### Three that need a note beyond "still open"

**L55 — the entry's own inventory has drifted.** All six glyphs are still literal, so the defect
stands. But two of its component attributions are now wrong: `⌘` is in `auth/landing/Mockup.tsx`,
not AppShell's nav; and `⠿` is in `routes/ShelvesRoute.tsx` as well as `SeriesArranger`. Anyone
working from the entry's list would miss a site. `⌂` in AppShell is correct.

**L67 — the watch item has evidence now.** The entry records one 600s `waitForLoadState` timeout and
asks for a second occurrence to confirm it as a defect. Across this session the full e2e suite ran
**six times** plus a three-way project split, all green, with no recurrence. That is not proof of
absence, but it is the strongest counter-evidence the entry has ever had and belongs in it.

**L79 — unverifiable from here, by design.** Checking which project the Supabase MCP reaches means
calling it, and the entry's own conclusion is that Reverie production reads are the owner's to run,
not Code's. Re-verifying it would be the thing it warns against. It stands as a recorded environment
constraint until the connection is repointed.

---

## Needs a product decision, not a fix (2)

Neither belongs in the fixed or open bucket as work-to-schedule — each is blocked on a call only the
owner can make.

**L354 — `/library` filters, sort and mode in a module-level Zustand store.** The entry is explicit:
_"Moving it to the URL needs a store-vs-URL precedence decision first — what wins when both exist."_
The code question (move state to search params) is downstream of that answer. Note this is the only
one of the four state-persistence entries (L341/347/351/354) in that position — the other three have
an obvious right answer and are ordinary work.

**L403 — restore guardrail.** _"Warn with real counts before it happens"_ is a UX design question:
what the warning says, when it interrupts, and whether it can be dismissed. The entry also records a
decision already taken — merge-routed restore stays blocked, because trading a visible duplicate for
a silent loss is the wrong direction — so the remaining question is the warning's shape.

**Borderline, called out rather than filed:** L381 (`cleanup()`'s sequential chain) is deferred on an
engineering trade-off the entry states — a resilient cleanup reports three failures instead of
stopping at the first — not a product question. Left in the open bucket.

---

## What this pass did not do

- **No code changed, no BACKLOG entry struck.** Unlike PR #233, which struck four entries in the
  same pass, this one reports only — the batching decision comes after.
- **L79 was not re-verified**, for the reason above.
- **Production `proacl` was not read** (L96), so the two `security definer` trigger functions above
  are a statement about the local stack only.
