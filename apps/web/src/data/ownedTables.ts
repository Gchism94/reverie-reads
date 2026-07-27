/**
 * The single declaration of every USER-OWNED table and what the backup does with it.
 *
 * This exists because v4's backup silently dropped `book_tropes`, `book_moods` and
 * `author_follows`: three tables of reader-authored data that account deletion erased but export
 * could not hand back. Nothing failed when they were added, because nothing was watching. This
 * registry is the thing that watches.
 *
 * Two guards bind it to reality, both in `ownedTables.test.ts` / `importExport.test.ts`:
 *
 *  1. **Nothing may go unregistered.** The migrations are parsed and every table that reaches
 *     `auth.users` through a chain of ON DELETE CASCADE is required to appear below. Add a
 *     user-owned table and the suite fails until you come here and say what the backup does with
 *     it — which forces the v4 mistake to be a deliberate, written-down choice rather than an
 *     oversight.
 *  2. **`backup: true` must be true.** buildBackup/restoreBackup are driven against a recording
 *     client and every such table must actually be read AND written. Declaring coverage you did
 *     not implement fails.
 *
 * Deletion is NOT listed here as a set of delete statements, because it isn't implemented as one:
 * `delete-account` deletes the auth user and the database cascades. The test asserts that
 * structure — a cascade path exists — rather than a list that could drift from the schema.
 */

/** How a user-owned table is treated by the JSON backup. */
export type BackupPlan =
  /** Serialized by buildBackup and recreated by restoreBackup. */
  | { backup: true; via?: string }
  /** Deliberately excluded. `why` is required — an exclusion without a reason is the v4 bug. */
  | { backup: false; why: string }

export interface OwnedTable {
  table: string
  /** The column that ties a row to a user. */
  owner: string
  plan: BackupPlan
}

export const USER_OWNED_TABLES: OwnedTable[] = [
  // ── the library itself ──
  { table: 'books', owner: 'owner_id', plan: { backup: true } },
  { table: 'reads', owner: 'owner_id', plan: { backup: true } },
  { table: 'lists', owner: 'owner_id', plan: { backup: true } },
  { table: 'list_items', owner: 'owner_id', plan: { backup: true } },
  { table: 'reviews', owner: 'reviewer_id', plan: { backup: true } },
  { table: 'merge_verdicts', owner: 'owner_id', plan: { backup: true } },
  { table: 'reading_orders', owner: 'owner_id', plan: { backup: true } },
  // Read through the reading_orders embed, written directly on restore.
  { table: 'reading_order_items', owner: 'owner_id', plan: { backup: true, via: 'reading_orders' } },
  { table: 'profiles', owner: 'id', plan: { backup: true } },

  // ── taxonomy: assignments travel by NAME, and the vocabulary rows come with them ──
  { table: 'book_tropes', owner: 'owner_id', plan: { backup: true } },
  { table: 'book_moods', owner: 'owner_id', plan: { backup: true } },
  // The vocabulary rows are exported through the join's embedded select (their NAMES are what
  // travel); restore reads them directly and coins whatever this account is missing.
  { table: 'tropes', owner: 'owner_id', plan: { backup: true, via: 'book_tropes' } },
  { table: 'moods', owner: 'owner_id', plan: { backup: true, via: 'book_moods' } },
  { table: 'author_follows', owner: 'user_id', plan: { backup: true } },

  // ── carried inside another section rather than as their own ──
  {
    table: 'authors',
    owner: 'owner_id',
    plan: { backup: false, why: 'Carried as the `contributors` map (name/role/position per book); the rows themselves are an id-keyed vocabulary that persistContributors rebuilds on restore.' },
  },
  {
    table: 'book_authors',
    owner: 'owner_id',
    plan: { backup: false, why: 'Same as `authors` — the join is reconstructed by persistContributors from the `contributors` map.' },
  },

  // ── derived, and regenerated from what IS backed up ──
  {
    table: 'book_embeddings',
    owner: 'owner_id',
    plan: { backup: false, why: 'Derived from book text by the embed function; regenerates from the restored books.' },
  },
  {
    table: 'match_feedback',
    owner: 'user_id',
    plan: { backup: false, why: 'Match dismissals on a 60-day decay window — ephemeral by design, and stale within two months of any restore.' },
  },
  {
    table: 'series',
    owner: 'owner_id',
    plan: { backup: false, why: 'Reconciled from the library on read — the series shelf query rewrites it on every run, so a restored copy is a snapshot of a derived view.' },
  },

  // ── shared/social: restoring these into another account would fabricate history ──
  {
    table: 'clubs',
    owner: 'created_by',
    plan: { backup: false, why: 'A club is collective, not owned by one reader; recreating it on restore would fabricate a club its other members never joined.' },
  },
  {
    table: 'club_members',
    owner: 'user_id',
    plan: { backup: false, why: 'Membership belongs to the club, not the backup; re-joining is a live action against a real club.' },
  },
  {
    table: 'club_comments',
    owner: 'user_id',
    plan: { backup: false, why: 'Comments belong to a club thread other people read; restoring them elsewhere would duplicate them out of context.' },
  },
  {
    table: 'shared_refs',
    owner: 'owner_id',
    plan: { backup: false, why: 'Capability share codes. The shared doc lives under the code (shared_docs, not owner-scoped); re-joining means entering the code again.' },
  },
  {
    table: 'content_reports',
    owner: 'reporter_id',
    plan: { backup: false, why: 'Moderation records, not library data — they belong to the report queue, not to the reader.' },
  },

  // ── KNOWN GAPS: reader intent that does not currently survive a restore ──
  {
    table: 'series_entries',
    owner: 'owner_id',
    plan: { backup: false, why: 'KNOWN GAP. Mostly derived from books + a Hardcover refresh, BUT `removed_at` is a deliberate tombstone recording that the reader removed a slot. That intent is lost on restore, so a later refresh can resurrect a slot they removed. Backing up just the tombstones would close it.' },
  },
  {
    table: 'trope_suggestions',
    owner: 'owner_id',
    plan: { backup: false, why: 'KNOWN GAP. Regenerable from Hardcover, but the `dismissed` state is a reader decision; after a restore, suggestions they already waved away can reappear once.' },
  },
]

/** Tables the backup claims to cover. */
export const BACKED_UP_TABLES = USER_OWNED_TABLES.filter((t) => t.plan.backup)
