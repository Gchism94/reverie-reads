# Skins & personalization (Phase 6)

Reverie generalizes from a romance-specific app into a **general reading app whose
identity is skinnable**. The gothic New Orleans look already built (Nocturne + Magnolia
Dawn) becomes one skin — the **Romance skin, "Reverie."** This is the personalization
direction: readers love tools that feel tailored to them.

## Concepts

- **Skin** = a complete swappable aesthetic identity: a palette (its own **light + dark**
  token sets), a display-font choice, an ambient background motif, an ornament/signature,
  and optional **featured fields** (which metadata it emphasizes). Skin is independent of
  light/dark **mode** — they're two axes.
- **Default app** = genre-neutral and clean; a tasteful **Default skin** is the fallback.
  Onboarding can ask the reader's main genre and pick a Tier-1 skin.
- **Tier-1 — preset skins:** one designed skin per major genre (below). The Romance skin
  ("Reverie") ships already.
- **Tier-2 — adaptive skin:** generated from the reader's behavior; evolves monthly.

## Architecture (refactor the current theming into a skin engine)

- A **skin registry**: each skin provides `{ id, name, genre, fonts, light tokens, dark
tokens, ambient, ornament, featuredFields }`.
- A **SkinProvider** applies the active skin's token bundle for the current mode. The
  existing Nocturne/Magnolia Dawn becomes the Reverie skin's dark/light. Feasible at low
  risk **because nothing is hardcoded** — it's all tokens already.
- User settings: `activeSkin` + `mode` (light/dark/system) + (later) `adaptive: on`.
- Generalize the data so skins are more than paint:
  - **tropes → tags** (generic), with curated per-genre tag sets.
  - **spice → optional `intensity`** field (featured by romance; hidden by default).
  - mood-matcher becomes genre-agnostic ("vibe matcher").
  - add `genre`/primary-genre signal per book for skin + adaptive logic.

## Tier-1 preset skins (one per major genre — starter set, registry is extensible)

| Skin                  | Genre                  | Aesthetic direction (light + dark)                                                      |
| --------------------- | ---------------------- | --------------------------------------------------------------------------------------- |
| **Reverie** _(built)_ | Romance / Romantasy    | gothic New Orleans; gaslit night sky, filigree, Fraunces                                |
| **(tbd)**             | Fantasy / Epic         | illuminated-manuscript; parchment + embers, gold, mythic serif                          |
| **(tbd)**             | Science Fiction        | cosmic/cyber; deep space, neon/holographic, grid, geometric sans                        |
| **(tbd)**             | Mystery / Thriller     | noir; fog + shadow, ink, a single sharp accent under lamplight                          |
| **(tbd)**             | Horror                 | eerie; desaturated, candlelit, high-contrast, unsettling (distinct from romance gothic) |
| **(tbd)**             | Literary / Classics    | editorial/timeless; cream, restrained, archival serif                                   |
| **(tbd)**             | Cozy                   | cottagecore; warm wool/tea tones, soft light, rounded                                   |
| **(tbd)**             | Nonfiction / Knowledge | clean/archival; paper, structured, calm, indexed                                        |
| **(tbd)**             | YA / Contemporary      | bright, saturated, playful, modern                                                      |

Each needs: light + dark palette, display font, ambient background motif, ornament, and
its featured fields. (A Claude Design pass produces these, the way Reverie was made.)

## Tier-2 adaptive skin

**Reader profile (from data already collected):** genres/subgenres read, tags liked,
ratings (loved vs DNF), faves, rereads, intensity tolerance, pace/finish rate, recency &
seasonality, mood-matcher results, and any explicit thumbs.

**Generation (v1):** weight the reader's genre/mood profile, then **blend the Tier-1
skins' palettes/motifs toward that taste** (coherent by construction, reuses real design).
Fully generative palettes are a later evolution.

**Monthly ritual — "Your profile is evolving":** once a month, recompute the profile and
present the updated skin + a short insight ("you've been reading darker and faster
lately"). The reader can **keep / revert / lock**. Recompute is a scheduled Edge Function
(cron); never change the look mid-session without the reveal.

**Also tunes recommendations:** the same profile feeds Match and "find my next read."

## Sequencing (after Phase 5)

1. **Skin engine** refactor (registry + provider; current themes → Reverie skin).
2. **Generalize data** (tropes→tags, spice→optional intensity, genre signal). Can start
   earlier since it's data-model work.
3. **Tier-1 skins** — design pass for the genre set, then implement as token bundles.
4. **Tier-2 adaptive** — profile aggregation → blend generator → monthly reveal + control.

## Decisions for the owner

1. **App name vs skin name.** "Reverie" becomes the **romance skin's** name; the
   generalized **app needs its own name** (reshapes `docs/TRADEMARK.md`). Decide the app
   name before it's public.
2. **Genre-awareness depth:** skins purely visual + "featured fields" (recommended v1) vs.
   deeper per-genre UI changes (later).
3. **The Tier-1 genre set** (confirm/adjust the list above).
4. **Adaptive generation:** blend-of-Tier-1 (recommended start) vs. fully generative.
5. **Adaptive default:** opt-in vs on-by-default; monthly cadence; keep/revert/lock UX.

> This generalization is also the growth play (`docs/SCALING.md`) — a general, highly
> tailorable reading app addresses a far larger audience than a single-genre tool.

---

## Proposed Tier-1 skin-name family (holistic set — preliminary TM reads)

A single evocative word per genre, same naming convention as Reverie. Skin names are
theme names _inside_ the product (low TM stakes vs. the umbrella app name). ✅ = no obvious
collision surfaced; ◑ = verify before locking.

| Genre             | Skin name           | Vibe                          | TM read                                                                  |
| ----------------- | ------------------- | ----------------------------- | ------------------------------------------------------------------------ |
| Romance           | **Reverie**         | gothic New Orleans, dreamlike | locked                                                                   |
| Fantasy           | **Grimoire**        | book of spells (meta)         | ✅ (swapped from "Lore" — Lore is crowded: Amazon series + RPG software) |
| Sci-Fi            | **Parallax**        | cosmic, optical               | ✅ (Nova/Orbit/Nebula crowded)                                           |
| Mystery           | **Cipher**          | codes, shadow                 | ◑ verify (security/crypto uses)                                          |
| Horror            | **Marrow**          | dread in the bones            | ✅ ownable                                                               |
| Literary          | **Verso**           | the left-hand page            | ✅ (Quill/Canon taken)                                                   |
| Cozy              | **Snug**            | warmth, tea, blanket          | ◑ verify (swapped from "Wren" — Wren Kitchens CAD sw + Wren lang)        |
| Nonfiction        | **Almanac**         | indexed knowledge             | ✅ (Atlas crowded)                                                       |
| YA / Contemporary | **Bloom** / **Pip** | bright, growing               | ◑ Bloom common; Pip cleaner                                              |

Tested this round: Lore (crowded), Wren (occupied) → swapped. Others are knowledge-based
reads, formally testable on request. Umbrella **app** name still separate and is the real
clearance target (Vellichor / Marginalia / Burrow).

---

## Tier-1 skin names — 3 options per genre (screened; supersedes single-name list above)

Legend: ✅ live-checked clear · ◑ likely/known collision, verify · (unmarked) screened vs.
known brands from memory, not individually USPTO-pulled. Skin names are low-stakes theme
names; the umbrella **app** name is the real clearance target.

| Genre             | Option 1             | Option 2   | Option 3  |
| ----------------- | -------------------- | ---------- | --------- |
| Romance           | **Reverie** (locked) | Ardor      | Tryst     |
| Fantasy           | **Grimoire** ✅      | Wyrd       | Mythos ◑  |
| Sci-Fi            | Parallax             | Apogee     | Aphelion  |
| Mystery           | Alibi                | Gambit ◑   | Sleuth ◑  |
| Horror            | Marrow               | Wight      | Mortis ◑  |
| Literary          | Calliope             | Atrium     | Inkwell ◑ |
| Cozy              | Mull                 | Hygge ◑    | Cwtch     |
| Nonfiction        | Almanac              | Compendium | Lyceum    |
| YA / Contemporary | Zest                 | Bramble    | Halcyon   |

Confirmed TAKEN in app/Class-9 (excluded): Cipher (Cipher Security, reg. Class 9),
Snug (Snug Safety app), Lore (Amazon series + RPG software), Wren (Wren Kitchens CAD sw +
Wren lang), plus earlier Folio/Quire/Canon/Nook/Atlas.
Meta-finding: plain single words are mostly occupied in Class 9; distinctive/rarer words
(Grimoire, Aphelion, Calliope, Compendium, Bramble, Cwtch) clear far more easily.

---

## Per-name USPTO pull results (preliminary; web-indexed Justia/Trademarkia, not attorney clearance)

Legend: ○ clear-leaning (no software-class mark surfaced — weak evidence of availability,
NOT clearance) · ▲ occupied/caution (live mark or active software product found).

Romance: Reverie ✓locked · Ardor ○ (energy drinks IC32) · Tryst ○ (café IC43)
Fantasy: Grimoire ○ · Wyrd ○ (board games IC28, Wyrd Miniatures) · Mythos ○ (sw/studio marks dead)
Sci-Fi: Parallax ▲ (live IC42 SaaS, Right Team #6259268) · Apogee ▲ (healthcare sw + Apogee audio HW IC9) · Aphelion ○ (only dead game mark)
Mystery: Alibi ▲ (live IC42 ML sw, Seldon #6689301 + UK crime-TV) · Gambit ▲ (live IC42 sw, Gambit Comms #2742662 + Marvel) · Sleuth ▲ (sleuth.io DevOps) — ALL THREE OCCUPIED
Horror: Marrow ○ · Wight ○ (only IoW canned goods 1975) · Mortis ○ (game character only)
Literary: Calliope ○ · Atrium ▲ (legal-tech etc.) · Inkwell ▲ (scattered SMB) — note Verso also out (Verso Books publisher)
Cozy: Mull ○ · Hygge ▲ (crowded + Hygge Software) · Cwtch ▲ (active OSS messaging app) — Snug/Wren/Hearth already taken
Nonfiction: Almanac ▲ (prior IC9 mark cancelled + almanac.io) · Compendium ○ · Lyceum ○
YA: Zest ▲ (Zest AI fintech) · Bramble ▲-lean (compound "Bramble Bubble" game; bare word clearer) · Halcyon ▲ (live IC42, Halcyon Tech #7069927)

Confirmed TAKEN earlier (excluded): Cipher (IC9 Cipher Security), Snug (Snug Safety app), Lore, Wren.

### Clean-leaning option exists per genre?

- Romance: YES (Ardor, Tryst both clear; Reverie locked)
- Fantasy: YES (Grimoire, Wyrd, Mythos all clear)
- Horror: YES (Marrow, Wight, Mortis all clear)
- Nonfiction: YES (Compendium, Lyceum clear)
- Sci-Fi: ONLY Aphelion
- Literary: ONLY Calliope
- Cozy: ONLY Mull
- YA: weak — Bramble best but game-adjacent; recommend a fresh cleaner candidate
- Mystery: NONE — all three occupied; needs fresh candidates (ideas to pull next:
  Clew, Gumshoe, Caper, Marlowe, Quietus, Redact)

CAVEAT: ○ = absence of a surfaced mark in a web search, which is weak evidence, NOT a
clearance. Pending/common-law/foreign marks may exist. Any finalist needs a full
attorney TESS/TSDR knockout search before adoption.

---

## Working demo: design/Skin_System_Demo.html

Single-file, self-contained proof of the skin system. Demonstrates:

- One genre-neutral library shell (top bar, hero, two shelves, book-detail panel) re-skinned
  live across 4 Tier-1 skins: Reverie (Romance, finalized gothic-NOLA), Grimoire (Fantasy),
  Aphelion (Sci-Fi), Marrow (Horror) — all names cleared in the trademark pull.
- Skin and light/dark as INDEPENDENT axes (4 skins x 2 modes = 8 token bundles).
- A token contract (--bg/--ink/--primary/--secondary/--tertiary/--line/--font-\*/ambiance)
  that mirrors the production token names, so each skin is just a bundle the registry adds.
- A JS SKIN registry driving the switcher (adding a genre = entry + token block, nothing else).
- Skin-aware signature: ambient glows/stars/fog/grain/vignette + a per-skin divider motif
  (filigree / alchemical / orbital / thorn). Respects prefers-reduced-motion.
- Generalized data surfaced in the detail panel: generic TAGS (not romance "tropes") and an
  optional INTENSITY field (the genre-neutral replacement for "spice") — matching G1.

Books/covers are invented + constant across skins (no real titles → no copyright; constancy
proves it's the same library, only re-skinned).

NOT yet done (production hand-off): wire skins into the real @reverie token layer + TanStack
shell, persist skin choice per user, and build the Tier-2 adaptive skin. Captured as the next
Claude Code task when Phase 5 tracks land.
