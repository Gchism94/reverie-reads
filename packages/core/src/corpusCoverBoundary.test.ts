import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isGoogleContentCover as isEdgeGoogleContentCover } from '../../../supabase/functions/_shared/coverUrl'

// The enforcing runtime is Deno, which this repository and CI do not install. Keep a narrow source
// contract beside the pgTAP object/path checks so a future covers refactor cannot silently collapse
// corpus storage back into a reader-owned prefix or drop the server-side exact-work editor gate.
const edge = readFileSync(join(__dirname, '../../../supabase/functions/covers/index.ts'), 'utf8')
const client = readFileSync(join(__dirname, '../../../apps/web/src/lib/covers.ts'), 'utf8')

describe('durable corpus cover boundary', () => {
  it('keeps personal and corpus objects in disjoint prefixes', () => {
    expect(edge).toContain('const base = corpusScope ? `w/${targetId}` : `u/${uid}/${targetId}`')
  })

  it('checks exact corpus edit authority before a corpus ingest', () => {
    expect(edge).toMatch(/corpusScope && !\(await canEditCorpusWork\(req, targetId\)\)/)
    expect(edge.indexOf('corpusScope && !(await canEditCorpusWork(req, targetId))')).toBeLessThan(
      edge.indexOf('const base = corpusScope'),
    )
    expect(edge).toContain('/rest/v1/rpc/can_edit_corpus_work')
    expect(edge).toContain('Authorization: authorization')
  })

  it('refuses mixed personal/corpus targets', () => {
    expect(edge).toContain("return json({ error: 'ambiguous_target' }, 400)")
  })

  it('revalidates the terminal redirect URL before reading or storing response bytes', () => {
    const terminalAssignment = edge.indexOf('fetchedUrl ||= r.url || url')
    const terminalGoogleGate = edge.indexOf('isGoogleContentCover(fetchedUrl)')
    const bodyRead = edge.indexOf("tr.time('covers.readBody'")
    expect(terminalAssignment).toBeGreaterThan(-1)
    expect(terminalGoogleGate).toBeGreaterThan(terminalAssignment)
    expect(bodyRead).toBeGreaterThan(terminalGoogleGate)
    expect(edge.slice(terminalGoogleGate, bodyRead)).toContain("error: 'display_only_source'")
  })

  it('validates every reader-supplied network hop before the Edge runtime connects', () => {
    const guardedFetch = edge.indexOf('fetchPublicRemote(')
    const resolver = edge.indexOf('Deno.resolveDns(hostname, recordType)')
    const bodyRead = edge.indexOf("tr.time('covers.readBody'")
    expect(guardedFetch).toBeGreaterThan(-1)
    expect(resolver).toBeGreaterThan(guardedFetch)
    expect(bodyRead).toBeGreaterThan(resolver)
    expect(edge).toContain('isTrustedCoverSourceUrl(candidate')
    expect(edge).not.toContain("redirect: 'follow'")
  })

  it('the Edge mirror rejects host-boundary and parser tricks', () => {
    expect(isEdgeGoogleContentCover('https://books.google.com/books/content?id=real')).toBe(true)
    expect(
      isEdgeGoogleContentCover('https://books.googleusercontent.com/books/content?id=real'),
    ).toBe(true)
    expect(
      isEdgeGoogleContentCover('https://books.google.evil.example/books/content?id=attacker'),
    ).toBe(false)
    expect(
      isEdgeGoogleContentCover('https://books.google.com@evil.example/books/content?id=attacker'),
    ).toBe(false)
    expect(
      isEdgeGoogleContentCover('https://evil.example/books.google.com/books/content?id=attacker'),
    ).toBe(false)
  })

  it('has one explicit client request shape for corpus ingestion', () => {
    expect(client).toContain("scope: 'corpus'")
    expect(client).toContain('workId: input.workId')
  })
})
