-- E3 integration: per-book cover/match confidence from enrichment (docs/COVER_SOURCING_AND_STUDIO.md).
-- The bulk enrichment pass resolves covers by title+author (no ISBN in the real files), so a cover can
-- be a confident match or a fuzzy guess. Recording the confidence lets the import-review "needs a look"
-- screen rebuild its low-confidence-cover bucket at any time (the Cover Studio re-fetches the alternate
-- editions on demand from the global enrichment_cache). Owner-scoped column on books — inherits the
-- table's existing RLS; null means a trusted user/seed cover (never flagged).
alter table public.books add column cover_confidence text;
