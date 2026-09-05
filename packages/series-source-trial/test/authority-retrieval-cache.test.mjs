import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { interpretRetrievedAuthorityEvidenceWithCache } from '../src/authority/retrieval/cache.mjs'

const target = {
  schemaVersion: 1,
  caseId: 'book-pyg',
  target: { title: 'Pyg', authors: ['Pip Landers-Letts'], publicationYear: 2025 },
}
const evidenceText = 'P: Pyg is part of The Leamington Bloom Series.'
const retrieval = {
  status: 'retrieved',
  evidenceText,
  manifest: {
    caseId: target.caseId,
    childFinalUrl: 'https://author.example/series',
    sourceKind: 'author',
    gatewayVersion: 'gateway-v1',
    policyVersion: 'policy-v1',
    extractorVersion: 'extractor-v1',
    profileVersion: 'profile-v1',
    sanitizedSha256: createHash('sha256').update(evidenceText).digest('hex'),
  },
}
const interpreted = {
  output: {
    caseId: target.caseId,
    identity: { matched: false, confidence: 'none', evidenceUrls: [] },
    classification: 'unresolved',
    memberships: [],
    authoritySources: [],
    uncertainties: [],
    note: 'Unresolved.',
  },
  responseId: 'response-1',
  usage: { input_tokens: 100, output_tokens: 50 },
}

test('caches by packet hash without persisting the evidence packet', async () => {
  const cacheRoot = await mkdtemp(join(tmpdir(), 'reverie-retrieval-cache-'))
  let calls = 0
  const run = () =>
    interpretRetrievedAuthorityEvidenceWithCache(target, retrieval, {
      cacheRoot,
      model: 'test-model',
      interpret: async () => {
        calls += 1
        return interpreted
      },
    })

  const first = await run()
  const second = await run()
  const files = await readdir(cacheRoot)
  const persisted = await readFile(join(cacheRoot, files[0]), 'utf8')

  assert.equal(first.cached, false)
  assert.equal(second.cached, true)
  assert.equal(calls, 1)
  assert.equal(files.length, 1)
  assert.equal(persisted.includes(evidenceText), false)
  assert.equal(persisted.includes('evidenceText'), false)
})
