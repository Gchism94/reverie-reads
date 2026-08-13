# Reverie — implementation (Code): INCORPORATION KICKOFF — STEP 0 + Stages I–II (2026-07-02)

> Companion to `docs/archive/task-code-incorporation-mvp.md` (the master doc — follow its rules throughout).
> **Scope of THIS run: STEP 0, Stage I, Stage II. HARD STOP after Stage II.** Design chunks 3–4 (skins 6–9 +
> composed screens) don't exist yet, and Greg's eyeball on skins 3–5 feeds the chunk-3 Design prompt — do not
> proceed into Stage III/IV or MVP polish, and do not improvise the missing skins.

## What's on disk

Design chunks 1–2 are in `design/from-design-tool/`: the system specimen + refined Tryst/Aphelion (chunk 1)
and skins 3–5 (chunk 2), standard bundle format (you've decoded it four times). Inventory the directory first
and report what's actually there — filenames, which chunk each maps to, anything missing or ambiguous —
before building.

## STEP 0 — clean main (hard gate; do FIRST; highest care)

Per the master doc: merge the import chain #10→#11→#13→#14→#18, then the structural line #15→#16→#17.

- **The LibraryRoute conflict is the known landmine** — both stacks edit the library screen from opposite
  sides (Section B's "Import books" CTA/entry vs Section A's shelves + placeholder fixes). Resolve so BOTH
  survive; do not let a mechanical resolution pick a side.
- **Post-merge verification on the authed app** (not just the gate): the library screen shows the Import CTA
  AND working, size-varied shelves AND placeholder covers on coverless books. Screenshot it for the report.
- Full gate green on main. Report main's state before starting Stage I. If any merge surfaces a conflict you're
  not sure how to resolve, stop and flag it with the options — don't guess on STEP 0.

## Stage I — refined Tryst + Aphelion (judgment stage — flag, don't apply)

Decode chunk 1. **Diff** the refined values/structures against the live skins. These two are proven, cleared
identities:

- Apply what's clearly refinement (tightened values, sharpened ornament, unified spine/placeholder treatments).
- Anything that would _change the identity_ — a different motif, a structural language shift, a texture that
  reads as a different room — goes to Greg as a **before/after flag**, not a silent apply. When in doubt, flag.
- Extract the system specimen's slot anatomy and confirm it matches the shipped `SKIN_STRUCTURE` contract
  slot-for-slot. If chunk 1 implies a NEW slot: contract-extension first (schema + neutral default + docs),
  as its own commit, flagged in the report.

## Stage II — skins 3–5 get their bone (fill-the-table stage)

Decode chunk 2. For each of the three skins, wholesale-replace the flat code-first placeholder identity:
full token table + `SKIN_STRUCTURE` config + the one bespoke SignatureMotif component + `Spine` +
`PlaceholderCover` + voice-pack lines — all extracted from the specimen, never guessed. Ambiguity → ask.
The registry-keyed tests (contrast, fonts via the generalized `document.fonts.check` guard, axe sweep) pick the
new skins up automatically — extend them where the new identities add surfaces (new typefaces, spine text at
the 13px/9px minimums, placeholder text, motif animation on `.rv-anim`).

## PRs + the eyeball

- **Two PRs, branch not merged**: Stage I (refinements + any contract extension) and Stage II (skins 3–5),
  II stacked on I. Keep diffs stage-only.
- **Stage the eyeball on the REAL authed app** (standing policy — never `/lab` alone): for each of the five
  skins, composed home + library section (with shelf) + detail rail + an empty state, both modes, side-by-side
  where feasible. Greg's verdict on skins 3–5 here is what shapes the Design prompt for skins 6–9 — make the
  review easy and honest, including anything that reads weaker on the real screens than in the specimen.
- **Gate per PR**: core + typecheck + lint + build + full axe e2e sweep (nine skins × both modes) green.

## Report back

Directory inventory; main's post-STEP-0 state + the LibraryRoute verification screenshot; the Stage I diff
summary with every flagged before/after; per-skin extraction notes for 3–5 (what the specimen defined, anything
ambiguous and how you resolved or escalated it); gate results; what's staged for the eyeball and where.
**Then stop.**
