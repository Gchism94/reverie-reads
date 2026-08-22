import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * EVERY multi-row read in the data layer pages.
 *
 * This is #348's property — *a read that returns a row set must declare a window and a total
 * order* — extended from the two backup functions to the whole layer, rather than a second
 * mechanism. #348 asserted it by driving fakes; that works where one test already drives every
 * read, and does not scale to 30 call sites across 20 modules with no common entry point.
 *
 * The alternative was rejected on evidence, not taste: a >1,000-row fixture PER TABLE is what
 * #348 tried first, and two of its guards were proxies precisely because seeding a thousand rows
 * in the right table is unaffordable and permanently one table behind the code. A new un-paged
 * read added tomorrow is the case that matters, and only an exhaustive check catches it.
 *
 * So this reads the source. That is not a proxy here — the defect IS a missing `.range()` at a
 * call site, so the call site is the thing itself. (Contrast the bundle-grep rule in CLAUDE.md:
 * grepping BUILT output measures the bundler. This reads what was written.)
 *
 * An instrument is only as good as its known error characteristics, so it validates itself against
 * both directions below before any of its findings are believed.
 */

const DIR = join(__dirname)
const FILES = readdirSync(DIR)
  .filter((f) => f.endsWith('.ts') && !f.includes('.test.') && !f.includes('.fixture.'))
  .sort()

interface Read {
  file: string
  line: number
  table: string
}

/** A read is BOUNDED when it cannot return a growing row set: one row, no rows, or a hard limit. */
const BOUNDING = ['.range(', '.single()', '.maybeSingle()', 'head: true', '.limit(']

function unpagedReads(files: readonly string[], dir = DIR): Read[] {
  const out: Read[] = []
  for (const file of files) {
    const lines = readFileSync(join(dir, file), 'utf8').split('\n')
    lines.forEach((l, i) => {
      const m = /\.from\('(\w+)'\)/.exec(l)
      if (!m) return
      // The chain can span lines; 14 is comfortably past the longest in this tree.
      const chain = lines.slice(i, i + 14).join(' ')
      if (!chain.includes('.select(')) return
      if (/\.(insert|update|upsert|delete)\(/.test(chain)) return
      if (BOUNDING.some((b) => chain.includes(b))) return
      out.push({ file, line: i + 1, table: m[1] as string })
    })
  }
  return out
}

/**
 * Reads that are bounded by a SINGLE PARENT ROW, not by the library.
 *
 * Each entry needs a reason, on the `ownedTables` principle that an exclusion without one is the
 * bug. These do not grow when the corpus import adds 875 books: they grow with how many reads one
 * book has, how many slots one series has, how many comments one club has. They are not
 * unbounded — a club with 1,000 comments would truncate — but they are a different problem with a
 * different trigger, and folding them in here would hide that.
 */
const BOUNDED_BY_PARENT: Record<string, string> = {
  'reads.ts:reads': 'one book’s reads — rereads of a single title',
  'reviews.ts:reviews': 'one work’s reviews',
  'listItems.ts:list_items': 'one shelf’s membership, or one book’s shelves',
  'lists.ts:lists': 'the max sort_order for one owner — a fold, not a list',
  'series.ts:series_entries': 'one series’ slots',
  'series.ts:books': 'one series’ books',
  'clubs.ts:club_members': 'one club’s members',
  'clubs.ts:club_comments': 'one club’s comments',
  'tropes.ts:trope_suggestions': 'one book’s suggestions',
  'duplicates.ts:reads': 'one book’s reads, for the merge preview',
}

describe('the paging guard knows what it can and cannot detect', () => {
  // Neither direction is assumed. A sweep reporting "0 problems" is indistinguishable from a sweep
  // that cannot detect one, and a hit from an over-reporting sweep is a question, not a verdict.
  it('POSITIVE CONTROL: an un-paged select IS detected, and a paged one is not', () => {
    // Two snippets, identical but for the bounding call. If the matcher cannot tell them apart it
    // can report nothing meaningful.
    const unpaged = `const { data } = await supabase.from('books').select('*').order('id')`
    const paged = `const rows = await pageAll('books', (from, to) => supabase.from('books').select('*', { count: 'exact' }).order('id').range(from, to))`
    const scan = (src: string) => {
      const lines = src.split('\n')
      let hits = 0
      lines.forEach((l, i) => {
        if (!/\.from\('(\w+)'\)/.test(l)) return
        const chain = lines.slice(i, i + 14).join(' ')
        if (!chain.includes('.select(')) return
        if (BOUNDING.some((b) => chain.includes(b))) return
        hits++
      })
      return hits
    }
    expect(scan(unpaged), 'an un-paged read must be flagged').toBe(1)
    expect(scan(paged), 'a paged read must not be').toBe(0)
  })

  it('NEGATIVE CONTROL: it sees the modules it claims to cover', () => {
    // If the file list were empty or the glob wrong, every assertion below would pass vacuously.
    expect(FILES.length).toBeGreaterThan(15)
    expect(FILES).toContain('books.ts')
    expect(FILES).toContain('importExport.ts')
  })
})

describe('every multi-row read in the data layer pages', () => {
  it('has no un-paged read outside the parent-bounded allowlist', () => {
    const offenders = unpagedReads(FILES)
      .filter((r) => !(`${r.file}:${r.table}` in BOUNDED_BY_PARENT))
      .map((r) => `${r.file}:${r.line} — ${r.table}`)
    expect(offenders).toEqual([])
  })

  it('the allowlist has no stale entries — every exemption still names a real read', () => {
    // An allowlist that outlives its call sites stops being a record of decisions and becomes a
    // list of things nobody checks.
    const live = new Set(unpagedReads(FILES).map((r) => `${r.file}:${r.table}`))
    expect([...Object.keys(BOUNDED_BY_PARENT)].filter((k) => !live.has(k))).toEqual([])
  })

  it('useBooks specifically pages — the read this PR exists for', () => {
    const src = readFileSync(join(DIR, 'books.ts'), 'utf8')
    expect(src).toMatch(/pageAll<BookRow>\('books'/)
    expect(src).toMatch(/\.range\(from, to\)/)
    // `added_at` is not unique, so it cannot page alone; the tiebreak is what makes pages disjoint.
    expect(src).toMatch(/\.order\('added_at'[^)]*\)\s*\.order\('id'\)/)
  })
})
