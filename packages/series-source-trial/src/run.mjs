import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadTrialCases, selectCases } from './cases.mjs'
import { supplementalEnsembles } from './ensemble.mjs'
import { googleBooks } from './providers/google-books.mjs'
import { hardcover } from './providers/hardcover.mjs'
import { openLibrary } from './providers/openlibrary.mjs'
import { wikidata } from './providers/wikidata.mjs'
import { renderScoreMarkdown, scoreProvider } from './score.mjs'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const adapters = new Map(
  [openLibrary, wikidata, googleBooks, hardcover].map((adapter) => [adapter.name, adapter]),
)

const parseArgs = (argv) => {
  const options = { providers: 'openlibrary,wikidata,google-books', scope: 'all', out: null }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--') continue
    if (value === '--providers') options.providers = argv[++index]
    else if (value === '--scope') options.scope = argv[++index]
    else if (value === '--out') options.out = argv[++index]
    else throw new Error(`Unknown argument ${value}`)
  }
  return options
}

const timestamp = () =>
  new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
const options = parseArgs(process.argv.slice(2))
const caseSet = await loadTrialCases()
const selected = selectCases(caseSet, options.scope)
const policy = JSON.parse(
  await readFile(resolve(packageRoot, 'data/evaluation-policy.json'), 'utf8'),
)
const providerNames = options.providers
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
const runs = []

console.log(
  `Loaded ${selected.length} cases (${selected.filter((entry) => entry.truth.status === 'reviewed').length} reviewed).`,
)
for (const providerName of providerNames) {
  const adapter = adapters.get(providerName)
  if (!adapter) throw new Error(`Unknown provider ${providerName}`)
  console.log(`Starting ${providerName}.`)
  const startedAt = new Date().toISOString()
  const results = await adapter.run(selected, (message) => console.log(message))
  runs.push({
    schemaVersion: 1,
    provider: providerName,
    observedAt: startedAt,
    completedAt: new Date().toISOString(),
    rights: adapter.rights,
    results,
  })
}

const selectedSet = {
  ...caseSet,
  methodology: {
    ...caseSet.methodology,
    reviewedCases: selected.filter((entry) => entry.truth.status === 'reviewed').length,
    candidateCases: selected.filter((entry) => entry.truth.status === 'candidate').length,
  },
  cases: selected,
}
const scores = runs.map((run) => scoreProvider(selectedSet, run, policy))
const ensembleRuns = supplementalEnsembles(runs)
scores.push(...ensembleRuns.map((run) => scoreProvider(selectedSet, run, policy)))
const basePath = resolve(
  packageRoot,
  options.out ?? `reports/series-source-trial_${options.scope}_${timestamp()}`,
)
await mkdir(dirname(basePath), { recursive: true })
await Promise.all([
  writeFile(
    `${basePath}.json`,
    `${JSON.stringify({ schemaVersion: 1, caseSet: selectedSet, runs, ensembleRuns, scores }, null, 2)}\n`,
  ),
  writeFile(`${basePath}.md`, renderScoreMarkdown(scores, selectedSet)),
])

console.log(renderScoreMarkdown(scores, selectedSet))
console.log(`Wrote ${basePath}.json and ${basePath}.md`)
