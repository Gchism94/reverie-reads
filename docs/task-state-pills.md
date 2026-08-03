# State pills — borrowed and DNF become visible

Owner-specified, 2026-07-29. CoverCard and spines only.

## Context

Two book states were unreadable while browsing:

- **Borrowed** had a mark on cards, but a translucent one. Over arbitrary cover art
  `rgba(0,0,0,0.45)` composites to `#8c8c8c` against white artwork, where the nine skins' accents
  measure **1.1–2.7:1** and white ink reaches only ~3.2:1. All fail AA, and it was failing in
  production. Nothing caught it because **axe cannot measure text over an image** — the sweep is
  structurally blind to this surface.
- **DNF had nothing, anywhere.** No mark on any card, spine, thumb or rail, and no aria text: a grep
  for accessible names mentioning borrow or DNF returned zero hits across the whole app. It appeared
  only in two controls — the Library read-status filter and the read-status radio.

This matters most for the shelf model: with `shelf_breakdown_dnf` off, an abandoned book sits on a
shelf labelled **Read**. The pill is what makes that honest rather than a lie the UI tells quietly.

## Decisions

- **Token: `--mark-accent`** (skin voice), not a new caution token. DNF is a reader's recorded
  choice, not an error. Already tokenized for all nine skins and registry-covered.
- **Solid on `--card-solid` with `--ink`**, never translucent. This converts borrowed's existing
  mark too — deliberate scope, not drift.
- **Distinguished by slot and text, never by colour alone.** Both pills share one accent; the word
  and the position carry the meaning.
- **Fixed order everywhere: DNF, then borrowed.** Reading order on a card (top-left read-status slot
  before bottom-right possession slot), head before tail on a spine, and the same order in every
  accessible name. One book never renders differently in two places.

## Surfaces

| surface                     | visual                   | accessible name                            |
| --------------------------- | ------------------------ | ------------------------------------------ |
| CoverCard (~132px+)         | both pills, solid        | `Open {title}, did not finish, borrowed`   |
| Spine (26–48px)             | edge marker, head + tail | same suffix — **the load-bearing channel** |
| Flipped spine cover (120px) | both pills, solid        | (the spine button's name)                  |
| Thumb-class (36–48px)       | **none** — see BACKLOG   | suffix only                                |

### Spines: head vs tail

`dnf` marks the **head**, `borrowed` the **tail**. Two positions, never two colours.

DNF takes the head for two reasons. The tail is the busier end across skins — a colophon plus a
band, dip or ink-block up to 14px — while the head band is 2–8px and the head label is gated on
width. And DNF is the state with no signal anywhere else in the app, so it earns the clearer
position. Head-before-tail also matches the card and the accessible name.

Markers use the existing absolute `z-3` edge idiom (Almanac's 5×24px orange index tab is the
precedent), on the **left** edge because Almanac's tab already owns the right. Being absolutely
positioned, they cost nothing from `fitSpineTitle`, which budgets only the flow anatomy.

**Narrowest case — a 26px spine with both markers and a 13px title:** the marker occupies x 0–4.
The vertical title is centred by `items-center` in the full 26px, so at the 13px floor it runs
x 6.5–19.5. **2.5px clearance**, and the author label (9–9.5px, x 8.25–17.75) is clear by more. The
20px vertical insets clear the head/tail bands and Aphelion's corner brackets (y 9–15 at either end).

The marker is **supplementary by design**: spine bindings are per-skin gradients that no token
fixture describes, so it is not held to a text-contrast bar and does not carry the information
alone. The accessible name does that; the marker is a find-it-fast affordance.

## Guards

Three layers, because no single one can see the whole thing:

1. **`packages/core/src/statePill.contrast.test.ts`** — registry-keyed over all nine skins × both
   modes from `SKIN_TOKENS`, failing loudly on a skin with no row. Pins the pill word at ≥4.5:1 and
   the glyph at ≥3:1, and asserts the surface token is not an `rgba()`/`transparent` scrim. This is
   the only layer that can see contrast here.
2. **`apps/web/src/components/statePill.test.tsx`** — proves the components actually _use_ those
   tokens. The contrast test measures token names; a component that inlines `rgba(0,0,0,0.45)`
   would leave it green while shipping the defect.
3. **`apps/web/e2e/state-pills.spec.ts`** — in the **main** job, not the a11y sweep, because axe
   would pass a pill nobody can read. Asserts the pills render on real cards and that state reaches
   the accessibility tree, including on a spine shelf.

## Verification

- All three e2e tests verified **red on `main`** before the fix, each on its own assertion.
- Mutation-checked: removing the DNF pill, and reverting a pill to translucent.
- Standing e2e run, and rendered output checked in the real authenticated app — including a spine
  shelf, the surface that had never carried state.
