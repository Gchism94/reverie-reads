# design-sync notes — Reverie

## Shape / approach
- This repo is an **app + a logic-only core**, NOT a packaged component library and **no Storybook**.
  `@reverie/core` is pure logic (no UI); `apps/web` is the application; its components are coupled to
  the Supabase data hooks, TanStack Router, and the Zustand skin store.
- Scope chosen (owner): **token design language only** — the 4 skins × light/dark token sets + fonts.
  Components (Chip/Stars/SkinDivider) were deliberately excluded: they depend on the app's Tailwind
  utility layer + the skin store + CDN fonts, so they don't bundle cleanly as a standalone kit.
- The converter (`package-build.mjs`) is **unusable here**: it requires a packaged library entry and
  reads `node_modules/@reverie/web/package.json` (an app never self-installs), so it ENOENTs at the
  dts step. The bundle was therefore **hand-authored** (sanctioned off-envelope path) and gated with
  `package-validate.mjs --no-render-check` (exits 0).

## Bundle contents (hand-authored, off-converter)
- `styles.css` → `@import tokens/tokens.css` + the Google-Fonts `@import` (remote → `[FONT_REMOTE]`).
- `tokens/tokens.css` — copied verbatim from `apps/web/src/styles/tokens.css` (the source of truth).
- `_ds_bundle.js` — empty (`window.ReverieDS = {}`); header `components: []` (no importable JS).
- `components/Foundations/{Skins,Colors,Typography}/*.html` — static cards rendering the real skins
  from the tokens (each `data-skin`/`data-mode` + `var(--*)`). `.ds-build-meta.json` componentCount=3
  matches the 3 preview files; the header `components` stays `[]` (nothing to export-check).
- Fonts source: `apps/web/src/styles/ds-fonts.css` (cfg.cssEntry) — the one `@import` of all skin
  families. **Keep in sync with `apps/web/src/skin/fonts.ts`** (the app's runtime per-skin loader).

## Render check
- NOT machine-run (no Playwright/Chromium; owner opted to eyeball + verify live in the DS pane).
  The 3 cards are static HTML; re-run `package-validate.mjs ./ds-bundle` with a browser to machine-verify.

## Re-sync risks (watch-list)
- `_ds_sync.json` is **absent** (off-script, no clean renderHash recipe for hand-authored cards) →
  every re-sync re-verifies from scratch. Expected, not a bug.
- The bundle is hand-authored, so the converter/driver re-sync path does NOT apply — re-sync = re-run
  these steps: copy `apps/web/src/styles/tokens.css` → `ds-bundle/tokens/tokens.css`, refresh the
  fonts `@import` if `skin/fonts.ts` changed, re-validate, re-upload (the project is now non-empty →
  atomic path).
- The 4 skins are the real set; the design handoffs said "9 skins" — that's aspirational, not in the
  codebase. Update the cards if skins are added to `tokens.css` / the registry.
- `ds-fonts.css` lives in `apps/web/src/styles/` but the app does NOT import it (runtime fonts load
  via `skin/fonts.ts`); it exists solely as the design-sync font source.
