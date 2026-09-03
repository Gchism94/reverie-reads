export const normalize = (value) =>
  String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')

export const baseTitle = (value) => normalize(String(value ?? '').split(/\s*[:–—]\s*/)[0])

const tokens = (value) => new Set(normalize(value).split(' ').filter(Boolean))

export const similarity = (leftValue, rightValue) => {
  const left = normalize(leftValue)
  const right = normalize(rightValue)
  if (!left || !right) return 0
  if (left === right) return 1
  if (baseTitle(leftValue) === baseTitle(rightValue)) return 0.98

  const leftTokens = tokens(left)
  const rightTokens = tokens(right)
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length
  return (2 * overlap) / (leftTokens.size + rightTokens.size)
}

export const authorMatches = (wantedAuthors, actualAuthors) =>
  wantedAuthors.some((wanted) => {
    const wantedParts = normalize(wanted).split(' ').filter(Boolean)
    const wantedFirst = wantedParts[0]
    const wantedLast = wantedParts.at(-1)
    return actualAuthors.some((actual) => {
      const actualParts = normalize(actual).split(' ').filter(Boolean)
      const actualFirst = actualParts[0]
      const actualLast = actualParts.at(-1)
      if (normalize(wanted) === normalize(actual)) return true
      return (
        Boolean(wantedFirst && wantedLast && actualFirst && actualLast) &&
        wantedLast === actualLast &&
        wantedFirst[0] === actualFirst[0]
      )
    })
  })

export const rankWorkCandidate = (testCase, title, authors = []) => {
  const titleSimilarity = similarity(testCase.title, title)
  const authorMatch = authorMatches(testCase.authors, authors)
  return {
    titleSimilarity,
    authorMatch,
    score: titleSimilarity * 10 + (authorMatch ? 5 : 0),
    acceptable: titleSimilarity >= 0.9 && authorMatch,
  }
}

export const seriesMatches = (membership, actualSeries) => {
  const acceptableNames = [membership.series, ...(membership.aliases ?? [])].map(normalize)
  return acceptableNames.includes(normalize(actualSeries))
}

export const percentile = (values, fraction) => {
  if (!values.length) return null
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]
}

export const slug = (value) => normalize(value).replaceAll(' ', '-').slice(0, 70)
