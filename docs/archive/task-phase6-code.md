# Phase 6 — Generalize + Skins — coding agent task

Paste into coding agent. Builds on the shipped app (Phases 1–5 complete). Same working
agreement as Phase 5: pure logic unit-tested; typecheck + lint + build + axe smoke must stay
green; NO hardcoded colors (tokens only); server-enforced RLS + spoiler gate preserved; don't
break the existing seed (migrate + backfill). Stage source only; leave docs/ untouched. Report
back at each checkpoint with commit + what landed vs acceptance.

Reference: design/Skin_System_Demo.html already proves the target architecture in miniature
(token contract + JS skin registry + independent skin/mode axes + skin-aware ambiance). Match
that approach in production. docs/reference/SKINS.md has the token contract, the cleared Tier-1 names, and
the per-genre name table.

────────────────────────────────────────────────────────

## 0. Hardening pass first (carry-overs from the Phase 5 close)

Land these before the new work; they're small but they gate trust.

- RLS: add/confirm per-user row-level security on the new `merge_verdicts` and the default-store
  migration (whether it's a `profiles` column or its own table). A new table without an owner
  policy either leaks across users or denies entirely. Add a test that user B can't read user A's
  verdicts/default store.
- A4 quota: give bulk "fill missing covers & info" a per-run/day ceiling that respects Google
  Books (~1000/day per docs/reference/SCALING.md) and Open Library per-IP courtesy, and degrade gracefully
  on HTTP 429 / quota — a clean resumable stop (persist progress, surface "paused — resumes later"),
  never error spam.
- Partial enrichment: today a book that fills some-but-not-all missing fields still gets stamped
  `enriched_at` and won't retry for 30 days. Change so a record is only treated as "complete" when
  the high-value fields (cover, series/position) are present; otherwise allow a shorter retry
  window for the still-missing ones.

## 1. Data generalization (REQUIREMENT G1)

The app is no longer romance-specific; romance becomes the default _skin_ (Reverie). Generalize
the model so other genres are first-class, WITHOUT losing romance UX.

- `tropes` -> generic `tags` (string[]). `spice` -> optional nullable `intensity` (smallint 0–5).
  Add a `genre` signal to books: one primary genre enum/string + optional secondary (or a typed
  genre tag). Migration + backfill: tropes->tags, spice->intensity, genre='romance' for the
  existing seed. Backward-compatible reads.
- Skin label map: a skin config maps generic field -> display label, so the Reverie skin still
  shows "Tropes" and "Spice" while the model stays generic (other skins show "Tags"/"Intensity"
  or their own labels). UI reads labels from the active skin, never hardcoded.
- @reverie/core: update types, filters, and CSV/import mapping to tags/intensity/genre. Keep the
  ported merge/spoiler/cover logic intact.
- Mood Matchmaker: make it genre-agnostic — drive off tags/intensity/genre + ratings, not
  romance-coded tropes. Verify it still produces sensible picks on the romance seed.
  Acceptance: migration runs idempotently on the 290-book seed; romance UI unchanged (still says
  Tropes/Spice via the label map); filters work on tags/intensity/genre; mood matcher genre-neutral;
  core tests cover the migration + label mapping.

## 2. Skin token layer + registry (G2/G3)

- Refactor tokens so a SKIN is a complete bundle (light + dark) over the exact contract used in
  the demo: --bg --bg2 --card --card-2 --ink --muted --line --primary --primary-solid --on-primary
  --secondary --tertiary --shadow --font-display --font-body --font-mono + ambiance
  (--glow-1 --glow-2 --star --fog --grain --vignette). Apply via data-skin + data-mode on the root
  (production parity with the demo).
- Skin REGISTRY (typed): id, label, genre, fonts, light bundle, dark bundle, ambiance params,
  divider motif. Seed it with Reverie (default; the finalized AA-corrected Nocturne + Magnolia
  Dawn) plus the cleared Tier-1 skins — Grimoire, Aphelion, Marrow — ported from the demo bundles.
  Structure the registry so the remaining genres drop in as data later (names still being chosen).
  IMPORTANT: re-verify every skin bundle for AA in BOTH modes before wiring it in (the demo bundles
  are a starting point, not AA-audited); fix any failing pair.
- Skin and light/dark are INDEPENDENT axes. Persist both per user (profiles columns), cross-device,
  with a system-preference fallback for mode and Reverie as the default skin.
- Skin-aware signature: the ambient atmosphere + divider motif read from the active skin's tokens;
  respect prefers-reduced-motion (disable drift/twinkle/fog).
- UI: a skin picker in Settings (separate control from light/dark) + the Skin Gallery screen
  (browse/preview/select; the design tool pass is producing the visual for this).
  Acceptance: switching skin re-skins the whole app live with no layout shift; mode is orthogonal;
  choice persists across reload + device; all-skins x both-modes axe smoke passes AA; no hardcoded
  colors introduced.

## 3. Tier-2 adaptive skin (G4)

- v1: generate an adaptive skin by blending Tier-1 token bundles weighted by the reader's taste
  profile (genre mix, top tags, ratings, favorites, DNF, pace). Pure, unit-tested weight + blend
  math (blend in a perceptual space or clamp to keep AA; re-check AA on the generated bundle and
  nudge to pass).
- Store the generated skin per user; expose keep / revert / lock.
- Monthly evolution: a cron Edge Function recomputes the profile; if it shifts materially, surface
  a "your profile is evolving" reveal with keep / revert / lock (the reveal UI is being designed in
  design tool — scaffold against the spec, slot visuals when they land).
- Ship order within G4: blend + manual "regenerate" first; cron + reveal second.
  Acceptance: a reader with a clear taste skew gets a recognizably blended skin that passes AA;
  keep/revert/lock works and persists; blend math is deterministic + tested; cron is idempotent and
  only fires the reveal on a material shift.

────────────────────────────────────────────────────────

## Checkpoints (report commit + acceptance at each)

- C1: hardening pass + data generalization (migration, core, filters, mood matcher).
- C2: skin token layer + registry + persistence + Settings skin picker.
- C3: Skin Gallery + alternate Tier-1 skins (Grimoire/Aphelion/Marrow), all AA-verified.
- C4: Tier-2 adaptive blend (then cron + reveal as C4b).

## Guardrails

No hardcoded colors. Every skin passes AA in both modes. Preserve RLS + the server-enforced
spoiler gate. Migrate + backfill — never drop the existing seed. Romance is the Reverie skin, not
removed: keep Tropes/Spice as _labels_ via skin config. Keep bundles ≤ the cost ceilings noted in
docs/reference/SCALING.md (shared caches keyed by work, not per-user).
