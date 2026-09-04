import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalize, slug } from './normalize.mjs'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(packageRoot, '../..')

const parsePosition = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const assertCase = (testCase) => {
  if (!testCase?.id || !testCase?.title || !Array.isArray(testCase.authors)) {
    throw new Error(`Invalid trial case: ${JSON.stringify(testCase)}`)
  }
  if (!['reviewed', 'candidate'].includes(testCase.truth?.status)) {
    throw new Error(`Case ${testCase.id} has no valid truth status`)
  }
  if (!Array.isArray(testCase.truth.memberships) || !Array.isArray(testCase.truth.sources)) {
    throw new Error(`Case ${testCase.id} has an incomplete truth record`)
  }
  return testCase
}

const loadJson = async (path) => JSON.parse(await readFile(path, 'utf8'))

export async function loadTrialCases() {
  const [seed, gold, externalCandidates] = await Promise.all([
    loadJson(resolve(repositoryRoot, 'data/corpus_seed.json')),
    loadJson(resolve(packageRoot, 'data/authority-gold.json')),
    loadJson(resolve(packageRoot, 'data/authority-candidates.json')),
  ])

  const highestBySeries = new Map()
  for (const book of seed) {
    const series = String(book.series ?? '').trim()
    if (!series) continue
    const current = highestBySeries.get(series)
    const position = parsePosition(book.position)
    if (!current || (position ?? -1) > (parsePosition(current.position) ?? -1)) {
      highestBySeries.set(series, book)
    }
  }

  const goldByTitle = new Map(gold.cases.map((entry) => [normalize(entry.title), entry]))
  const includedGoldIds = new Set()
  const cases = [...highestBySeries.entries()].map(([series, book]) => {
    const reviewed = goldByTitle.get(normalize(book.title))
    if (reviewed?.sampleOrigin === 'reverie') {
      includedGoldIds.add(reviewed.id)
      return reviewed
    }

    return {
      id: `reverie-${slug(series)}-${slug(book.title)}`,
      title: book.title,
      authors: [`${book.first ?? ''} ${book.last ?? ''}`.trim()].filter(Boolean),
      sampleOrigin: 'reverie',
      stratum: 'reverie_seed_candidate',
      truth: {
        status: 'candidate',
        standalone: false,
        memberships: [
          {
            series,
            aliases: [],
            role: 'primary',
            positions:
              parsePosition(book.position) == null
                ? []
                : [{ value: parsePosition(book.position), orderType: 'unspecified' }],
          },
        ],
        sources: [{ kind: 'reverie_seed', ref: 'data/corpus_seed.json' }],
      },
    }
  })

  cases.push(...externalCandidates.cases)

  for (const reviewed of gold.cases) {
    if (!includedGoldIds.has(reviewed.id)) cases.push(reviewed)
  }

  const seenIds = new Set()
  const validated = cases
    .map(assertCase)
    .sort((left, right) => left.id.localeCompare(right.id))
    .filter((testCase) => {
      if (seenIds.has(testCase.id)) throw new Error(`Duplicate case id: ${testCase.id}`)
      seenIds.add(testCase.id)
      return true
    })

  return {
    schemaVersion: 1,
    methodology: {
      seedWorks: seed.length,
      distinctSeedSeries: highestBySeries.size,
      reviewedCases: validated.filter((entry) => entry.truth.status === 'reviewed').length,
      candidateCases: validated.filter((entry) => entry.truth.status === 'candidate').length,
      note: 'Candidate references measure agreement only. They are not ground truth.',
    },
    sharedSources: gold.sharedSources ?? {},
    cases: validated,
  }
}

export function selectCases(caseSet, scope) {
  if (scope === 'gold') return caseSet.cases.filter((entry) => entry.truth.status === 'reviewed')
  if (scope === 'reverie') return caseSet.cases.filter((entry) => entry.sampleOrigin === 'reverie')
  if (scope === 'all') return caseSet.cases
  throw new Error(`Unknown scope ${scope}; expected all, gold, or reverie`)
}
