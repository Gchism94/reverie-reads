import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  interpretRetrievedAuthorityEvidence,
  retrievalInterpretationCacheMaterial,
} from './interpret.mjs'

export async function interpretRetrievedAuthorityEvidenceWithCache(
  target,
  retrieval,
  {
    cacheRoot,
    model,
    refresh = false,
    interpret = interpretRetrievedAuthorityEvidence,
    interpretOptions = {},
  },
) {
  if (!cacheRoot) throw new Error('Retrieval interpretation cache root is required')
  const material = retrievalInterpretationCacheMaterial(target, retrieval, model)
  const key = createHash('sha256').update(JSON.stringify(material)).digest('hex')
  const cachePath = resolve(cacheRoot, `${key}.json`)
  if (!refresh) {
    try {
      return { ...JSON.parse(await readFile(cachePath, 'utf8')), cached: true }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }

  const interpreted = await interpret(target, retrieval, {
    ...interpretOptions,
    model,
  })
  await mkdir(cacheRoot, { recursive: true })
  await writeFile(cachePath, `${JSON.stringify(interpreted, null, 2)}\n`)
  return { ...interpreted, cached: false }
}
