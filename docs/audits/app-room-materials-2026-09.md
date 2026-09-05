# App and reading-room materials follow-up

Date: 2026-09-05. Follows public #418 and the approved Midnight & Lamplight direction.

## Reader-facing changes

- Appearance reserves the full 150–184px binding height, including space around the head and tail. The preview no longer crops a spine to a 150px box.
- Mobile navigation centers every line of Next read beneath its icon, including a two-line label at 320px.
- Marrow uses seeded mineral clouds, pores, a worn tablet shoulder, displaced branching fractures, tapered cavities, illuminated lips, and small chips. It should evoke old weathered stone without obscuring the reading area.
- Tryst gains velvet depth; Grimoire, stone reveals and leaded glass; Gaslight, refracted rain; Marginalia, deckled paper and graphite; Hearth, linen and timber; Almanac, contour rings and a pressed fern; Firstlight, layered dawn hills. Aphelion keeps its existing art and random sequence.
- App and landing share the scene renderer and open-book brand mark. Home keeps cover proportions, gives actual book titles more presence, and keeps the welcome cue visible on phones. A book with reading history brings its actual journal entry ahead of copy management; undated and unrated entries remain honest.

## Motion and performance

The native Canvas 2D material pass runs into the existing cached still on size/palette changes. It adds no dependency, network request, pointer tracking, React animation state, or per-frame fracture generation. The existing 1.8-million-pixel cap, density cap, 8fps night glow, and hidden/offscreen/reduced-motion cancellation remain intact. Material detail is deterministic.

This follows [MDN's Canvas optimization guidance](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas) to cache repeated static drawing and avoid expensive effects on every frame.

## Product scope

Discover now has book previews before adding: cover/title opens description and bibliographic information, with a route to an existing personal book or deliberate wishlist addition. Browse-context persistence, addressable discovery details, richer curated paths, and catalog-quality work remain in the ordered roadmap. Appearance never selects a discovery genre.

Account-level modular arrangements remain a **design to do**. The guest arrangement controls demonstrate the interaction; they do not save an account preference. See [the design brief](../backlog/task-modular-library-arrangements.md) and [the ordered roadmap](../../ROADMAP.md).

## Verification record

The original private release candidate ddb1dec completed its fresh-database full browser run with 239 passed, 10 skipped, and one failure: the Aphelion dark core accessibility pass exceeded its 90-second budget while navigating. Its trace contains slow local module requests; this is timing evidence, not proof of a fixed cause. Hosted ordinary, mobile, and accessibility checks all passed on that same candidate. SQL verification passed 1,528 assertions. The original failure and storage-health recovery logs remain preserved in the release worktree's output/playwright/guest-full-evidence and adjacent logs.

The material follow-up has a separate final verification record below; it does not overwrite that result.

The focused reader-flow run passed five journeys, including Home cover geometry, saved reading history, centered phone navigation, and full spine containment for all nine rooms in both modes at 320px and 1,440px. It exposed a sixth-path failure: onboarding waited for every query refresh after the import had already committed. The trace records a 17-second books query ending in SQLSTATE 57014, then a successful retry. Import acknowledgement now follows the completed write immediately; next-step suggestions wait for actual refreshed books and retain error/retry controls. A regression keeps the refresh promise unresolved and verifies acknowledgement, waiting, and retry without importing twice. The original focused failure is preserved in output/playwright/material-focused-evidence.
