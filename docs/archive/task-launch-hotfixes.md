# Task: Launch Hotfixes

> **Status: shipped in #47.** This is the brief the work was built against, not a description of
> how the app behaves today. For current behavior, read the code and `docs/reference/DATA_MODEL.md`.

**Branch:** `fix/launch-hotfixes`
**Dependencies:** none — start immediately
**Golden rule applies:** no merge until eyeballed on the real authenticated app at real mobile and desktop viewports. Not `/lab`, not specimens.

## Context

Reverie is live at reveriereads.app with launch feedback in hand. This task bundles the four small, high-urgency fixes that block or degrade first-run experience. Everything here is surgical; if any item turns out to be structural, stop and report rather than expanding scope.

## 1. Registration failure — localhost leak (code side)

Production account creation fails with a `127.0.0.1:55321` error: a local Supabase URL is reaching the deployed environment. The dashboard-side config is handled separately (see Operator Steps below — **do not attempt those; they are Greg's**). Your job is the code side:

- Grep the entire monorepo for `localhost`, `127.0.0.1`, and `:55321` in any path that can reach a production bundle (auth flows, Supabase client construction, redirect URL builders, env fallbacks). A common culprit: `import.meta.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321'`-style fallbacks that silently win when an env var is missing at build time.
- Auth redirect URLs (`emailRedirectTo`, OAuth `redirectTo`) must derive from env or `window.location.origin` — never a literal.
- Fail loudly, not silently: if `VITE_SUPABASE_URL` is absent in a production build, the build should error, not fall back to localhost.
- Add a guard that stays: a CI step or build script that greps the production `dist/` output for `127.0.0.1` and `localhost` and fails if found (allow-list dev/test files explicitly if needed).

### Operator steps (Greg — not for Code)

1. Supabase dashboard → Authentication → URL Configuration: Site URL = `https://reveriereads.app`; Redirect URLs include `https://reveriereads.app/**` and the Vercel preview pattern; keep `http://localhost:5173/**` for dev only.
2. Vercel → Project → Environment Variables: confirm `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` for the **Production** environment point at the hosted Supabase project, not local.
3. Redeploy after env changes (env vars bake in at build time).

## 2. Mobile viewport — site loads zoomed in

On mobile the site renders as a zoomed desktop layout rather than fitting the screen.

- Ensure `index.html` head contains `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`. If a viewport meta exists but is malformed or overridden, fix it.
- Audit the app shell and top-level layout for fixed `width`/`min-width` values that force horizontal overflow at ~375–430px. Replace with fluid/max-width patterns. Do not restyle screens — this is an overflow audit, not a redesign.
- Verify at 375px, 390px, and 430px widths: no horizontal scroll on landing, auth, home, library, shelves, book detail.

## 3. "Back to library" navigates home

Exiting a book detail via "Back to library" lands on the home page instead of the library.

- Back affordances must return to the originating route: prefer router history (`navigate(-1)`) with a sensible fallback to the logical parent (`/library` for book detail) when history is empty (deep link / fresh tab).
- Audit all back-style buttons app-wide for the same hardcoding (shelf detail, series, settings, etc.) and apply the same pattern.

## 4. Shelf spines don't flip on short shelves

The spine→cover flip is scroll-driven, so shelves with too few books to scroll never reveal covers.

- Add pointer-based reveal: the spine under the cursor (hover) shows its cover; on touch, first tap reveals, second tap opens the book. Keep the existing scroll-driven behavior where it works.
- Keyboard focus must also reveal the cover (a11y — match the hover behavior for `:focus-visible`).
- Must work on shelves of any length, including 1–3 books.
- Use skin tokens for any new visual states; no hardcoded colors (the registry-keyed contrast test must stay green).

## Out of scope

Ownership model, shelf reordering, series work, import fixes, Discover — all covered by separate tasks. Do not touch them here even where adjacent.

## Acceptance / eyeball checklist

- [ ] New account creation succeeds on reveriereads.app (after Greg's operator steps + redeploy)
- [ ] `dist/` grep guard in place and passing; no localhost fallback reachable in prod
- [ ] Phone-width load fits the screen, no pinch-zoom artifact, no horizontal scroll on core screens
- [ ] Book detail → back returns to library (and to a shelf if entered from a shelf); deep-linked book detail back falls back sanely
- [ ] A 2-book shelf reveals covers on hover/focus/tap; long shelves still flip on scroll
- [ ] Full test suite + axe sweep green

## Completion report

Report: files touched per item, the exact localhost/fallback instances found and how each was resolved, the CI guard implementation, routes + viewports eyeballed, and test/axe results. Flag anything that looked structural and was deliberately left alone.
