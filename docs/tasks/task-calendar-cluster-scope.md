# Planned task scope — the Calendar cluster

Status: **planned, not active**. The sparse calendar pass shipped in PR #344; revalidate the
remaining route, density, mobile, and heatmap decisions against current `main` before building.

**Status:** scoping only. No implementation, no mockups. The output of this document is the decision
list at the end.

`docs/backlog/BACKLOG.md`, under **Parked design conversations**, lists "Calendar cluster". This
document is the attempt to unpark it, which means naming what has to be decided before anything is
built — not proposing a design.

---

## 0. Base check — four things in the framing brief do not survive contact with `main`

Verified at `c999ae4` (post-#305/#306/#307/#308/#309). None of these change whether the cluster is
worth doing; all four change what it starts from, so they are stated before the scope rather than
discovered inside it.

| Claim in the brief                                                          | What `main` actually shows                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "the Surface migration (4 call sites)"                                      | **3 call sites, and none of them is in the Calendar.** `PlannerRoute.tsx:18` (inside `Stat`), `:262` (inside `Releases`), `:300` (the route-header segmented control). Lines 25–215 — the entire Calendar tab — contain **zero** `<Surface>`.                                               |
| "It has had every systematic pass"                                          | True of the route. **Not true of the Calendar grid**, which reaches Surface only indirectly, through the shared `Stat` component it renders four of.                                                                                                                                        |
| "the mobile pass is the only genuinely open item in §8"                     | §8 of `skin-component-consistency.md` is **the radius-without-typography kit gap** — 25 badges + 7 controls blocked on an owner ruling about a fourth kit class. It is not about mobile, and the strings "mobile pass" / "Mobile pass" appear nowhere in `docs/backlog/` or `docs/audits/`. |
| "Same shape as `task-works-layer-scope.md` and `task-mobile-pass-scope.md`" | **Neither file exists** anywhere in the repo. The closest in-repo precedent for this shape is `docs/audits/surface-primitive-scope.md`, which this document follows.                                                                                                                        |

The first two matter most: **the Calendar's day cell has never been through a systematic pass at
all.** It is `aspect-square skin-tile border p-1 text-left disabled:cursor-default` plus two inline
styles (`:125`). And `.skin-tile` is, in full:

```css
.skin-tile {
  border-radius: var(--radius-card);
}
.skin-tile:focus-visible {
  outline: 2px solid var(--accent);
}
```

A radius and a focus ring. So the premise "every systematic pass except a bespoke design pass" is
too generous: the most repeated element on the page carries no skin material, and the question in
§6 below is therefore live rather than cosmetic.

---

## 1. What the Calendar is today, read off the code

`PlannerRoute.tsx`, 337 lines, `type Tab = 'calendar' | 'releases'` (`:13`), default `calendar`
(`:285`).

The Calendar tab renders, in order:

1. **Four stat tiles** — books this year (unique), reads including rereads, read all-time, planned.
2. **A month grid** — `‹ Month YYYY ›`, a 7-column `grid`, one `<button>` per day.
   - A day with data gets `background: var(--card)`; a day without gets `transparent` and is
     `disabled`.
   - Today gets `borderColor: var(--gold)`.
   - Inside each day: the date number, then **one 6px dot per read** (`--primary`) and **one 6px dot
     per plan** (`--violet`), wrapped.
3. **"Planned reads"** — a flat list of every book with a plan date, sorted by a local partial-date
   key, shown _below_ the grid and not scoped to the visible month.
4. **A day modal** — opens on clicking a day that has data; lists that day's Read and Planned books.

### The finding that shapes every question below

**There are no writes.** `grep` for `useUpdateBook | mutate | useMutation | supabase. | insert |
update(` across `PlannerRoute.tsx` returns **nothing**. Every interactive element in the Calendar —
day cell, planned row, modal row — ends in `openBook(id)`.

So the Calendar is a **read-only index into the book route**. Nothing can be logged, scheduled,
rescheduled or dragged here. Whatever else the cluster decides, it should decide this consciously,
because it is the difference between a visual pass and a feature.

---

## 2. What the Calendar is FOR (`FEATURES.md` Planner section)

> **Calendar** — reads logged by date, planned "need to read" dots, and counts both with and without
> rereads.

The copy commits to both halves, and the implementation delivers both — in **one grid**, separated
only by dot colour (`--primary` vs `--violet`).

The tension worth naming: **past and future are not symmetrical data.**

- A **read** is a fact with a precise date. It happened.
- A **plan** is an intention with _deliberately imprecise_ date support — `formatPartialDate` and the
  `planOrder` sort key both exist because `plan` is `{y, m, d}` with any part nullable. A plan of
  "sometime in March" is a first-class value.

A month grid is a shape that assumes precision. It renders a year-only plan nowhere at all (it has
no cell to land in), which is why the "Planned reads" list at `:151` exists as a separate, unscoped
list underneath — it is the escape hatch for the plans the grid structurally cannot show.

**That may be the actual design problem, and it is not a styling problem.** A grid of days is the
right shape for a record and the wrong shape for an intention, and the current screen resolves that
by showing both and then showing the intentions again in a list.

---

## 3. Calendar and Releases as tabs of one route

They are siblings in the UI and answer different questions:

|          | question                             | data                          | precision           |
| -------- | ------------------------------------ | ----------------------------- | ------------------- |
| Calendar | "when did I read / when will I read" | `reads.read_on`, `books.plan` | exact / partial     |
| Releases | "when does this arrive"              | `books.pub`                   | year / month / full |

`Releases` (`:214+`) is already a **three-band list** — Coming soon, Just released (≤120 days), then
past — not a calendar at all. It handles partial precision by _not_ using a grid.

Two readings, and the cluster has to pick one:

- **They are one thing** — "dates that matter to my reading" — and the tabs are an implementation
  detail that a redesign might dissolve.
- **They are two things** that happen to share a route, and the cluster should touch only the
  Calendar, leaving Releases as the already-working sibling.

Worth noting: Releases already demonstrates the answer to §2's problem. It renders imprecise dates
as _bands_, not cells. If the Calendar's plans want the same treatment, the pattern is in the same
file.

### The tab labels, per the existing audit

`docs/audits/skin-component-consistency.md` analyses `PlannerRoute:315` directly. Its conclusions:

- The tab ids `calendar` / `releases` are **class (b), app-authored strings** — the app chose them —
  not domain data.
- The hand-written `capitalize` on them is **fixing an identifier's casing**, not defending against
  `--control-transform`. The audit explicitly retracts PR #221's framing that called these "the
  sharpest evidence" for §8.
- The house style for app-authored micro-labels points the other way: **72 hand-written
  `uppercase tracking-[…]` labels** across the app.
- `ClubsRoute:74` already ships `.skin-control` _and_ `capitalize` together, and `.skin-control`
  wins — so that `capitalize` is **dead styling**, evidence nobody wrote these as a defence.

**Implication for the cluster:** if the tabs are restyled, `capitalize` on a lowercase `as const`
identifier is the wrong mechanism regardless of the visual outcome. Either the tuple carries display
labels, or the labels are authored separately from the ids. This is a small, real cleanup that the
cluster will touch whether or not it wants to.

---

## 4. The year heatmap — a live re-decision, not a revival

`docs/backlog/BACKLOG.md`, under **Deferred by decision, not forgotten**:

> Year heatmap. No longer sold by copy.

That is a deliberate removal with a stated reason: the copy stopped promising it. The reason is about
**marketing surface**, not about feasibility or value.

Unparking the Calendar reopens it, because a heatmap is the obvious answer to "show me a year" and
would otherwise get reinstated silently as a natural consequence of a redesign. Equally, honouring
the deferral silently would be honouring a reason that may no longer hold.

**This needs an explicit ruling, in either direction, before any design work.** The two failure modes
are symmetrical and both are quiet.

Relevant context for the ruling, not a recommendation:

- A heatmap answers §2's asymmetry cleanly for the **past** — density over a year is exactly what a
  record wants — and not at all for the **future**.
- The Calendar already computes year-scoped read data (`yearReads`, `uniqueYear` at `:60–61`), so the
  data side is present.
- A heatmap is 365 cells. §6 (what a day cell becomes) applies to it about fifty times over.

---

## 5. Density and the mobile case

The hard constraint is a 7-column grid at 390px: **≈50px per column** before gaps, and the current
cell is `aspect-square`, so ≈50px tall, holding a date number _and_ an unbounded wrapped row of 6px
dots.

The dot row has no cap. A day with eight reads renders eight dots inside a 50px box that also holds
the date. Nothing truncates, so the cell either wraps to several rows or overflows its square.

**What already exists:** `/planner` is covered by `route-viewport.spec.ts:267` in the `mobile`
project at 390×844, guarding page-level horizontal overflow. That is a _page_ guard — it would not
catch a day cell whose content overflows its own box without widening the page.

Because "the mobile pass" is not a tracked item (see §0), the question here is narrower than the
brief assumed: **does this cluster own the 390px behaviour of this route, or does it design at
desktop and leave phone to a later, separate pass?** There is no existing mobile-pass workstream for
it to defer to — so "leave it" means "leave it indefinitely", which is a real choice and not a
deferral.

---

## 6. What "skin-aware" means for a data-dense grid

The day cell is the most repeated element in the app outside a book grid: **28–31 per month view**,
and **×18** if the cluster changes it (9 skins × light/dark). A heatmap would make it ×365.

Today the cell carries a radius and a focus ring from `.skin-tile`, plus two inline styles. It has
essentially no skin character. Three broad directions, with costs:

- **Keep it neutral.** The grid stays a substrate; skin character lives in the surrounding chrome.
  Cheapest, safest across 18 combos, and arguably correct for dense data — but leaves the Calendar
  the least skinned screen in the app, which is what put the cluster on the parked list.
- **Give the cell skin material** (fill, border, ornament). Maximum character, maximum risk: the cell
  is where contrast is tightest, and every token that varies per skin has to work at 50px in nine
  palettes in both modes. This is the direction that most needs the contrast tests keyed off the
  `SKINS` registry, not the four-skin axe sweep.
- **Skin the _data_, not the container** — the dots, the today marker, the density ramp. Character
  without touching the 50px box. Untested as a pattern here; `--primary`/`--violet`/`--gold` are
  already doing this in an unconsidered way.

**The dots are the specific sub-decision.** One dot per event does not survive a heavy reading day at
390px, and it is the only encoding the grid has. Any redesign has to answer what replaces it — a
count, a density ramp, a cap with "+3" — and that answer is what determines whether the cell can be
skinned at all.

---

## 7. Constraints the cluster inherits

- **A redesign invalidates all 18 `surface-visual` baselines for `/planner`.** `/planner` is in the
  harness's route list (`surface-visual.audit.ts:141`); `MODES` × `SKINS` is 2 × 9.
  **One precision:** this harness is _deliberately_ not part of `pnpm e2e` — it is an opt-in
  `.audit.ts` with locally generated baselines under the gitignored `apps/web/audit-output/`. So the
  invalidation surfaces as **a manual re-baseline for whoever runs the audit**, never as a red CI
  check. It cannot "surface later as a red audit" on a PR, which is a reason to schedule the
  re-baseline deliberately rather than assume CI will remind anyone.
- **The harness needs ≥2 observations before it reports** (`MIN_OBSERVATIONS`), so a re-baseline is
  not a single run.
- **Contrast is registry-keyed.** Per `AGENTS.md`, the core contrast tests iterate `SKINS`, so all
  nine are checked; the axe sweep covers four skins × both modes. A new day-cell token must be
  guarded in a registry-keyed core test, because that is the exhaustive layer.
- **`prefers-reduced-motion`** applies to anything animated in a hover/selection state.
- **Nothing here is a data-model change.** `reads.read_on`, `books.plan` and `books.pub` all exist and
  are already read by this route.

---

## 8. Decisions

Each is a fork the cluster cannot proceed past. Options and costs; no recommendation.

### D1 — Is the Calendar a record, a plan, or both?

- **(a) Both, one grid (status quo).** No structural change; the styling pass proceeds directly.
  Cost: keeps the shape/data mismatch of §2 — imprecise plans have no cell, so the separate "Planned
  reads" list stays as a permanent escape hatch, and the screen keeps saying the same thing twice.
- **(b) Record only.** The grid becomes purely "what I read"; plans move somewhere that suits partial
  dates (a band list, as Releases already does). Cost: removes planning from the Planner's first tab
  — a copy and IA change, and `FEATURES.md` would need rewording.
- **(c) Both, two shapes on one screen.** Grid for the past, bands for the future. Cost: the most
  design work of the three; risks reading as two widgets stacked.

### D2 — Does the Calendar gain write actions?

- **(a) Stays read-only.** Honest to what it is now; the cluster is a visual/IA pass. Cost: the
  answer to "what can I do here that I can't elsewhere" remains _nothing_ — every path ends at the
  book route — and that is the strongest argument the screen is decoration.
- **(b) Gains plan-setting** (set/move a plan date from a day cell). Cost: a real feature — writes,
  optimistic update, offline-cache path, conflict with `user_edited`-style intent questions; and drag
  is a mobile problem at 50px.
- **(c) Gains read-logging** ("I finished this today"). Cost: overlaps the existing reread-log entry
  points; needs a ruling on where the canonical logging surface is, or it becomes a second one.

**D2 gates D1's value.** Under (a), D1 is a layout question. Under (b) or (c), the grid becomes an
interaction surface and §6's cell sizing becomes a touch-target question (24px minimum, 44px AAA).

### D3 — Does the cluster treat Calendar and Releases together?

- **(a) Calendar only.** Smallest blast radius; Releases is already coherent. Cost: two tabs of one
  route drift further apart visually.
- **(b) Both, as one "dates" surface.** Coherent result; may dissolve the tabs entirely. Cost:
  significantly larger, and re-opens a working screen.
- **(c) Both, styled consistently but structurally untouched.** Middle cost; no IA change.

### D4 — The year heatmap: reinstate or keep deferred?

- **(a) Keep deferred.** Costs nothing now. **Requires re-affirming a reason that was about copy, not
  value** — if the reason no longer holds, this quietly preserves an outdated decision.
- **(b) Reinstate as part of the cluster.** Answers "show me a year" and suits the record half of D1.
  Cost: 365 cells inherit every §6 answer; needs its own 390px story; and it is only coherent if D1
  lands on (b) or (c).
- **(c) Reinstate as a separate, later decision.** Keeps this cluster small. Cost: the redesign will
  have already fixed the cell language, so the heatmap inherits constraints it had no say in.

**This one needs an explicit answer even if the answer is "no".** Silence resolves to (a) by default,
and it is the deferral most likely to be reversed accidentally by a redesign.

### D5 — Does this cluster own 390px for this route?

- **(a) Yes.** The density problem is designed for at phone width from the start. Cost: constrains the
  desktop design — whatever the cell becomes must degrade to ≈50px.
- **(b) No, desktop-first, phone later.** Faster to a result. Cost: **there is no tracked mobile-pass
  workstream to defer to** (§0), so "later" is unscheduled, and the existing `/planner` mobile guard
  only catches page-level overflow — a cell that overflows itself would ship unnoticed.

### D6 — What does the day cell become, and what happens to the dots?

- **(a) Stay neutral.** Cheapest; cell keeps a radius and a focus ring. Cost: the Calendar stays the
  least-skinned screen, which is the condition that parked it.
- **(b) Skin the container.** Most character. Cost: ×18 contrast surface at the tightest size; the
  guard belongs in a registry-keyed core test, not the four-skin sweep.
- **(c) Skin the data, not the container.** Character with a stable box. Cost: unproven here; needs a
  ruling on the dot encoding regardless.

**Sub-decision, unavoidable under any option:** one-dot-per-event does not survive a heavy day at
390px. Replace with a count, a density ramp, or a capped row — this choice constrains (a)–(c) rather
than following from them.

---

## 9. Which of these actually need Greg

**Four are real forks:**

- **D1** — the record/plan question is the design problem; §2 shows the current screen resolving it
  by saying everything twice. Nothing else can be decided cleanly before it.
- **D2** — decides whether this is a feature or a visual pass. Also the honest answer to "what can a
  reader do here" is currently _nothing_, and that deserves a deliberate response.
- **D4** — an explicit reversal-or-reaffirmation, because the deferral's stated reason ("no longer
  sold by copy") is about marketing surface and may simply not apply any more. This is the one that
  gets decided by accident if nobody asks.
- **D6** — ×18, and the dot sub-decision has a hard constraint (390px) that rules out the status quo
  on its own.

**Two have obvious defaults, and I'd raise them only if the default is wrong:**

- **D3** defaults to **(a) Calendar only.** Releases already works, handles partial precision well,
  and is the pattern D1(c) would borrow from. Widening scope to a working screen needs a reason, and
  none is visible.
- **D5** defaults to **(a) yes, own 390px** — not on principle but on fact: there is no mobile-pass
  workstream to defer to, so (b) means indefinitely, and the existing guard is page-level only. If a
  mobile pass is actually planned and just isn't written down, this flips and should be said.

**One correction to carry into the decision, regardless of all six:** the framing that the Calendar
"has had every systematic pass" is not accurate — the grid has zero `Surface` call sites and
`.skin-tile` contributes only a radius and a focus ring. Whatever is decided, this is not a screen
that has been polished up to the point of needing bespoke work; it is a screen the systematic passes
went _around_.
