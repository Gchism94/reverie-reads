# Design system

Gothic New Orleans — the Vieux Carré after dark: gaslight on wet cobblestone, wrought
iron, magnolias, a warm night sky that never quite holds still. Romantic and a little
witchy, but legible and cozy, never cluttered.

The live, animated reference is `Reverie_Theme_Studio.html` in this folder.

---

## Themes (exactly two)

One shared accent family — magenta, plum/violet, indigo/midnight-blue, and gold — so
both modes read as one product. **Lead with magenta + gold in both.**

### Nocturne — dark mode (default)
Deep gaslit midnight. **No red/crimson** (removed — magenta carries the warmth).

| Token | Hex | Use |
|---|---|---|
| `--bg0` | `#0b0612` | base background |
| `--bg1` | `#15091f` | gradient end |
| `--ink` | `#f6e9f1` | primary text |
| `--muted` | `#b08fae` | secondary text |
| `--primary` | `#e83a78` | magenta — primary actions |
| `--violet` | `#7b3fa0` | violet accent |
| `--blue` | `#16266a` | midnight blue accent |
| `--gold` | `#f0b14e` | gaslamp gold — the only warm accent, hairlines, filigree |
| `--panel` | `rgba(26,14,36,.52)` | glass panels |
| `--line` | `rgba(246,233,241,.14)` | borders |

Night-sky glows: magenta, violet, midnight-blue (no crimson glow).

### Magnolia Dawn — light mode
Warm parchment daylight, morning light through lace. Same jewels, dressed for day.

| Token | Hex | Use |
|---|---|---|
| `--bg0` | `#fbeee9` | parchment background |
| `--bg1` | `#f5e0e4` | gradient end |
| `--ink` | `#2a1320` | deep aubergine text |
| `--muted` | `#9a6b86` | secondary text |
| `--primary` | `#d4396f` | bougainvillea magenta |
| `--violet` | `#7b3fa0` | plum accent |
| `--blue` | `#2e3a73` | indigo accent |
| `--gold` | `#c9842f` | antique gilt |
| `--panel` | `rgba(255,251,248,.66)` | panels |
| `--line` | `rgba(42,19,32,.13)` | borders |

Dawn glows: soft rose, lavender, peach, periwinkle on parchment.

> Gloaming (the dusk middle palette) is retired from the shipping set — kept in the
> theme studio as a reference only. The product ships Nocturne + Magnolia Dawn.

---

## Typography
- **Display:** Fraunces (high-contrast, optical sizing). Use the *italic* for romance
  softness on titles, section headers, and palette names. Large, tight, generous space.
- **Body / UI:** Hanken Grotesk.
- Type is part of the identity, not a neutral delivery vehicle — make headings memorable.

## Motion & texture (the signature)
A living night sky behind content: large soft radial-gradient glows that slowly drift
and breathe (20–45s loops), faint twinkling stars, a slow drifting fog layer, plus
subtle film grain and a vignette. Nocturne = magenta/violet/blue nebula on near-black;
Magnolia Dawn = rose/lavender/peach dawn clouds on parchment. Keep it gentle. **Respect
`prefers-reduced-motion`** (disable the drift/twinkle/fog).

**Ornament:** a thin wrought-iron **filigree divider** in gold under the wordmark and at
section breaks. Hairline rules in gold.

## Signature components
- **Spine-shelf bookcases** — lists as a horizontal row of book *spines* (vertical
  titles) that flip to the cover when centered/scrolled. Used for TBRs, collections,
  priority shelf.
- **Cover cards** with small spice (🌶️) and favorite (♥) marks.
- **Reading-goal ring** — circular yearly progress.

## Component inventory
Buttons (primary = magenta→gold gradient; soft; ghost), chips/filters (on/off),
segmented toggles, search bar, modals/sheets, cards, the spine shelf, progress bars,
the goal ring, calendar cells, stat bars. Provide hover + visible keyboard focus, and an
empty state for at least Library and Clubs. Empty states invite action in the app's
voice ("Mark a book 'Reading' and your home comes alive").

## Quality floor
Mobile-first, responsive to desktop; adequate contrast in both themes; visible focus;
reduced motion respected; sentence case, plain verbs, no filler copy. Spend the boldness
on the living sky + filigree + spine shelves; keep everything else quiet.
