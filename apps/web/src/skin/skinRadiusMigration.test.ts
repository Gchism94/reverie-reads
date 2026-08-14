import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The control-radius migration PROGRESS METER.
//
// ── WHY THIS EXISTS SEPARATELY FROM THE ESLINT RULE ─────────────────────────────────────────────
// `skin/no-hardcoded-control-radius` (eslint-rules/) forbids a hardcoded radius on an element that
// ALREADY carries `.skin-control` / `.skin-field`. That is precise and has no false positives — but
// it is structurally blind to un-migrated code, because un-migrated controls do not carry the class
// yet. Measured: it reported 0 violations against a codebase with ~192 un-migrated controls, and
// the 0 was correct.
//
// So discovery needs the opposite question — "does this element LOOK like a control while using a
// hardcoded radius?" — which is a heuristic, and heuristics need an escape hatch. Hence: this test,
// with an allowlist that shrinks to zero as the migration lands.
//
// ── THE ALLOWLIST RULE ──────────────────────────────────────────────────────────────────────────
// Every entry carries a reason, inline, and the test FAILS on an entry with an empty reason. An
// unannotated allowlist becomes a dumping ground and the meter stops meaning anything — at which
// point this file is worse than nothing, because it reports a number that no longer tracks reality.
//
// A radius is "hardcoded" here whether it is `rounded-full` or `rounded-xl`: both bypass
// `--radius-control` equally, and stopping at `rounded-full` would let the meter reach zero while
// ~54 controls still ignore the token.

const SRC = join(__dirname, '..')
const RADIUS = /\brounded-(?:none|sm|md|lg|xl|2xl|3xl|full)\b/
const CARRIER = /\bskin-(?:control|field|card|panel)\b/

/** Files whose radii are ARTWORK — SVG ornaments, star fields, spine geometry — never controls. */
const ARTWORK_FILES = [
  'components/CoverPlaceholder.tsx',
  'components/Sky.tsx',
  'components/Stars.tsx',
  'components/Spine.tsx',
  'components/SpineShelf.tsx',
  'components/Structure.tsx',
  'components/Nameplate.tsx',
  'auth/Wordmark.tsx',
  'auth/landing/SkinShowcase.tsx',
  'auth/landing/below-fold.tsx',
  'auth/landing/Mockup.tsx',
  'routes/LabRoute.tsx',
  'routes/LabStructureRoute.tsx',
]

/**
 * Known, deliberate exceptions — `'file:line-ish marker': 'why'`. Shrinks to {} as the migration
 * lands. An entry with an empty reason fails the test.
 */
const ALLOW: Record<string, string> = {
  // The h-[3px] progress tracks in SeriesRoute are NOT listed here: the control heuristic already
  // excludes them (no px-*, no h-9..12), so an entry for them would suppress nothing while implying
  // it had been considered and waived. A dead allowlist entry is the dumping-ground failure in
  // miniature — found by mutation-testing this very list.
  'library/SeriesView.tsx|h-12 w-3':
    'a 3px-wide spine sliver in the series strip — rounded-sm is glyph geometry on artwork, not a control silhouette',
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

/** Heuristic: does this line describe a CONTROL (something a reader clicks or types into)? */
function looksLikeControl(line: string): boolean {
  const w = [...line.matchAll(/\bw-([\w./[\]%-]+)/g)].map((m) => m[1])
  const h = [...line.matchAll(/\bh-([\w./[\]%-]+)/g)].map((m) => m[1])
  // a square box is a circular icon button or avatar — correct as rounded-full, not a pill
  if (w.length && h.length && w.some((x) => h.includes(x))) return false
  return /\bpx-[0-9.]/.test(line) || /\bh-(9|10|11|12)\b/.test(line)
}

describe('control-radius migration meter', () => {
  const findings: { file: string; line: number; text: string }[] = []
  for (const abs of walk(SRC)) {
    const rel = abs.slice(SRC.length + 1)
    if (ARTWORK_FILES.includes(rel)) continue
    readFileSync(abs, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (!RADIUS.test(line) || CARRIER.test(line)) return
        if (!looksLikeControl(line)) return
        if (
          Object.keys(ALLOW).some((k) => {
            const [f, marker] = k.split('|')
            return rel === f && line.includes(marker!)
          })
        )
          return
        findings.push({ file: rel, line: i + 1, text: line.trim().slice(0, 90) })
      })
  }

  it('every allowlist entry states why', () => {
    for (const [k, reason] of Object.entries(ALLOW)) {
      expect(reason.trim().length, `allowlist entry "${k}" has no reason`).toBeGreaterThan(10)
    }
  })

  // TARGET: 0. Lower this as batches land — it may only ever go DOWN, which is what makes it a
  // ratchet rather than a number someone edits to make the suite green.
  const BUDGET = 112

  it(`no more than ${BUDGET} controls still use a hardcoded radius (ratchet — lower it, never raise it)`, () => {
    const byFile = findings.reduce<Record<string, number>>((a, f) => {
      a[f.file] = (a[f.file] ?? 0) + 1
      return a
    }, {})
    const top = Object.entries(byFile)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([f, n]) => `${f} (${n})`)
      .join(', ')
    expect(
      findings.length,
      `${findings.length} controls still bypass --radius-control. Biggest: ${top}. ` +
        `If this number went DOWN, lower BUDGET to match — that is the migration meter.`,
    ).toBeLessThanOrEqual(BUDGET)
  })
})
