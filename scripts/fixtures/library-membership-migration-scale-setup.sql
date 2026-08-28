\set ON_ERROR_STOP on

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '91111111-1111-4111-8111-111111111111',
  'authenticated',
  'authenticated',
  'migration-scale@example.com',
  '{}',
  '{"display_name":"Migration Scale"}',
  now(),
  now()
);

-- A production-sized catalog with both unique fallback and unique ISBN personal matches.
insert into public.works (id, work_key, title, author_text, contributors, isbns)
select
  md5('scale-work-' || n)::uuid,
  'scale:' || n,
  'Scale Work ' || n,
  'Scale Author ' || n,
  jsonb_build_array(jsonb_build_object(
    'name', 'Scale Author ' || n, 'role', 'author', 'position', 0
  )),
  array['978' || lpad(n::text, 10, '0')]
from generate_series(1, 25000) n;

-- First half resolves by title/full-author fallback; second half resolves by ISBN even though its
-- personal fallback is deliberately different from the canonical work.
insert into public.books (
  id, owner_id, title, authors_display, isbn, enriched_at, updated_at
)
select
  md5('scale-book-' || n)::uuid,
  '91111111-1111-4111-8111-111111111111',
  case when n <= 2500 then 'Scale Work ' || n else 'ISBN-only Personal ' || n end,
  case when n <= 2500 then 'Scale Author ' || n else 'Different Personal Author ' || n end,
  case when n <= 2500 then null else '978' || lpad(n::text, 10, '0') end,
  case when n = 1 then '2020-01-02T03:04:05Z'::timestamptz else null end,
  case when n = 1 then '2020-01-02T03:04:06Z'::timestamptz else now() end
from generate_series(1, 5000) n;

-- Ordinary behavior: duplicate personal copies with one missing identity create and share one
-- provisional work.
insert into public.books (id, owner_id, title, authors_display, updated_at)
values
  ('92000000-0000-4000-8000-000000000001', '91111111-1111-4111-8111-111111111111',
   'Ordinary Shared Personal', 'Ordinary Writer', '2026-08-27T01:00:00Z'),
  ('92000000-0000-4000-8000-000000000002', '91111111-1111-4111-8111-111111111111',
   'Ordinary Shared Personal', 'Ordinary Writer', '2026-08-27T02:00:00Z');

-- Established ambiguous behavior: either a duplicate fallback or duplicate ISBN refuses to guess.
insert into public.works (id, work_key, title, author_text, isbns)
values
  ('90000000-0000-4000-8000-000000000001', 'legacy:ambiguous-fallback-a',
   'Ambiguous Fallback', 'Ambiguous Writer', '{}'),
  ('90000000-0000-4000-8000-000000000002', 'legacy:ambiguous-fallback-b',
   'Ambiguous Fallback', 'Ambiguous Writer', '{}'),
  ('90000000-0000-4000-8000-000000000003', 'legacy:ambiguous-isbn-a',
   'Canonical ISBN A', 'Canonical Writer A', array['9790000000003']),
  ('90000000-0000-4000-8000-000000000004', 'legacy:ambiguous-isbn-b',
   'Canonical ISBN B', 'Canonical Writer B', array['9790000000003']);

insert into public.books (id, owner_id, title, authors_display, isbn)
values
  ('92000000-0000-4000-8000-000000000003', '91111111-1111-4111-8111-111111111111',
   'Ambiguous Fallback', 'Ambiguous Writer', null),
  ('92000000-0000-4000-8000-000000000004', '91111111-1111-4111-8111-111111111111',
   'Ambiguous ISBN Personal', 'Different Writer', '9790000000003');

-- Exact zero-binding regression. The newer row wins distinct-on fallback candidate selection, but
-- its ISBN already belongs to a corpus work whose canonical fallback is different. The sibling has
-- a different unmatched ISBN, so after candidate creation it has neither an ISBN nor fallback
-- target. It must receive its own reconciliation work instead of reaching a NOT NULL insert.
insert into public.works (id, work_key, title, author_text, isbns)
values (
  '90000000-0000-4000-8000-000000000005',
  'external:mixed-selected-isbn',
  'Canonical Different Identity',
  'Canonical Different Author',
  array['9790000000001']
);

insert into public.books (id, owner_id, title, authors_display, isbn, updated_at)
values
  ('92000000-0000-4000-8000-000000000005', '91111111-1111-4111-8111-111111111111',
   'Mixed Personal Identity', 'Mixed Writer', '9790000000001', '2026-08-27T02:00:00Z'),
  ('92000000-0000-4000-8000-000000000006', '91111111-1111-4111-8111-111111111111',
   'Mixed Personal Identity', 'Mixed Writer', '9790000000002', '2026-08-27T01:00:00Z');

-- Six ordinary unmatched identities exercise provisional creation at scale and bring the personal
-- fixture to 5,012 rows.
insert into public.books (id, owner_id, title, authors_display)
select
  md5('unmatched-book-' || n)::uuid,
  '91111111-1111-4111-8111-111111111111',
  'Unmatched Personal ' || n,
  'Unmatched Writer ' || n
from generate_series(1, 6) n;

analyze public.works;
analyze public.books;
