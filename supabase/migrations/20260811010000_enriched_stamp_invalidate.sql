-- A change to a book's MATCHING KEYS invalidates its enrichment stamp — enforced in the database,
-- because the database is the only layer every writer passes through.
--
-- ── The incident this closes ───────────────────────────────────────────────────────────────────
-- The enrichment sweep negative-caches honestly: a book checked against the sources and not found
-- is stamped `enriched_at` (20260624011000), and `shouldCheck` then refuses it for 3 days (partial)
-- or 30 (complete). Correct — until the QUESTION changes. 112 books were swept while their titles
-- still carried Goodreads series junk ("Title (Series, #2)"), missed for exactly that reason, and
-- stamped. The series backfill (20260809010000) then rewrote those titles server-side. The books
-- became findable; the stamps did not know; the Settings button promised (112) and the sweep
-- checked 0 of 0. A stored verdict about a title that no longer exists is a cached answer to a
-- question nobody is asking anymore.
--
-- ── Why a TRIGGER and not the title-writing code paths ─────────────────────────────────────────
-- Because the writer that actually caused the incident never ran client code at all: it was a SQL
-- migration. The title-rewriting paths today are the edit dialog (updateBook), the Settings legacy
-- title sweep (applySweep), the merge RPC, the backup restore, and any future migration — five
-- writers in three languages, and the invalidation rule is one sentence. Putting that sentence in
-- each writer is how it gets dropped from the sixth. This defect class — a stored assertion that
-- stopped being true with no mechanism to notice — has recurred repeatedly; the mechanism-to-notice
-- belongs at the one chokepoint that cannot be bypassed.
--
-- ── Which fields, and why ──────────────────────────────────────────────────────────────────────
-- The stamp caches the sources' answer to a QUERY built from title + author (or ISBN — see
-- enrich/index.ts's adapters). The fields that form that query are the stamp's validity keys:
--   · title                       — the primary search key
--   · author_first / author_last  — the co-key (`author=` / `inauthor:`); a corrected author makes
--                                   a missed book findable exactly like a corrected title
--   · isbn                        — the STRONGEST key; an added or fixed ISBN changes the query
--                                   entirely (isbn: lookup instead of title search)
-- A typo fix is deliberately included: fixing "Fourh Wing" → "Fourth Wing" re-opens enrichment,
-- which is precisely what the reader wants — the fix may be what makes the book findable. The cost
-- ceiling is one extra source check per edited book, rate-limited server-side, fill-only on merge.
-- Fields that do NOT form the query (rating, status, pages, …) never touch the stamp.
--
-- ── The writer-knows exception ─────────────────────────────────────────────────────────────────
-- The sweep's own fill write UPDATEs isbn (a filled blank) AND sets a fresh `enriched_at` in the
-- same statement (enrichLibrary.ts:305). Nulling there would destroy every stamp the sweep writes.
-- Rule: a write that changes a key while setting its own new `enriched_at` keeps the writer's
-- stamp — the writer is the enricher and knows more than the trigger; a write that changes a key
-- WITHOUT restamping loses the stamp. `IS DISTINCT FROM` on OLD/NEW makes this exact.
--
-- The edit dialog always sends title/isbn in its patch even when unchanged (dialogs.tsx:272-273);
-- OLD/NEW comparison means an unchanged value never clears — no client change needed for that.
--
-- ── What this deliberately does NOT do ─────────────────────────────────────────────────────────
-- No backfill of the 112 already-stale stamps. They are all PARTIAL books (that's why they're in
-- the incomplete count), so PARTIAL_RETRY_DAYS = 3 ages every one of them back into eligibility
-- within days of the stamps' write — the wound self-heals; a repair migration would race its own
-- pointlessness. The GLOBAL enrichment_cache needs nothing either: its key is derived from the
-- REQUEST (isbn, else normalized title+author), so a cleaned title asks under a new key by
-- construction.

create or replace function public.invalidate_enriched_stamp()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  -- writer-knows: a statement that sets its own new stamp keeps it
  if new.enriched_at is distinct from old.enriched_at then
    return new;
  end if;
  if new.title        is distinct from old.title
  or new.author_first is distinct from old.author_first
  or new.author_last  is distinct from old.author_last
  or new.isbn         is distinct from old.isbn
  then
    new.enriched_at := null;
  end if;
  return new;
end
$fn$;

-- A trigger function (`returns trigger`) is not callable through PostgREST, so the RPC
-- revoke/grant convention does not apply — there is no callable surface to gate.

drop trigger if exists books_enriched_stamp_invalidate on public.books;
create trigger books_enriched_stamp_invalidate
  before update on public.books
  for each row
  execute function public.invalidate_enriched_stamp();
