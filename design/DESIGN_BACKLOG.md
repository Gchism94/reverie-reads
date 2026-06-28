# Design backlog — design tool deliverables

Outputs land in design/from-design-tool/<set>/ (code export + screenshots). coding agent implements
against them on the token system (no hardcoded colors from the mockup). All render in the default skin
(Tryst); show alt-skin proof where relevant.

## Done / in flight
- DESKTOP — DONE -> design/from-design-tool/desktop/. Skin-agnostic shell on the token contract.
- SKIN GALLERY — already BUILT in code (C3). Prompt exists (DESIGN_PROMPT_SKIN_GALLERY.md) if a
  visual polish pass is ever wanted; not required.
- WRAPPED — IN FLIGHT (prompt: DESIGN_PROMPT_WRAPPED.md). Review screens when they return.

## Next (prioritized by launch impact)
1. LANDING / MARKETING PAGE — public front door, unblocked by the Reverie name. Can't launch publicly
   without it. DESIGN APPROVED (gold, genre-neutral) -> handoff at design/from-design-tool/landing/HANDOFF.md.
2. ONBOARDING / FIRST-RUN — empty state -> import (CSV/scan) -> first-skin reveal. Pairs with Phase 7
   H1 (empty signups) + the import task. The new-user experience. NEW PROMPT NEEDED.
3. AUTH SCREENS — sign in / sign up / verify email / reset. Pairs with H3 (email verification).
4. ACCOUNT & DATA SCREENS — delete-account confirmation, data export, "what we store" privacy summary.
   Pairs with H1.
5. FIVE NEW SKIN DIVIDER MOTIFS — Calliope / Mull / Compendium / Clew / Fledge (like filigree /
   alchemical / orbital / thorn). Needed when the 5 remaining skins are built.
6. MOBILE PASS — confirm mobile-specific screens (scan flow, mobile nav) are covered; this build was
   desktop-first.

- Onboarding/first-run + IMPORT (one flow) -- HANDED OFF -> design/from-design-tool/onboarding/HANDOFF.md (in-app, renders in Tryst, skin system live; covers welcome -> genre/skin pick -> import map/review -> populated library + empty state).

- Auth screens -- HANDED OFF -> design/from-design-tool/auth/HANDOFF.md (genre-neutral gold brand; sign up / log in / verify email / forgot + reset / edge states incl. rate-limited).

- Cover Studio (NEW; see docs/COVER_SOURCING_AND_STUDIO.md) -- personal cover-curation surface, NOT a
  Hardcover clone: edition-faithful candidate picker, photograph-your-copy, skin-themed typographic
  placeholders, batch cover-triage from the import review, upload/URL. Private + lean (own Storage/RLS).
  Needs its own design tool prompt (book-detail cover editor + batch triage + placeholder-across-skins).
