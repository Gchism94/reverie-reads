/**
 * Forbid a hardcoded Tailwind radius on an element that already carries the skin kit's control
 * silhouette (`.skin-control` / `.skin-field`).
 *
 * ── THE REGRESSION GUARD, NOT THE MIGRATION METER ───────────────────────────────────────────────
 * These two jobs look like one and are not, which is worth stating because the distinction was
 * learned the hard way: a first cut of this guard reported ZERO violations against a codebase with
 * ~192 un-migrated controls, and the zero was correct. Pre-migration, nothing carries
 * `.skin-control`, so a rule keyed off that class is structurally blind to un-migrated code.
 *
 * So this rule does exactly one thing: once a control HAS been migrated, it can never silently
 * regress. `rounded-full` next to `.skin-control` means the element asks for the skin's radius and
 * then overrides it — `--radius-control` is 2px in Aphelion and 999px in Tryst, and the hardcoded
 * class wins in both. That is always a bug, which is why this ships at `error` with no allowlist.
 *
 * Discovery of un-migrated controls is a heuristic ("does this LOOK like a control?") and lives in
 * skinRadiusMigration.test.ts, where a shrinking annotated allowlist can act as the progress meter.
 */

const RADIUS = /\brounded-(?:none|sm|md|lg|xl|2xl|3xl|full)\b/
const CARRIER = /\bskin-(?:control|field)\b/

/** Every string literal inside a JSX className value, template literals included. */
function classStrings(node) {
  const out = []
  const walk = (n) => {
    if (!n) return
    if (n.type === 'Literal' && typeof n.value === 'string') out.push({ node: n, text: n.value })
    else if (n.type === 'TemplateLiteral') {
      for (const q of n.quasis) out.push({ node: q, text: q.value.raw })
      for (const e of n.expressions) walk(e)
    } else if (n.type === 'JSXExpressionContainer') walk(n.expression)
    else if (n.type === 'ConditionalExpression') {
      walk(n.consequent)
      walk(n.alternate)
    } else if (n.type === 'LogicalExpression') {
      walk(n.left)
      walk(n.right)
    } else if (n.type === 'BinaryExpression') {
      walk(n.left)
      walk(n.right)
    }
  }
  walk(node)
  return out
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'a .skin-control/.skin-field element must take its radius from --radius-control, not a hardcoded class',
    },
    schema: [],
    messages: {
      override:
        '"{{cls}}" overrides the skin silhouette on an element that already carries "{{carrier}}". ' +
        '--radius-control is 2px in Aphelion and 999px in Tryst; the hardcoded class wins in both, ' +
        'so the skin stops reaching this control. Remove the rounded-* class.',
    },
  },
  create(context) {
    return {
      JSXAttribute(node) {
        if (node.name?.name !== 'className') return
        const parts = classStrings(node.value)
        const all = parts.map((p) => p.text).join(' ')
        if (!CARRIER.test(all)) return
        const hit = parts.find((p) => RADIUS.test(p.text))
        if (!hit) return
        context.report({
          node: hit.node,
          messageId: 'override',
          data: {
            cls: hit.text.match(RADIUS)[0],
            carrier: all.match(CARRIER)[0],
          },
        })
      },
    }
  },
}
