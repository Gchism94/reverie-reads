# Reverie design language — how to build on-brand

Reverie is a **token-driven** design system. There are no CSS utility classes and no component
library to import here — you style with the design tokens (CSS custom properties), and you pick a
**skin** + **mode** to theme everything.

## Skins + modes (the one setup that matters)

Every token is scoped to two data attributes on a wrapping element (usually `<html>`, or any
section): `data-skin` and `data-mode`.

- `data-skin`: `tryst` (Romance — the default), `grimoire` (Fantasy), `aphelion` (Sci-Fi), `marrow` (Horror)
- `data-mode`: `dark` (default) or `light`

```html
<html data-skin="tryst" data-mode="dark">  <!-- everything below now themed Tryst/dark -->
```

`:root` defaults to **Tryst dark**, so content with no wrapper still renders themed. Set the
attributes to switch skin/mode — no rebuild, no class swaps. The four skins share the SAME token
names with different values, so one layout works in all four.

## Style with tokens — never hardcode hex

Use `var(--token)`. The vocabulary (defined in `styles.css` → `tokens/tokens.css`):

- **Surfaces**: `--bg0` (page), `--bg1` (raised), `--card` / `--card-solid` / `--card-2`, `--field`, `--chip`
- **Text**: `--ink` (primary), `--muted` (secondary), `--on-primary` (text on a filled accent)
- **Brand**: `--primary` (bright accent — borders/glyphs, NOT text-safe), `--accent-fill` (solid CTA fill, AA-safe under `--on-primary`), `--violet`, `--blue`, `--gold`
- **Lines**: `--line` (hairline border), `--hair` (gold rule), `--chip-border`
- **Type**: `--font-display` (headings/wordmark, italic), `--font-sans` (body), `--font-mono`
- **Ambiance**: `--star`, `--fog`, `--glow-a`…`--glow-d`, `--vignette`, `--shadow`
- **Demo aliases** (read-only): `--bg`, `--primary-solid` (= `--accent-fill`), `--secondary` (= `--violet`), `--tertiary` (= `--gold`), `--font-body`

**Filled CTAs**: `background: var(--accent-fill); color: var(--on-primary)` (AA-verified in every
skin/mode). Do not put body text directly on `--primary` — it's the bright accent for borders and
glyphs, not an AA text background.

## Where the truth lives

`styles.css` is the whole closure — it `@import`s `tokens/tokens.css` (all skin/mode token sets)
and the Google-Fonts families. Read `tokens/tokens.css` for the exact values per skin. The
`Foundations` cards (Colors, Typography, The skins) show each skin rendered from these tokens.

## One idiomatic snippet

```html
<section data-skin="grimoire" data-mode="dark"
         style="background: var(--bg0); border: 1px solid var(--line); border-radius: 18px; padding: 18px;">
  <h2 style="font-family: var(--font-display); font-style: italic; color: var(--ink);">Reverie</h2>
  <p style="font-family: var(--font-sans); color: var(--muted);">A gothic hush over the night shelf.</p>
  <button style="border: none; border-radius: 999px; padding: 9px 16px;
                 background: var(--accent-fill); color: var(--on-primary); font-family: var(--font-sans);">
    ＋ Add a book
  </button>
</section>
```

Switch `data-skin`/`data-mode` to retheme the exact same markup.
