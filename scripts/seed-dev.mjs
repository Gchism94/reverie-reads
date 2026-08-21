// Seed the local dev account's library from data/corpus_seed.json + data/reader_seed.json
// (290 books, joined by `id`).
//
// The seed is TWO files, not one: corpus_seed.json holds the bibliographic fields (CC0,
// LICENSE-CORPUS) and reader_seed.json holds this reader's own data — fave, format, rating,
// readStatus, source, cover (not published, not licensed, not part of the corpus). They were
// one file (personal_seed.json) until the split; each row's `id` is the only thing joining
// them now, deliberately, so neither file can be reordered or edited independently and
// silently desync the join the way two positionally-correlated arrays could.
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
let describeSupabaseError
try {
  ;({ normalizeSeriesStatus } = await import('../packages/core/src/seriesStatus.ts'))
  // The SAME error reader the e2e suite and its sign-in helper use. This script reaching into
  // packages/core/src is not a new liberty — it is exactly how normalizeSeriesStatus arrives above,
  // and it is why the duplicated copy this replaces was never actually necessary.
  ;({ describeSupabaseError } = await import('../packages/core/src/supabaseError.ts'))
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

// Derive possession from the seed's `source` provenance + its single `format` string.
//
// Two bugs this replaces, both of which made the seeded library misrepresent the model:
//   1. `ownership` was never written at all, so every seeded book took the column default. Post
//      ownership-v2 that default was 'unset' — 290 books, none of them possessed, and all three
//      Owned·format shelves empty on a library of 290 real books.
//   2. Format flags were set only for source='Owned', so the 77 borrowed books recorded no format
//      even though a borrowed book is in hand and carries one (bookOwnedFormats gates on in-hand,
//      not on owned).
//
// `source` is provenance and `ownership` is state; this maps one to the other ONLY at seed time,
// where the provenance is all we have. An unrecognized source claims nothing rather than guessing
// ownership — the same posture as the column default.
//
// ── THE FORMAT FLAGS ARE INFERRED, NOT RECORDED ─────────────────────────────────────────────────
// Neither seed file has a field naming a possessed format. corpus_seed.json's keys are: id, first,
// genres, isbn, last, position, series, seriesCount, spice, status, subgenre, title, tropes.
// reader_seed.json's are: id, cover, fave, format, rating, readStatus, source. So
// owned_physical/ebook/audiobook below are DERIVED from `format` x `source`, and `format` means
// **the format most often read** (Book.format — the reread default), not the format owned. The two
// are usually the same and sometimes are not: a reader who owns the hardcover and listened to the
// audiobook is flagged audiobook-only here, and the physical copy they actually own vanishes.
//
// This inference predates the shelf model — it is where the pre-existing 190/3/20 came from. The
// shelf-model change only extended it to the 77 borrowed rows (a borrowed book is in hand and
// carries a format), giving 190/68/32.
//
// Two consequences worth carrying:
//   · `apps/web/e2e/shelf-membership.spec.ts` computes its expected counts from THIS SAME RULE, so
//     it validates the pipeline — seed script → DB → mapper → predicate → DOM — and NOT the premise.
//     A wrong inference stays green there. Nothing in the suite checks the premise, because nothing
//     can: the ground truth is not in the file.
//   · corpus_seed.json + reader_seed.json are the owner's REAL library, not a fixture. If it is
//     ever seeded into a production account, these inferred flags stop being scaffolding and
//     become that reader's data — an audiobook-only book they own in hardback, indistinguishable
//     from something they entered by hand. Decide the mapping is right before that happens, not
//     after.
function possessionFrom(b) {
  const f = (b.format || '').toLowerCase()
  const borrowed = b.source === 'Borrowed'
  const inHand = borrowed || b.source === 'Owned'
  return {
    ownership: b.source === 'Owned' ? 'owned' : 'unowned',
    borrowed,
    wishlist: false, // the seed carries no wanting signal — see docs/archive/task-shelf-model.md
    owned_physical: inHand
      ? f.includes('hardcover')
        ? 'hardcover'
        : f.includes('paperback') || f.includes('special')
          ? 'paperback'
          : !/(ebook|kindle|audio)/.test(f)
            ? 'paperback'
            : null
      : null,
    owned_ebook: inHand && (f.includes('ebook') || f.includes('kindle')),
    owned_audiobook: inHand && f.includes('audio'),
  }
}

function toRow(b, ownerId) {
  return {
    owner_id: ownerId,
    ...possessionFrom(b),
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
    // NULL is preserved, never fabricated as 0: null means "not assessed" and 0 means "assessed
    // as none", and the seeder is the one place that could silently invent 535 judgements nobody
    // made. `?? null` keeps a book the corpus never rated genuinely unrated.
    intensity: b.spice ?? b.intensity ?? null,
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
  const { data: authors, error: ae } = await admin
    .from('authors')
    .insert(authorRows)
    .select('id, name_key')
  if (ae) throw ae
  const idByKey = new Map(authors.map((a) => [a.name_key, a.id]))

  // One book_authors link per book at position 0, role author + the denormalized byline cache.
  const links = []
  for (const b of books) {
    const name = fullName(b)
    if (!name) continue
    links.push({
      book_id: b.id,
      author_id: idByKey.get(nameKey(name)),
      owner_id: ownerId,
      position: 0,
      role: 'author',
    })
  }
  if (links.length) {
    const { error: le } = await admin.from('book_authors').insert(links)
    if (le) throw le
  }
  return authors.length
}

/** Join the corpus (bibliographic) and reader (personal) halves back into one record per book,
 *  by `id` — never by array position, so an independent edit to either file can't silently
 *  desync the pairing. Throws loudly on any mismatch rather than seeding a partial or
 *  wrongly-paired book. */
function loadSeed() {
  const corpus = JSON.parse(readFileSync(resolve(root, 'data/corpus_seed.json'), 'utf8'))
  const reader = JSON.parse(readFileSync(resolve(root, 'data/reader_seed.json'), 'utf8'))
  const readerById = new Map(reader.map((r) => [r.id, r]))
  if (readerById.size !== reader.length) throw new Error('reader_seed.json has duplicate ids')
  if (corpus.length !== reader.length) {
    throw new Error(
      `corpus_seed.json (${corpus.length} rows) and reader_seed.json (${reader.length} rows) are out of sync`,
    )
  }
  return corpus.map((c) => {
    const r = readerById.get(c.id)
    if (!r) throw new Error(`corpus_seed.json id ${c.id} has no matching row in reader_seed.json`)
    return { ...c, ...r }
  })
}

async function main() {
  const ownerId = await ensureDevUser()
  const seed = loadSeed()

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

  console.log(
    `Seeded ${rows.length} books (${authorCount} distinct authors) for ${DEV_EMAIL} (owner ${ownerId}); table now holds ${count}.`,
  )
}

main().catch((e) => {
  console.error('Seed failed:', describeSupabaseError(e))
  if (e?.stack) console.error(e.stack)
  process.exit(1)
})
