import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The INTERIM uppercase overrides — a ratchet whose target is ZERO, and whose whole reason for
// existing is to make sure it gets there.
//
// ── WHAT THESE OVERRIDES ARE ────────────────────────────────────────────────────────────────────
// `.skin-control` sets `text-transform: var(--control-transform)`, which is `uppercase` in aphelion,
// umbra and almanac. `text-transform` is INHERITED, so it reaches descendants too. The control-radius
// migration routed 13 call sites onto `.skin-control` whose labels are DATA — book titles, series
// names, author names, the reader's own tags and tropes, and text the reader had just typed into a
// search box. Those render as A COURT OF THORNS AND ROSES in three of the nine skins: the app
// editorializing content it did not write.
//
// The correct fix is `.skin-control-quiet` (audit §12) — the same class minus its typography
// declarations. That needs a ruling. These inline `textTransform: 'none'` overrides close the defect
// in the meantime.
//
// ── WHY THIS FILE EXISTS AT ALL ─────────────────────────────────────────────────────────────────
// An interim fix with no forcing function is a permanent fix nobody chose. This test is the forcing
// function: it pins the override set EXACTLY — not `<=`, but equality — so the list cannot quietly
// grow, and it fails loudly when the count is anything other than expected. When
// `.skin-control-quiet` lands, every entry here is deleted along with its override, `EXPECTED`
// becomes `[]`, and the file is removed with the last one.
//
// Equality rather than a `<=` ratchet is deliberate: a `<=` bound would let a 14th override be added
// silently, and "add another inline override" is exactly the path of least resistance this file is
// meant to close off. The count is asserted directly, and printed on failure, per AGENTS.md's rule
// that a ratchet's budget must be a measurement rather than a calculation.

const SRC = join(__dirname, '..')

// Count the OVERRIDE ITSELF, not the marker comment beside it. A first draft counted
// `SKIN-UPPERCASE-INTERIM`, and mutation testing killed it: Prettier reflows the comment onto the
// NEXT property, so deleting `textTransform: 'none'` left the marker sitting on `background` and the
// ratchet stayed green while the defect came back. That is a proxy guard in the exact sense AGENTS.md
// names — it certified a property adjacent to the defect (a comment exists) while the defect itself
// (the override is gone) was invisible to it. The comment stays, but only as documentation for a
// human reading the file; the assertion is keyed to the declaration.
const OVERRIDE = /textTransform:\s*'none'/

/**
 * The 9 override SITES, covering 13 affected call sites — `Chip.tsx` and `TropeChip.tsx` are shared
 * components, so one override each fixes every caller.
 *
 * Each entry: 'file': 'what data it was uppercasing'.
 */
const EXPECTED: Record<string, string> = {
  'components/Chip.tsx':
    'the shared filter chip — covers 5 call sites: genre names, subgenre names, the reader’s own tags/tropes (FilterPanel), and author names twice (FromYourAuthors)',
  'components/TropeChip.tsx': 'a trope name — reader-facing content, rendered from `name`',
  'components/TropePicker.tsx':
    '“＋ Add “{q.trim()}” as your own” — text the reader typed into the search box a moment earlier',
  'components/JustFinishedSheet.tsx': '“Add to {tbr.name}” — the reader’s own shelf name',
  'library/Toolbar.tsx': '“Author: {filters.author}” — an author name in the active filter chip',
  'book/dialogs.tsx':
    'two sites: “Keep it in {oldSeries}” (a series name) and the merge candidate list’s {b.title} (a book title)',
  'routes/SeriesRoute.tsx': '“…and onto {t.name}” — a series name in the acquire dialog',
  'routes/SharedListRoute.tsx': 'the search result’s {b.title} — a book title',
}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (p.endsWith('.tsx') && !p.includes('.test.')) out.push(p)
  }
  return out
}

describe('interim uppercase overrides (target: 0 — deleted when .skin-control-quiet lands)', () => {
  const found: { file: string; line: number }[] = []
  for (const abs of walk(SRC)) {
    const rel = abs.slice(SRC.length + 1)
    readFileSync(abs, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (OVERRIDE.test(line)) found.push({ file: rel, line: i + 1 })
      })
  }

  it('every listed override states which data it protects', () => {
    for (const [file, reason] of Object.entries(EXPECTED)) {
      expect(reason.trim().length, `"${file}" has no reason`).toBeGreaterThan(20)
    }
  })

  it('the override set is EXACTLY the documented one — no additions, no silent removals', () => {
    const actual = [...new Set(found.map((f) => f.file))].sort()
    const expected = Object.keys(EXPECTED).sort()
    expect(
      actual,
      `Interim uppercase overrides drifted from the documented set.\n` +
        `  found:    ${actual.join(', ') || '(none)'}\n` +
        `  expected: ${expected.join(', ') || '(none)'}\n` +
        `If .skin-control-quiet has landed, delete the override AND its EXPECTED entry together; ` +
        `when both are empty, delete this file.`,
    ).toEqual(expected)
  })

  it('9 overrides remain (TARGET 0 — this number must only ever go DOWN)', () => {
    expect(
      found.length,
      `${found.length} interim uppercase overrides still in the tree, at: ` +
        found.map((f) => `${f.file}:${f.line}`).join(', '),
    ).toBe(9)
  })
})
