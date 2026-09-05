const UNRESERVED = /^[A-Za-z0-9._~-]$/

const normalizeOctets = (input) => {
  let normalized = ''
  for (let index = 0; index < input.length; ) {
    const encoded = input.slice(index).match(/^%([0-9a-f]{2})/i)
    if (encoded) {
      const character = String.fromCharCode(Number.parseInt(encoded[1], 16))
      normalized += UNRESERVED.test(character) ? character : `%${encoded[1].toUpperCase()}`
      index += encoded[0].length
      continue
    }
    const codePoint = input.codePointAt(index)
    const character = String.fromCodePoint(codePoint)
    normalized += encodeURI(character)
    index += character.length
  }
  return normalized
}

const matchesRule = (target, rawPattern) => {
  const pattern = rawPattern.endsWith('$') ? rawPattern.slice(0, -1) : rawPattern
  const endAnchored = rawPattern.endsWith('$')
  let targetIndex = 0
  let patternIndex = 0
  let starIndex = -1
  let retryTargetIndex = -1

  while (targetIndex < target.length) {
    if (patternIndex < pattern.length && pattern[patternIndex] === target[targetIndex]) {
      patternIndex += 1
      targetIndex += 1
      continue
    }
    if (patternIndex < pattern.length && pattern[patternIndex] === '*') {
      starIndex = patternIndex
      patternIndex += 1
      retryTargetIndex = targetIndex
      continue
    }
    if (starIndex >= 0) {
      patternIndex = starIndex + 1
      retryTargetIndex += 1
      targetIndex = retryTargetIndex
      continue
    }
    return !endAnchored && patternIndex === pattern.length
  }
  while (pattern[patternIndex] === '*') patternIndex += 1
  return patternIndex === pattern.length
}

const ruleSpecificity = (pattern) => {
  const endAnchored = pattern.endsWith('$')
  const withoutEnd = endAnchored ? pattern.slice(0, -1) : pattern
  let octets = 0
  for (let index = 0; index < withoutEnd.length; ) {
    if (withoutEnd[index] === '*') {
      index += 1
      continue
    }
    octets += 1
    index += /^%[0-9a-f]{2}/i.test(withoutEnd.slice(index)) ? 3 : 1
  }
  return octets
}

export function parseRobots(text) {
  const groups = []
  let group = null
  let hasRules = false

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim()
    if (!line) continue
    const separator = line.indexOf(':')
    if (separator < 0) continue
    const field = line.slice(0, separator).trim().toLowerCase()
    const value = line.slice(separator + 1).trim()

    if (field === 'user-agent') {
      if (!group || hasRules) {
        group = { agents: [], rules: [] }
        groups.push(group)
        hasRules = false
      }
      if (value) group.agents.push(value.toLowerCase())
      continue
    }
    if (!group || (field !== 'allow' && field !== 'disallow')) continue
    hasRules = true
    if (!value) continue
    const pattern = normalizeOctets(value)
    group.rules.push({
      allow: field === 'allow',
      pattern,
      specificity: ruleSpecificity(pattern),
    })
  }
  return groups
}

export function robotsAccess(groups, rawUrl, productToken = 'ReverieAuthorityScout') {
  const url = new URL(rawUrl)
  if (url.pathname === '/robots.txt') return { allowed: true, matchedRule: null }
  const token = productToken.toLowerCase()
  const exact = groups.filter((group) => group.agents.includes(token))
  const applicable = exact.length ? exact : groups.filter((group) => group.agents.includes('*'))
  const target = normalizeOctets(`${url.pathname}${url.search}`)
  const matching = applicable
    .flatMap((group) => group.rules)
    .filter((rule) => matchesRule(target, rule.pattern))
    .sort(
      (left, right) =>
        right.specificity - left.specificity || Number(right.allow) - Number(left.allow),
    )
  const matchedRule = matching[0] ?? null
  return { allowed: matchedRule?.allow ?? true, matchedRule }
}
