// Seed the local dev account's library from data/personal_seed.json (290 books).
//
// Creates (or reuses) a dev user, then resets and inserts their books via the service
// role. Idempotent: re-running replaces the dev user's books. The URL and service-role
// key default to the well-known LOCAL Supabase defaults (override via env for anything else).
//
//   pnpm db:seed
//
// Sign in to the running app as DEV_EMAIL (magic link arrives in Mailpit at
// http://127.0.0.1:55324) to see the seed.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// The seed JSON predates the snake_case status enum — it still carries the app's ORIGINAL
// spellings ('Series' | 'Complete' | 'Standalone'), which books_status_check has rejected since
// 20260715010000_book_editing.sql. Normalize through the SAME core function the app and the CSV
// importer use, so the enum has exactly one mapping and this script can't drift from it again.
// Imported straight from source: Node strips the (type-only) annotations natively — 22.18+ / 23+.
let normalizeSeriesStatus
try {
  ;({ normalizeSeriesStatus } = await import('../packages/core/src/seriesStatus.ts'))
} catch (e) {
  console.error(
    `Seed failed: could not load @reverie/core's status normalizer (${e.message ?? e}).\n` +
      `This script reads the TypeScript source directly, which needs Node 22.18+ or 23+ ` +
      `(running ${process.version}). Upgrade Node, then re-run \`pnpm db:seed\`.`,
  )
  process.exit(1)
}

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:55321'
// Standard local-only service-role key (iss: supabase-demo). Not a production secret.
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const DEV_EMAIL = process.env.DEV_EMAIL ?? 'dev@reverie.local'
const DEV_PASSWORD = process.env.DEV_PASSWORD ?? 'reverie-dev-password'

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const num = (v) => (v === '' || v == null ? null : Number(v))

// Derive per-format ownership from the seed's single format + source ("Owned" vs "Borrowed").
function ownedFrom(b) {
  const f = (b.format || '').toLowerCase()
  const owned = b.source === 'Owned'
  return {
    owned_physical: owned
      ? f.includes('hardcover')
        ? 'hardcover'
        : f.includes('paperback') || f.includes('special')
          ? 'paperback'
          : !/(ebook|kindle|audio)/.test(f)
            ? 'paperback'
            : null
      : null,
    owned_ebook: owned && (f.includes('ebook') || f.includes('kindle')),
    owned_audiobook: owned && f.includes('audio'),
  }
}

function toRow(b, ownerId) {
  return {
    owner_id: ownerId,
    ...ownedFrom(b),
    title: b.title,
    author_first: b.first || null,
    author_last: b.last || null,
    series: b.series || null,
    position: num(b.position),
    series_count: b.seriesCount ?? null,
    status: normalizeSeriesStatus(b.status, !!b.series),
    genre: b.genre ?? 'romance',
    subgenre: b.subgenre || null,
    genres: b.genres ?? [],
    tags: b.tropes ?? b.tags ?? [], // seed JSON still uses the romance "tropes" key
    intensity: b.spice ?? b.intensity ?? 0,
    cover_url: b.cover || null,
    isbn: b.isbn || null,
    fave: !!b.fave,
    format: b.format || null,
    rating: b.rating ?? 0,
    read_status: b.readStatus || 'Unread',
    source: b.source || null,
    pub_y: b.pub?.y ?? null,
    pub_m: b.pub?.m ?? null,
    pub_d: b.pub?.d ?? null,
    progress: b.progress ?? 0,
  }
}

async function ensureDevUser() {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw error
  const existing = data.users.find((u) => u.email === DEV_EMAIL)
  if (existing) return existing.id

  const created = await admin.auth.admin.createUser({
    email: DEV_EMAIL,
    password: DEV_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: 'Dev Reader' },
  })
  if (created.error) throw created.error
  return created.data.user.id
}

const nameKey = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * Populate the normalized authors + book_authors from each book's first/last (the same backfill the
 * D2 migration runs, but for a fresh dev seed — migrations run before the seed loads). The service
 * role bypasses RLS; set_book_contributors is owner-scoped and can't be called as the service role.
 */
async function seedContributors(ownerId) {
  const { data: books, error } = await admin
    .from('books')
    .select('id, author_first, author_last')
    .eq('owner_id', ownerId)
  if (error) throw error

  const fullName = (b) => [b.author_first, b.author_last].filter(Boolean).join(' ').trim()

  // Distinct authors (deduped by normalized name) → authors rows.
  const byKey = new Map()
  for (const b of books) {
    const name = fullName(b)
    if (name && !byKey.has(nameKey(name))) byKey.set(nameKey(name), name)
  }
  await admin.from('book_authors').delete().eq('owner_id', ownerId)
  await admin.from('authors').delete().eq('owner_id', ownerId)
  const authorRows = [...byKey].map(([name_key, name]) => ({ owner_id: ownerId, name, name_key }))
  const { data: authors, error: ae } = await admin.from('authors').insert(authorRows).select('id, name_key')
  if (ae) throw ae
  const idByKey = new Map(authors.map((a) => [a.name_key, a.id]))

  // One book_authors link per book at position 0, role author + the denormalized byline cache.
  const links = []
  for (const b of books) {
    const name = fullName(b)
    if (!name) continue
    links.push({ book_id: b.id, author_id: idByKey.get(nameKey(name)), owner_id: ownerId, position: 0, role: 'author' })
  }
  if (links.length) {
    const { error: le } = await admin.from('book_authors').insert(links)
    if (le) throw le
  }
  return authors.length
}

async function main() {
  const ownerId = await ensureDevUser()
  const seed = JSON.parse(readFileSync(resolve(root, 'data/personal_seed.json'), 'utf8'))

  const del = await admin.from('books').delete().eq('owner_id', ownerId)
  if (del.error) throw del.error

  const rows = seed.map((b) => toRow(b, ownerId))
  const ins = await admin.from('books').insert(rows)
  if (ins.error) throw ins.error

  const authorCount = await seedContributors(ownerId)

  const { count } = await admin
    .from('books')
    .select('*', { count: 'exact', head: true })
    .eq('owner_id', ownerId)

  console.log(`Seeded ${rows.length} books (${authorCount} distinct authors) for ${DEV_EMAIL} (owner ${ownerId}); table now holds ${count}.`)
}

main().catch((e) => {
  console.error('Seed failed:', e.message ?? e)
  process.exit(1)
})
