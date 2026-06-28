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
