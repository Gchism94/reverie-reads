# Data model

**This describes what is built, not what is proposed.** The client shapes in §1 are the
authoritative TypeScript in `packages/core/src/types.ts`; the tables in §2 are the
accumulated result of `supabase/migrations/`. When this file and either of those disagree,
they are right and this is stale — fix it here.

Read this before writing code that touches a book. Several fields changed meaning after the
prototype (`spice` → `intensity`, `status` → the series' publication status, ownership from
two states to four), and the old names are still the intuitive guess.

---

## 1. Client state

Books, lists and reads come from Supabase through TanStack Query. Only preferences and the
share registry are ambient:

```jsonc
{
  books: [ Book, … ],
  lists: [ List, … ],          // TBRs and collections; one may be priority
  me:    { id, name },         // profile identity (clubs/shares)
  shared:{ lists: [ {code,name,kind} ], clubs: [ {code,name,cover} ] },
  skin:  SkinId,               // one of NINE skins — see below; `mode` is light/dark/system
  goal:  { year, target } | null
}
```

> **There are nine skins, not two themes.** `tryst`, `grimoire`, `aphelion`, `marrow`,
> `umbra`, `folio`, `hearth`, `almanac`, `bloom` (`packages/core/src/skins.ts`). Each carries
> its own token set and its own light/dark pair. "Nocturne / Magnolia Dawn" is prototype-era
> vocabulary and no longer names anything in the code.

### Book

The full shape is `Book` in `packages/core/src/types.ts`, which carries per-field doc
comments. Reproduced here with the parts that most often get guessed wrong called out:

```jsonc
{
  id, title,
  first, last,                 // primary author, denormalized — mirrors contributors[0]
  contributors: [ { id?, name, role, position } ],   // ordered; role ∈ author | co_author |
                                                     // translator | illustrator | narrator | editor

  // --- series ---
  series,
  position: number | '',       // fractional positions exist (3.5); '' = unset
  seriesCount: number | null,  // null => "length not set" (drives the "None set" filter)
  status: SeriesStatus,        // the SERIES' publication status — NOT the reader's position:
                               // 'standalone' | 'ongoing' | 'completed' | 'on_hiatus'
                               // | 'cancelled' | 'interconnected_standalone'
                               // | 'interconnected_series'

  // --- taxonomy ---
  genre: string,               // PRIMARY genre, lowercased CORE_GENRES key. Drives the skin,
                               // the adaptive logic, and which subgenre/trope vocabulary the
                               // pickers offer. '' = not chosen — the form prompts, never guesses.
  subgenre: string,            // denormalized FIRST subgenre — kept equal to subgenres[0]
  subgenres: string[],         // multi-select, and NOT scoped to `genre`: storage is a flat
                               // text[] and the picker discloses the other genres' vocabulary
  genres: string[],            // secondary genre tags
  tags: string[],              // legacy free tags (pre-trope-system) — kept for search/fallback

  tropes: [ { id, name, emphasis: 'pinned' | 'present' } ],   // a JOIN, not an array of strings
  tropesSuggestedAt: string | null,                           // last Hardcover descriptor fetch
  moods:  [ { id, name } ],    // reader-assigned. NEVER derived — absence is a valid, quiet
                               // state and is never backfilled with a guess

  intensity: number | null,    // 0..5, null = unset. Was `spice`; the Tryst skin still LABELS
                               // it "Spice", but no other skin does and the field is neutral.

  // --- cover + provenance ---
  cover, coverThumb?,          // full + ~300px stored thumbnail (grids/spines/shelves)
  coverSource?: string,        // hardcover | google | openlibrary | upload | camera | url
  coverSourceUrl?: string,     // the external URL it was ingested from
  coverUserChosen?: boolean,   // the reader picked it — enrichment NEVER overwrites it
  coverColor?: string,         // dominant hex, extracted at ingest; feeds the spine tint
  coverConfidence?: 'high' | 'medium' | 'low' | 'none',       // enrichment match confidence

  isbn,
  pages: number | null,        // null = UNKNOWN → renders blank, never a fabricated 0
  fave: boolean,

  // --- possession (FOUR states — see below) ---
  ownership: 'owned' | 'borrowed' | 'wishlist' | 'unset',
  owned: {                     // WHICH formats, for a possessed book
    physical: false | 'paperback' | 'hardcover' | true,
    ebook: boolean,
    audiobook: boolean
  },
  format: string,              // the format most often read (reread default)

  // --- the reader's own record ---
  rating: number,              // 0..5, the READER'S rating. No aggregate exists anywhere.
  readStatus: 'unset' | 'Unread' | 'Reading' | 'Read' | 'DNF',   // 'unset' is the DEFAULT
  source: string,
  pub: { y, m, d },            // any part may be null (flexible precision)
  reads: [ { date, format, rating, notes } ],   // reread log; format read may differ from owned
  plan: string | null,         // planned "need to read" date, YYYY-MM-DD
  progress: number,            // 0..100 while Reading
  readingPosition?: number | null,   // manual Reading Now order (spaced numeric)
  readingNowHidden?: boolean,        // hidden from Reading Now without changing status/progress
  addedTs
}
```

#### Possession is four states, and `owned` does not decide it

`ownership` is the answer to *how do you have this book*; `owned` is the answer to *which
formats*. They are separate fields and the first one governs.

| `ownership` | meaning |
|---|---|
| `owned` | the reader owns a copy — per-format detail in `owned` |
| `borrowed` | in the reader's hands but not owned (library loan, a friend's copy). **Counts as possessed:** carries a format, stays in the default library |
| `wishlist` | a book the reader *wants* — the old `unowned` TBR state, renamed for precision |
| `unset` | **the default for a newly added book.** Cataloguing must not force a possession category |

> **`all-false = wishlist` is wrong and was never true after ownership-v2.** A wishlist book
> carries whatever latent format flags it happens to have; no surface reads them. Ask
> `ownership`, or use `bookOwnedFormats` — never infer possession from the `owned` booleans.
>
> Possession never gates reading history: a book you have read is in your library whatever
> `ownership` says.

The **Owned · Physical / Ebook / Audiobook** shelves are *smart shelves* derived from
`ownership` + `owned`, not manual lists. Ownership is independent of `reads[].format` — you
can read a borrowed copy you don't own.

#### Ratings

`rating` (the prototype called it `myRating`) is the reader's own, alongside per-read
ratings in `reads[]`. **Never compute or display an average.** `reviews` are individual
entries from other readers, surfaced only when the reader opts to look, and shown as a list
of distinct voices — never reduced to a headline number. There is no aggregate column
anywhere in the schema, by design.

### List (TBR or collection)
```jsonc
{ id, name, priority?: bool, ids: [ bookId, … ] }
```

### Shared documents (capability-keyed; stored remotely under a share code)
```jsonc
// shared list / book-club TBR
{ type:"list", kind:"list"|"clubtbr", name, items:[{id,title,author,cover,by}], updatedAt }

// read-along
{ type:"club", title, author, cover,
  unit:{ type:"chapter"|"page"|"percent", count, label },
  members:[ {id,name,progress} ],
  comments:[ {id,by,byName,unit,text,ts} ],   // visible only if unit <= my progress
  updatedAt }
```

---

## 2. Relational schema

Postgres, row-level security scoped to the authenticated user on every user-owned table.
Column lists below are indicative of shape; `supabase/migrations/` is authoritative.

```sql
profiles            (id pk = auth user, display_name, created_at,
                     skin text not null default 'tryst',     -- one of the nine
                     mode text not null default 'system',    -- light | dark | system
                     goal_year, goal_target,
                     adaptive_skin jsonb, adaptive_pending jsonb,
                     adaptive_dismissed jsonb, adaptive_locked bool,
                     auto_merge_duplicates bool not null default true,
                     default_store_id, default_store_name, default_store_website)

books               (id pk, owner_id fk→profiles, title,
                     author_first, author_last, authors_display,
                     series, position numeric, series_count smallint,
                     status text,          -- books_status_check: the 7 SeriesStatus values
                     genre text not null default 'romance',
                     subgenre text, subgenres text[] not null default '{}',
                     genres text[], tags text[],      -- `tags` was renamed FROM `tropes`
                     intensity smallint,              -- renamed FROM `spice`
                     cover_url, cover_thumb_url, cover_source, cover_source_url,
                     cover_user_chosen bool not null default false,
                     cover_color, cover_confidence,
                     isbn, pages integer,             -- books_pages_check: null or 1..20000
                     fave bool,
                     ownership text not null default 'unset',
                                          -- books_ownership_check: owned|borrowed|wishlist|unset
                     owned_physical text, -- null | 'paperback' | 'hardcover' | 'yes'
                     owned_ebook bool, owned_audiobook bool,
                     format, rating numeric(2,1),
                     read_status text not null default 'unset',
                                          -- books_read_status_check: unset|Unread|Reading|Read|DNF
                     source, pub_y, pub_m, pub_d,     -- flexible precision; m/d range-checked
                     plan_date, progress smallint,
                     reading_position numeric, reading_now_hidden bool,
                     enriched_at, tropes_suggested_at,
                     added_at, updated_at)
                     -- NOTE: no aggregate_rating column, and there will not be one.

-- contributors: ordered, multi-role. `books.author_first/last` stay as the denormalized primary.
authors             (id pk, owner_id fk, name, name_key, created_at,
                     unique (owner_id, name_key))     -- name_key matches core normalizeName
book_authors        (book_id fk, author_id fk, owner_id fk, position int, role text,
                     primary key (book_id, author_id, role))

-- tropes: a curated join with EMPHASIS, plus a suggestion inbox. Not a text[].
tropes              (id pk, owner_id fk null → canonical, canonical_id fk, name, aliases text[],
                     facet text,          -- dynamics|plot|characters|setting_world|vibe
                     genre_affinity text[],   -- an ORDERING HINT, never a gate
                     created_at)
book_tropes         (book_id fk, trope_id fk, owner_id fk,
                     emphasis text not null default 'present',   -- 'pinned' | 'present'
                     added_at, primary key (book_id, trope_id))
trope_suggestions   (book_id fk, trope_id fk, owner_id fk, source, state 'open'|'dismissed',
                     created_at, primary key (book_id, trope_id))

-- moods: reader-assigned only. Nothing derives or backfills these.
moods               (id pk, owner_id fk null → canonical, canonical_id fk, name, created_at)
book_moods          (book_id fk, mood_id fk, owner_id fk, added_at,
                     primary key (book_id, mood_id))

reads               (id pk, book_id fk, owner_id fk, read_on date, format, rating, notes,
                     created_at)          -- the reread log
reviews             (id pk, work_key text, reviewer_id fk, reviewer_name, rating, body,
                     created_at, unique (work_key, reviewer_id))
                     -- keyed by WORK, not book_id: reviews are cross-library, readable by all
                     -- authenticated users, writable only by their author. Never averaged.

-- series: a first-class record with an ordered entry list that may contain GHOSTS
-- (a slot for a book the reader doesn't own yet).
series              (id pk, owner_id fk, name, status, source 'manual'|'hardcover',
                     source_ref, refreshed_at, created_at, unique (owner_id, name))
series_entries      (id pk, series_id fk, owner_id fk, position numeric, label,
                     title, author,       -- ghost display fields; a linked entry renders the book
                     book_id fk null, source, user_edited bool,
                     removed_at timestamptz,      -- SOFT-DELETE TOMBSTONE — see below
                     created_at)

lists               (id pk, owner_id fk, name, kind 'tbr'|'collection', is_priority bool,
                     sort_order numeric, description, created_at)
list_items          (list_id fk, book_id fk, owner_id fk, position,
                     primary key (list_id, book_id))

clubs               (id pk, title, author, cover_url,
                     unit_type 'chapter'|'page'|'percent', unit_count, unit_label,
                     created_by fk, created_at)
club_members        (club_id fk, user_id fk, display_name, progress int, joined_at,
                     primary key (club_id, user_id))
club_comments       (id pk, club_id fk, user_id fk, unit int, body, created_at)

shared_docs         (key text pk, value jsonb, updated_at)   -- the shared doc itself; the
                     -- share CODE is the key, and knowing it is the capability (RLS is open)
shared_refs         (owner_id fk, code, kind 'list'|'clubtbr', name, created_at,
                     primary key (owner_id, code))           -- a reader's joined codes
```

Also present, supporting features rather than the core library: `book_embeddings` and
`match_feedback` (taste/semantic search, pgvector), `enrichment_cache` / `cover_cache` /
`geo_cache` / `releases_cache`, `rate_limits`, `content_reports`, `merge_verdicts`,
`reading_orders` / `reading_order_items`, `author_follows`.

**`households` / `household_members` do not exist.** v1 is one personal library per account;
sharing happens through shared lists and clubs (`CLAUDE.md`, open decision 2).

### Notes

- **`series_entries.removed_at` is a tombstone, not a delete.** Removing a book from a series
  soft-deletes the entry (`removed_at = now()`, `book_id = null`, `user_edited = true`) rather
  than dropping the row, so a later Hardcover refresh cannot resurrect a slot the reader
  deliberately removed. Every live-entry query filters `removed_at is null` (partial index
  `series_entries_live_idx`). Re-adding the same book revives the tombstone instead of
  inserting a duplicate.
- **Removal is one operation on both surfaces.** The series screen's ✕ and clearing the series
  field on the book both take the same path — soft-delete the entry *and* clear `books.series`.
  See `docs/decisions/0004-series-removal-semantics.md`.
- `series_count IS NULL` drives the **"None set"** filter ("what needs completing").
- `pub_y/m/d` keep flexible publish-date precision; `pub_m`/`pub_d` are range-checked in the
  DB and parsed through `parseNumericField` in the client, so a bad value is refused in the
  form rather than rejected by Postgres.
- The reread log stays a child table, so "books read with vs. without rereads" is a
  `COUNT(DISTINCT book_id)` vs `COUNT(*)` over `reads` in a date range.
- Genres/tags stayed `text[]` with GIN indexes (the "simpler" option). **Tropes and moods did
  not** — they became join tables when they gained structure (emphasis, facets, canonical vs.
  personal entries).
- `club_comments` spoiler gating is still honor-based (client-side, `spoiler.ts`). Server
  enforcement via RLS is a later upgrade (`CLAUDE.md`, open decision 3).

### Logic ported from the prototype

- **Merge engine** — `packages/core/src/merge.ts` decides the winning fields; the
  `merge_books(p_primary, p_loser, p_fields)` RPC applies them server-side, carrying reads
  (dedup by date), list memberships, contributors, tropes, moods and ownership onto the
  primary before deleting the loser.
- **CSV import** — `csv.ts` / `importMap.ts` map Goodreads/StoryGraph headers, merging by
  title+author and bringing ratings, shelves and real read dates.
- **Spoiler gate** — `spoiler.ts`, `comment.unit <= myProgress`.
