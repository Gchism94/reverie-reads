# Landing page — coding agent handoff

Source (design tool): "Reverie Landing" project — gold genre-neutral revision (pink confined to the
Tryst card in "The skins").

## Get the import command
In design tool: Export -> "Send to local coding agent". It generates a ready-to-run command
(design-tool MCP import + "Implement: <file>"). Run it in CODING AGENT, not the chat.
Use the design-tool MCP (https://api.vendor.com/v1/design/mcp, auth via /design-login) to import
this project:
https://agent.ai/design/p/4cd3eb88-1d0f-4316-b7fd-2a5887083970?file=Reverie+Landing.dc.html
Implement: Reverie Landing.dc.html

## Paste this framing ALONGSIDE the command (critical)
"Build the Reverie LANDING PAGE as a NEW public, pre-login marketing page in the existing monorepo
(apps/web) — shown to logged-out visitors as the entry point. This is net-new (unlike the desktop pass,
which ALIGNS existing screens), but it must stay on the project's conventions:
- Marketing BRAND tokens, genre-neutral: define a small brand palette (deep nocturne bg, GOLD accent
  #f0b14e with DARK text #1a0f14 on filled CTAs, violet #7b3fa0 secondary) as its OWN tokens -- do NOT
  bind the page to a skin's primary (especially not the Tryst pink). No hardcoded hexes lifted from the
  .dc export; use CSS variables.
- The 'The skins' showcase section renders the app in REAL skins (Tryst/Grimoire/Aphelion/Marrow) from
  the actual skin tokens -- not faked screenshots.
- Responsive desktop + mobile; AA contrast in every state; a prefers-reduced-motion variant (night sky
  calms, no parallax); lightweight + fast (first paint for new visitors) -- lazy-load heavy bits.
- Real Reverie wordmark + Fraunces/Hanken type. CTAs route to sign-up/auth.
- Pricing/plan copy stays placeholder (no price claims).
- Gate green (typecheck/lint/build/axe) before reporting; stage source only; docs/design untouched."

## Sequencing
Run as its own pass -- don't stack it in the same coding agent session as the desktop-align handoff or
the in-flight import build (overlapping shell/routing).

## LANDING DESIGN RECEIVED + MATCH TASK (2026-06-28)
Greg uploaded the real Landing export (Reverie_Landing.html, JS bundle). It's RICHER than the shipped
brief-based landing -> worth matching. Structure: hero ("A library of your own") -> "Reverie speaks your
genre" skin-shift differentiator + Adaptive skin -> feature grid (TBR/calendar, barcode scan, series
reading-orders, stats) -> indie-bookstore values -> privacy section -> closing CTA -> footer.

MATCH the design's structure + visual, but OVERRIDE copy that conflicts with decisions (do NOT regress):
- CRITICAL: design says "a shareable Wrapped that turns your reading year into something worth posting."
  = the RETRACTED claim. Wrapped is PRIVATE. Replace with private framing (e.g. "a private Wrapped — your
  reading year as art, for your eyes only"). NOT shareable, NOT "worth posting".
- "Free to begin": pricing claim (same as the removed "It's free") -> soften/remove unless Greg wants a
  free-tier line.
- "Nine skins": only 4 built (5 named/unbuilt) -> align count to what ships, or commit to building the 5.
- Indie-bookstore buy-links (Bookshop.org/Libro.fm, "takes no cut"): concrete FEATURE claim -> confirm the
  feature exists/planned before the landing promises it; soften if aspirational.
- MINOR: "the shelf is yours alone" sits under local-first/"your data, your device" -> reads as data
  residency (fine); just confirm it doesn't read as a "never public" shelf promise. Keep the rest of the
  privacy section (ad-free, no trackers, no data-selling, export/no lock-in) -- accurate.
Export lives in Greg's working tree (design/from-design-tool/landing/, gitignored, regenerable) -- not in
this mirror/zip (3.4MB).

## MATCHED + SHIPPED — 2026-06-28 (branch landing-match, PR #4, NOT merged)
Replaced brief-based landing with one matched to the real export: sticky nav -> split hero (token-only
mockup) -> "Reverie speaks your genre" skin showcase -> Features (light band) -> For every reader -> Privacy
-> closing CTA -> footer. Skins shown as LIVE token re-themes of one mockup (not screenshots); Tryst pink
confined to its card. All 4 copy overrides applied: Wrapped->private (retracted "shareable/worth posting"
killed); "Free to begin" dropped; "nine skins"->four+adaptive; buy-links KEPT (real via buyLinks.ts, store
mode no cut) but dropped absolute "never will" (affiliate mode planned, with disclosure); "your data your
device"->data-residency (no never-public read, removed inaccurate "syncs only when you ask"). a11y/perf:
gold tokens unbound from skins, dark CTA text, AA every band, opaque --card-solid on cream (placeholder
lesson applied forward), reduced-motion night sky, responsive nav, below-fold lazy chunk (11.8kB), no
external images. Gate: typecheck+lint+build+e2e 4/4.
PRE-MERGE: visual eyeball only (Code can't pixel-diff) -> skin-shift mockup across all 4 skins, light-band
readability, mobile nav, night-sky feel + reduced-motion, Tryst pink contained. If right -> merge.
FORWARD: when affiliate mode ships, revisit buy-links / "earns nothing" copy (same discipline as privacy
copy when public shelves arrive). A quiet business-model thread (affiliate + pricing) is accumulating ->
worth a deliberate decision eventually.
