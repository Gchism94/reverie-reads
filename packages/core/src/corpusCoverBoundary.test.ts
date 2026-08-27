import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The enforcing runtime is Deno, which this repository and CI do not install. Keep a narrow source
// contract beside the pgTAP object/path checks so a future covers refactor cannot silently collapse
// corpus storage back into a reader-owned prefix or drop the server-side administrator gate.
const edge = readFileSync(join(__dirname, '../../../supabase/functions/covers/index.ts'), 'utf8')
const client = readFileSync(join(__dirname, '../../../apps/web/src/lib/covers.ts'), 'utf8')

describe('durable corpus cover boundary', () => {
  it('keeps personal and corpus objects in disjoint prefixes', () => {
    expect(edge).toContain('const base = corpusScope ? `w/${targetId}` : `u/${uid}/${targetId}`')
  })

  it('checks the service-managed administrator grant before a corpus ingest', () => {
    expect(edge).toMatch(/corpusScope && !\(await isCorpusAdmin\(uid\)\)/)
    expect(edge.indexOf('corpusScope && !(await isCorpusAdmin(uid))')).toBeLessThan(
      edge.indexOf('const base = corpusScope'),
    )
  })

  it('refuses mixed personal/corpus targets', () => {
    expect(edge).toContain("return json({ error: 'ambiguous_target' }, 400)")
  })

  it('has one explicit client request shape for corpus ingestion', () => {
    expect(client).toContain("scope: 'corpus'")
    expect(client).toContain('workId: input.workId')
  })
})
