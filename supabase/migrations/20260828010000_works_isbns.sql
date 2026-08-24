-- ISBNs identify editions associated with a work, not the work itself. Keep work_key as the
-- identity anchor and store every known edition identifier in canonical ISBN-13 form so a scan of
-- any edition can find the shared work record.

alter table public.works
  add column isbns text[] not null default '{}';

comment on column public.works.isbns is
  'Deduplicated canonical ISBN-13 identifiers for editions associated with this work; not work identity.';

-- Add/search asks whether the array contains one canonical ISBN. GIN supports that containment
-- query without changing the work-level shape of the table.
create index works_isbns_idx on public.works using gin (isbns);
