import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditAuthoritySample, renderAuthoritySampleMarkdown } from './authority-sample.mjs'
import { loadTrialCases } from './cases.mjs'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputPath = process.argv.slice(2).filter((value) => value !== '--')[0]

const [caseSet, plan, policy] = await Promise.all([
  loadTrialCases(),
  readFile(resolve(packageRoot, 'data/authority-sample-plan.json'), 'utf8').then(JSON.parse),
  readFile(resolve(packageRoot, 'data/evaluation-policy.json'), 'utf8').then(JSON.parse),
])
const audit = auditAuthoritySample(caseSet, plan, policy)
const report = renderAuthoritySampleMarkdown(audit)

if (outputPath) await writeFile(resolve(outputPath), report)
console.log(report)
if (!audit.valid) process.exitCode = 1
