# Data model

The shapes the prototype uses today, then a relational schema for the backend.

---

## 1. Current client state (`DB`)

One object, persisted to the storage layer on every change.

```jsonc
DB = {
  books: [ Book, … ],
  tbrs:  [ List, … ],          // to-be-read lists; one may be priority
  collections: [ List, … ],    // arbitrary groupings
  me:    { id, name },         // local identity (clubs/shares)
  shared:{ lists: [ {code,name,kind} ], clubs: [ {code,name,cover} ] },
  syncCfg: { url, key },       // optional Supabase creds for live sync
  theme: "nocturne" | "dawn",  // (was light/dark)
  goal:  { year, target } | null
}
```

### Book
```jsonc
{
  id, title, first, last,            // author split into first/last
  series, position, seriesCount,     // seriesCount=null means "length not set"
  status: "Standalone"|"Series"|"Complete",
  subgenre, genres:[], tropes:[], spice: 0..5,
  cover, isbn,
  fave: bool,
  owned: {                           // PER-FORMAT ownership (replaces single format/source)
    physical: false | "paperback" | "hardcover" | true,
    ebook:     bool,
    audiobook: bool
  },                                 // "owned" === any flag truthy; all-false = wishlist
  myRating: 0..5,                    // the READER'S own rating. NO aggregate/average anywhere.
  reviews: [ { by, byName, rating, text, date } ],  // OTHERS' individual reviews, opt-in view;
                                                    // shown as a list, never averaged
  readStatus: "Unread"|"Reading"|"Read"|"DNF",
  pub: { y, m, d },                  // any part may be null (flexible precision)
  reads: [ { date, format, rating, notes } ],   // reread log; format read may differ from owned
  plan: "YYYY-MM-DD" | null,         // planned "need to read" date
  progress: 0..100,                  // % while Reading
  addedTs
}
```

> **Ownership vs. format-read are separate.** `owned` is which copies you have; a
> `reads[].format` is what you read that time (you can read a borrowed/library copy you
> don't own). The **Owned · Physical / Ebook / Audiobook** shelves are *smart shelves*
> derived from `owned`, not manual lists.
>
> **Ratings:** keep `myRating` (and per-read ratings). Do **not** compute or show an
> aggregate/average. `reviews` are individual entries from others, surfaced only when the
> reader opts to look — never reduced to a single headline number.

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

## 2. Proposed relational schema (backend)

Postgres, row-level-security scoped to the authenticated user. Names are indicative.

```sql
-- identity is handled by the auth provider; profiles extends it
profiles            (id pk = auth user, display_name, created_at)

books               (id pk, owner_id fk→profiles, title, author_first, author_last,
                     series, position, series_count, status, subgenre,
                     spice smallint, cover_url, isbn, fave bool,
                     owned_physical text,        -- null|'paperback'|'hardcover'|'yes'
                     owned_ebook bool, owned_audiobook bool,
                     my_rating smallint, read_status, source,
                     pub_y, pub_m, pub_d,            -- flexible precision
                     plan_date, progress smallint, added_at, updated_at)
                     -- NOTE: no aggregate_rating column. Ratings stay personal.
book_genres         (book_id fk, genre)             -- or text[] on books
book_tropes         (book_id fk, trope)             -- or text[] on books
reads               (id pk, book_id fk, date, format, rating, notes)   -- reread log
reviews             (id pk, book_id fk, reviewer_id fk, rating, body, created_at)
                     -- OTHERS' individual reviews; queried on demand, never averaged
-- Owned·Physical / ·Ebook / ·Audiobook shelves are VIEWS over books.owned_* (smart shelves)

lists               (id pk, owner_id fk, name, kind 'tbr'|'collection',
                     is_priority bool, created_at)
list_items          (list_id fk, book_id fk, position, primary key(list_id,book_id))

households          (id pk, name, created_by fk, created_at)
household_members   (household_id fk, user_id fk, role, primary key(household_id,user_id))
-- household library scoping: either books.household_id, or a shared list space

clubs               (id pk, title, author, cover_url,
                     unit_type 'chapter'|'page'|'percent', unit_count, unit_label,
                     created_by fk, created_at)
club_members        (club_id fk, user_id fk, display_name, progress int,
                     primary key(club_id,user_id))
club_comments       (id pk, club_id fk, user_id fk, unit int, body, created_at)
-- spoiler gating (server-enforced option): a reader may SELECT a comment only when
-- their club_members.progress >= comment.unit  (enforce via RLS / a view / an RPC)

shared_lists        (id pk, share_code unique, name, kind, items jsonb,
                     owner_id fk, updated_at)   -- keep capability-code sharing if desired
```

### Notes
- `series_count IS NULL` continues to drive the **"None set"** filter ("what needs
  completing").
- `pub_y/m/d` keep the flexible publish-date precision the prototype supports.
- The reread log stays a child table so "books read with vs. without rereads" is a
  `COUNT(DISTINCT book_id)` vs `COUNT(*)` over `reads` in a date range.
- Tropes/genres can be join tables (clean filtering) or `text[]` columns (simpler);
  pick during the build.
- `club_comments` gating is the one place to decide honor-based vs. server-enforced
  (see `ARCHITECTURE.md`).

### Carry-over logic already written in the prototype
- **Merge engine** (`mergeBooks`): unions reads (dedup by date), tropes, genres, fave,
  best cover, max rating/spice, series info, pub date; remaps list memberships; deletes
  losers. Tested in isolation. → becomes a server RPC or typed client util.
- **CSV import** (`parseCSV`/`importCsv`): Goodreads/StoryGraph headers → merge by
  title+author, bring ratings/shelves/real read dates. → Edge Function.
- **Spoiler gate**: `comment.unit <= myProgress`. → RLS/RPC if server-enforced.
