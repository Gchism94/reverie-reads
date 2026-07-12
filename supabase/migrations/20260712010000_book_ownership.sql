-- Ownership model: decouple "owned" from "in my library" (docs/task-ownership-model.md).
-- A book record no longer implies possession — `ownership` says whether the reader owns it
-- ('owned') or wants it ('unowned' = wishlist/TBR). Two states only, by decision; the text +
-- check shape leaves room for richer states later (borrowed, loaned, preordered) without a
-- type migration. Per-format flags (owned_physical/ebook/audiobook) keep describing WHICH
-- formats an owned book has.
--
-- Backfill: ADD COLUMN NOT NULL DEFAULT rewrites every existing row with 'owned' — exactly the
-- required backfill (everything in a library today is a book the reader owns).
-- RLS: unchanged — ownership is a user-scoped attribute like any other books column.

alter table public.books
  add column ownership text not null default 'owned'
  constraint books_ownership_check check (ownership in ('owned', 'unowned'));
