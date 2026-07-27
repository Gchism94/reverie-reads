import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { USER_OWNED_TABLES } from './ownedTables'

// Structural guards over the SCHEMA, read from supabase/migrations rather than restated here — a
// list restated in a test drifts from the database exactly as the v4 backup drifted from it.
//
// Deletion is asserted as a PROPERTY, not a checklist: `delete-account` deletes the auth user and
// lets Postgres cascade, so what must hold is that every user-owned table reaches auth.users
// through an unbroken chain of ON DELETE CASCADE. That stays true when someone adds a table and
// false the moment they attach one with ON DELETE SET NULL or no action — which no list of
// expected delete statements would ever notice.

const MIGRATIONS = join(__dirname, '../../../../supabase/migrations')

interface Fk {
  target: string
  action: string
}

/** table → its outbound foreign keys, parsed from the accumulated migrations. */
function parseSchema(): Map<string, Fk[]> {
  const sql = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS, f), 'utf8'))
    .join('\n')

  const tables = new Map<string, Fk[]>()
  const create = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)\s*\(/gi
  for (let m = create.exec(sql); m; m = create.exec(sql)) {
    const name = m[1]!
    // Walk to the matching close paren so nested parens (checks, defaults) don't end the block early.
    let depth = 0
    let end = m.index
    for (let i = m.index + m[0].length - 1; i < sql.length; i++) {
      if (sql[i] === '(') depth++
      else if (sql[i] === ')') {
        depth--
        if (depth === 0) {
          end = i
          break
        }
      }
    }
    const body = sql.slice(m.index + m[0].length, end)
    const fks: Fk[] = []
    const ref = /references\s+(?:(?:auth|public)\.)?(\w+)\s*\(\s*\w+\s*\)\s*((?:on\s+delete\s+(?:cascade|restrict|no\s+action|set\s+null|set\s+default))?)/gi
    for (let r = ref.exec(body); r; r = ref.exec(body)) {
      fks.push({ target: r[1]!, action: (r[2] ?? '').replace(/\s+/g, ' ').trim().toLowerCase() })
    }
    tables.set(name, fks)
  }
  return tables
}

const schema = parseSchema()

/** Does `table` reach auth.users through a chain where EVERY hop is ON DELETE CASCADE? */
function cascadePathToUsers(table: string, seen = new Set<string>()): string[] | null {
  if (seen.has(table)) return null
  seen.add(table)
  for (const fk of schema.get(table) ?? []) {
    if (fk.action !== 'on delete cascade') continue
    if (fk.target === 'users') return [table, 'auth.users']
    const rest = cascadePathToUsers(fk.target, new Set(seen))
    if (rest) return [table, ...rest]
  }
  return null
}

/**
 * Is `table` owner-scoped — i.e. does its data belong to some user?
 *
 * Deliberately independent of the cascade check, and it must stay that way. Defining "owned" as
 * "has a cascade path" would let a table attached with ON DELETE SET NULL slip out of the registry
 * AND out of the cascade assertion at the same time — the guard would go quiet on exactly the row
 * that would survive its owner's deletion. Reachability here is over ANY foreign key action.
 */
function ownerScoped(table: string, seen = new Set<string>()): boolean {
  if (seen.has(table)) return false
  seen.add(table)
  for (const fk of schema.get(table) ?? []) {
    if (fk.target === 'users' || fk.target === 'profiles') return true
    if (ownerScoped(fk.target, new Set(seen))) return true
  }
  return false
}

describe('schema parse (the guard is only as good as this)', () => {
  it('finds the tables and their cascades', () => {
    expect(schema.size).toBeGreaterThan(20)
    expect(schema.get('book_tropes')).toContainEqual({ target: 'users', action: 'on delete cascade' })
    // A non-cascading FK must be read as such, or the cascade assertion below proves nothing.
    expect(schema.get('series_entries')).toContainEqual({ target: 'books', action: 'on delete set null' })
  })
})

describe('account deletion reaches every user-owned table', () => {
  // delete-account deletes the auth user; everything owned must fall out by cascade. Verified
  // empirically against a live database too (auth.users delete → book_tropes/book_moods/
  // author_follows all emptied); this keeps it true as the schema grows.
  it.each(USER_OWNED_TABLES.map((t) => t.table))('%s cascades to auth.users', (table) => {
    expect(schema.has(table)).toBe(true)
    expect(cascadePathToUsers(table)).not.toBeNull()
  })
})

describe('no user-owned table may go unregistered', () => {
  it('every table the schema owns is declared in ownedTables.ts', () => {
    const registered = new Set(USER_OWNED_TABLES.map((t) => t.table))
    const owned = [...schema.keys()].filter((t) => t !== 'profiles' && ownerScoped(t))
    const unregistered = owned.filter((t) => !registered.has(t))
    expect(
      unregistered,
      `These tables are owner-scoped but are not declared in ownedTables.ts. Add each one with a ` +
        `backup plan — "backup: true" if it holds reader-authored data, or "backup: false" with a ` +
        `reason. (This is the check that v4 did not have when book_tropes was added.)`,
    ).toEqual([])
  })

  it('declares nothing that the schema does not actually own', () => {
    const stale = USER_OWNED_TABLES.filter((t) => !schema.has(t.table)).map((t) => t.table)
    expect(stale, 'Declared in ownedTables.ts but absent from the migrations').toEqual([])
  })

  it('every exclusion carries a reason', () => {
    for (const t of USER_OWNED_TABLES) {
      if (!t.plan.backup) expect(t.plan.why.length, `${t.table} is excluded without a reason`).toBeGreaterThan(20)
    }
  })
})
