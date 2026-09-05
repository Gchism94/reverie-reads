# Reverie design system

Reverie is one living library expressed through nine reading rooms. Content, navigation, and
interaction semantics remain stable; typography, material, geometry, atmosphere, and voice change
with the active skin. A skin is an interface language, not a color swap.

The shipping token values live in `packages/core/src/skins.ts` and
`apps/web/src/styles/tokens.css`. The structural and component contract lives in
`docs/reference/SKIN_CHARACTER_CONTRACT.md`. Design-tool exports, when present, are references; the
shipped app is authoritative.

## The Reverie brand

The front door is a personal library: deep blue-green ink, warm paper, and a sea-glass accent.
Newsreader supplies the editorial display voice; Hanken Grotesk keeps navigation and body copy
plain and welcoming. The open-book wordmark belongs to Reverie across genres. Tryst retains its
own romance identity inside the product.

Brand tokens live in `apps/web/src/styles/brand.css`. They scope the landing page and account
screens independently of the reader's saved skin. Product examples have their own complete
skin/mode scopes, including structural components and backgrounds. One room selection updates
every example without changing the visitor's saved appearance or sample reading choices.

The brand promise is “A personal library that feels like home.” Explain that through concrete
actions: keep your books together, remember your reading, and find something you want to read.
Warmth comes from familiarity and permission, without romance-only language or reading pressure.

## Nine rooms, two modes

Every room supports light and dark modes independently of skin selection.

| Skin       | Room character                   | Control character                               |
| ---------- | -------------------------------- | ----------------------------------------------- |
| `tryst`    | intimate, gaslit, gilt           | compact invitation with a quiet gilt edge       |
| `grimoire` | scholarly, arcane, vellum        | precise manuscript control with a gilt rule     |
| `aphelion` | cold, orbital, instrumented      | machined notch and cyan instrument edge         |
| `marrow`   | forensic, mineral, severe        | hard chamfer and specimen-dark boundary         |
| `umbra`    | investigative, nocturnal, brass  | compact case label with a brass edge            |
| `folio`    | literary, editorial, tactile     | proof-red editorial edge                        |
| `hearth`   | domestic, warm, handmade         | softly squared label with restrained stitching  |
| `almanac`  | practical, field-recorded, exact | squared field label with a measured double rule |
| `bloom`    | youthful, luminous, optimistic   | softly rounded gel edge without sticker bulk    |

Prototype-era “Nocturne” and “Magnolia Dawn” do not name shipping themes. Their atmosphere survives
inside Tryst; mode remains `light`, `dark`, or `system` for every skin.

## Typography and readability

- Display typography gives each room identity; body and control typography must remain immediately
  readable.
- Primary reading text should be at least 14px in the product. Supporting labels should normally be
  12px or larger. Smaller type is reserved for nonessential cover marks and very narrow book spines.
- Body copy uses a 1.5–1.65 line height. Multiline display headings on the landing page use at least
  1.14; inspect ascenders, descenders, and wrapping in the actual fonts at every breakpoint.
- Letter spacing is restrained at small sizes. Uppercase labels use shorter words and no more
  tracking than their skin needs.
- Text never relies on atmosphere or texture for contrast. It sits on an opaque authored surface or
  a tested scrim.

## Controls

All skins share one interaction hierarchy:

- Primary: the room's authored CTA fill and ink, a clear edge, and restrained depth.
- Secondary: opaque `--card-solid`, `--ink`, and a control boundary that clears 3:1 against its own
  surface.
- Icon: the same material as secondary, with a minimum 44×44px target in navigation and primary
  product flows.
- Ghost: reserved for low-emphasis actions whose location and label make interactivity clear.

Skin identity comes from corners, cut geometry, border rhythm, type, and accent treatment. Icon
buttons must not become wax seals, grommets, wooden buttons, or other decorative silhouettes whose
meaning disappears at small size. Theme and skin color changes land atomically so foreground and
background never animate through a low-contrast midpoint.

Every control has a visible `:focus-visible` outline, a clear disabled state, and conventional
hover/pressed feedback. Motion is disabled under `prefers-reduced-motion`.

## Atmosphere and background

Atmosphere lives behind content. It may drift, breathe, pulse, or reveal room-specific structure,
but it must remain subtle, low-frequency, and nonessential. The opaque component surface is the
readability floor; texture, grid, crack, grain, or glow never becomes the text background.

Use the room's atmosphere only where it improves orientation or emotional continuity. Avoid an
effect when it competes with a cover, makes scrolling feel unstable, or exists only to prove the
skin is different.

The shared Canvas 2D renderer authors a separate scene for each room: a lamplit salon, tower
study, orbital alcove, sheltered archive, rainy study, writing desk, window seat, field study,
and dawn corner. Architectural details stay around the margins. Day mode is still; night mode
adds a slow, slight change in local light. Reduced motion, hidden pages, and offscreen previews
rest. Static scene caching and a bounded canvas resolution keep the effect inexpensive.

## Signature components

- Spine shelves: real skin-specific book spines that reveal a selected cover without changing the
  shelf's layout width.
- Cover cards: authentic book information and restrained status marks; never aggregate ratings.
- Reading-goal ring: a skin-specific progress motif with a guaranteed center surface/ink pair.
- Navigation: stable destinations and hit targets, with each room's material and active-state
  grammar.
- Landing playgrounds: use the same components, tokens, and synthetic fixtures as the app. They may
  be scaled, but informative text remains readable and the preview must not invent a second UI.

## Quality floor

- Mobile-first and visually checked at narrow mobile, large mobile, tablet, and desktop widths.
- WCAG AA text contrast in all nine skins × both modes; 3:1 boundaries for controls and focus cues.
- 44px targets for primary/icon navigation controls; never allow arrow or toggle controls to shrink.
- Visible keyboard focus, usable zoom, meaningful names, logical focus order, and reduced motion.
- Sentence case, plain verbs, honest product claims, and empty states that invite a concrete action.
- Automated contrast/axe checks are necessary but not sufficient: inspect wrapping, clipping,
  density, line spacing, and transient mode changes in the rendered interface.
