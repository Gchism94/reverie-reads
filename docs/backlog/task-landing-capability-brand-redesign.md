# Backlog task: landing-page capability and brand redesign

Priority: **P1 after the series truth and Library experience overhaul**.

The current landing page remains shipped and supported until this replacement passes its full gate.
This task is a redesign, not a claim that the production page is broken.

## Discovery

- Inventory every currently reachable app capability and its real limitations before writing copy.
- Identify the few user stories that best express Reverie Reads: a personal library, thoughtful
  reading context, household awareness without collapsing identity, discovery grounded in the
  reader, and an interface that changes character without losing clarity.
- Derive typography, color, surfaces, motion, imagery, and interaction from the authenticated app
  and its brand system rather than applying a generic marketing template.
- Build all glimpses from curated fixtures designed for publication. Never use production library
  screenshots, owner names, notes, ratings, or reading history.

## Experience requirements

- Warm, personal, specific Reverie voice with plain claims and no generic SaaS filler.
- Accurate previews of real current workflows; no invented feature, misleading composite, or stale
  screenshot.
- A clear path for new visitors to understand, sign up, sign in, and return to their library.
- Responsive storytelling rather than a desktop page merely stacked on mobile.
- Keyboard/focus behavior, reduced motion, contrast across the relevant brand modes, semantic
  structure, fast above-fold rendering, stable layout, metadata/SEO, and share previews.
- Claims and revenue copy remain generated or guarded from the same product configuration where the
  app already uses that pattern.

## Completion gate

Run a capability/claims audit against the final copy, verify every preview against a reachable app
flow, test signed-out routes and auth entry states across target viewports, run accessibility and
performance checks, and compare the result with the authenticated product for brand continuity.
The old page is removed only after the replacement is production-ready and independently reviewed.
