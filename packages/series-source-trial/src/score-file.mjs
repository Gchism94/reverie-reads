import { access, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadTrialCases } from './cases.mjs'
import { renderScoreMarkdown, scoreProvider } from './score.mjs'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(packageRoot, '../..')
const [inputPath, outputPath] = process.argv.slice(2).filter((value) => value !== '--')
if (!inputPath) throw new Error('Usage: pnpm score PROVIDER_RESULT.json [REPORT.md]')

const resolveExisting = async (path) => {
  const candidates = [resolve(path), resolve(repositoryRoot, path)]
  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch {
      // Try the next supported invocation root.
    }
  }
  throw new Error(`Provider result not found: ${path}`)
}

const resolvedInputPath = await resolveExisting(inputPath)

const [input, caseSet, policy] = await Promise.all([
  readFile(resolvedInputPath, 'utf8').then(JSON.parse),
  loadTrialCases(),
  readFile(resolve(packageRoot, 'data/evaluation-policy.json'), 'utf8').then(JSON.parse),
])
const runs = Array.isArray(input.runs) ? input.runs : [input]
const scores = runs.map((run) => scoreProvider(caseSet, run, policy))
const report = renderScoreMarkdown(scores, caseSet)
if (outputPath) await writeFile(resolve(outputPath), report)
console.log(report)
