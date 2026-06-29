# Desktop design — coding agent handoff

Source (design tool): project 4cd3eb88-1d0f-4316-b7fd-2a5887083970, file "Library Desktop.dc.html".

## Import command (run in CODING AGENT, not the chat)
Use the design-tool MCP (https://api.vendor.com/v1/design/mcp, auth via /design-login) to import
this project:
https://agent.ai/design/p/4cd3eb88-1d0f-4316-b7fd-2a5887083970?file=Library+Desktop.dc.html
Implement: Library Desktop.dc.html

## Paste this framing ALONGSIDE the command (critical)
"Treat Library Desktop.dc.html as the desktop VISUAL TARGET — ALIGN the existing app to it; do NOT
rebuild from the static export. Specifically:
- Keep the existing architecture: the skin engine (data-skin/data-mode + token contract), the typed
  skin registry, the RLS-backed Supabase data layer, TanStack Router/Query, @reverie/core, and all
  shipped components.
- Adjust the existing desktop layout to match the design's structure, spacing, and hierarchy, expressed
  entirely through CSS variables/tokens — NO hardcoded colors or fonts lifted from the .dc export.
- Render in the default skin (Tryst); verify it still works across all 9 skins x light/dark and passes
  the existing AA axe sweep.
- Use the export for structure/layout reference only; reconcile any differences in favor of the existing
  token system and functionality.
- Gate green (typecheck/lint/build/tests/axe) before reporting; stage source only; docs/design untouched."

## Sequencing
Run AFTER (or in a separate branch/session from) the Phase 7 hardening run — both touch the app shell
(H4 font-loading + layout), so don't interleave them.

---

## STATUS — 2026-06-27: PAUSED (blocker), no code changes
The export (Reverie - Personal Library.html) is a client-rendered React bundle (no static DOM/classes);
the browser install was declined, so it couldn't be rendered to align against. Structure was MINED and is
the alignment target: 3-column master-detail -- persistent left sidebar ~236px (skin switcher) + auto-fill
cover grid minmax(132-250px,1fr) + right detail rail ~360px; ~1320px container; gaps 16/18/24; wide >=1440
dense breakpoint.

DECISION NEEDED (Greg): this is a SHELL RE-ARCHITECTURE -- current top-nav AppShell -> persistent-sidebar
3-column master-detail. Right pattern for a library app, but a real structural change. If approved:
- Proceed from the mined spec on the token system; review the result against the design screenshot.
  (Browser/render not required -- the app is rebuilt on tokens, never lifted from the export.)
- A render-enabled pass (re-enable the browser install) is optional, only for pixel-fidelity to the export.

---

## RESOLVED — 2026-06-27: re-architecture APPROVED (Greg)
Top-nav AppShell -> 3-column master-detail is a GO. Plan:
1. CoverImage net NOW (non-colliding sites): adopt <CoverImage> in DuplicateReview, OwnedCopies,
   SpineShelf, BookDetailRoute, dialogs -- additive, no collision.
2. Desktop work (M: CoverCard, AppShell, ThemeToggle, FilterPanel, Toolbar, LibraryRoute; ?? BookDetailRail,
   useMediaQuery) -> move onto a desktop-align BRANCH (ends the uncommitted-limbo risk) and finish + commit
   on tokens per the mined spec (236px sidebar w/ skin switcher; cover grid minmax(132-250px,1fr); 360px
   detail rail; 1320px container; gaps 16/18/24; >=1440 dense). Gate green; verify all 9 skins x light/dark
   + AA.
3. After desktop commits: the one-line <CoverImage book=...> swap in CoverCard + BookDetailRail (replaces
   the old manual onError/placeholder handling).
REVIEW on landing: against the mined spec + the design screenshot; tokens-only; all 9 skins; AA; CoverImage
actually swapped in (no leftover manual onError in CoverCard).

---

## Responsive default for the master-detail (so Code doesn't guess) — 2026-06-27
BookDetail is ONE content component rendered in THREE shells (do NOT build three detail views):
- >= 1280 (xl): DOCKED 3-column -- sidebar 236 + cover grid + persistent detail rail 360. Dense grid
  (more columns) at the mined >=1440 breakpoint.
- 1024-1280 (lg-xl): sidebar 236 + grid stays; the detail rail becomes an OVERLAY DRAWER on selection
  (slides over the grid, dismissible) so the grid keeps ~3 comfortable columns while browsing.
- < 1024 (below lg): the EXISTING compact/mobile layout, UNCHANGED -- current nav (skin switcher in the
  menu), single-column grid; selecting a book navigates to a full BookDetail ROUTE (back to return).
  Master-detail does not apply here; reuse what already works.

Principles (for edge cases): grid never starves -- collapse the rail to overlay BEFORE the grid drops
below ~3 cols; sidebar degrades full(236) -> mobile nav at the lg boundary (an icon-rail ~64px middle
state is an OPTIONAL later refinement, not the default); rail/drawer transitions respect
prefers-reduced-motion; skin switcher always reachable (sidebar on desktop, menu on mobile); reuse the
app's existing breakpoints/nav for the compact tier rather than a parallel mobile layout.

---

## DELIVERED — 2026-06-27 (branch desktop-align, 88af4a1, pushed to origin)
NOT merged -- on a branch for review. Token-only; gate: typecheck/lint, 210 core + 4 web, build green;
staged source only; docs/.env untouched.
Closed gaps: (1) responsive detail rail -- docked 3-col >=1280 (filters 236 + grid minmax(132,1fr) + rail
360, never empty); drawer-on-selection 1024-1280 (dialog/aria-modal/Esc/focus, motion-free mount); navigate
-to-route <1024. (2) <CoverImage> swapped into CoverCard + BookDetailRail (manual onError/title fallbacks
removed). (3) reduced-motion-guarded sidebar transition; RESTORED the mobile Settings (gear) link = mobile
path to the skin switcher (regression the new mobile bar had dropped).

MERGE GATE (owner-run; needs local Supabase stack + Chromium, not runnable in Code's sandbox):
- AA axe sweep `pnpm e2e` across the 4 real skins x light/dark -- the one gate Code correctly did NOT run
  or claim (held AA by construction: AA tokens, dialog roles/labels/focus, aria-current).
- Visual eyeball: drawer @1024-1280, docked rail never starves grid @>=1280, and the mined-spec >=1440
  DENSE breakpoint actually densifies as designed (report didn't explicitly confirm).
NEXT: open the PR + summary (review surface, not a merge); run the sweep + visual in the PR; merge when
green (Code fixes any axe flags).
