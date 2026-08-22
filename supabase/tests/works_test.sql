-- works — the shared corpus's boundary, asserted at the layer that carries it.
--
-- The design is one SELECT policy + NO write policies (service_role bypasses RLS and is the write
-- path). Per CLAUDE.md's grant-layer rule, the refusals below assert SQLSTATE 42501 specifically —
-- a permission error at the grant/policy layer. A P0001 or a row-silently-missing here would mean
-- the boundary moved somewhere else, which is the regression this file exists to catch.

begin;
select plan(8);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'authenticated', 'authenticated', 'works-a@example.com', '{}', '{"display_name":"WA"}', now(), now());

-- Seed one corpus row as table owner (RLS bypass — the same standing service-role write path).
insert into public.works (work_key, title, contributors, genre, tags)
values ('fourthwing|rebeccayarros', 'Fourth Wing',
        '[{"name":"Rebecca Yarros","role":"author","position":0}]', 'romance',
        array['Dragon Riders']);

-- ── a signed-in reader ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.works),
  1,
  'authenticated reads the corpus — the whole read model'
);

select is(
  (select title from public.works where work_key = 'fourthwing|rebeccayarros'),
  'Fourth Wing',
  'row content is readable, not just countable'
);

select throws_ok(
  $$insert into public.works (work_key, title) values ('sneak|writer', 'Sneak')$$,
  '42501',
  null,
  'authenticated cannot INSERT — client promotion is fenced at the grant layer'
);

select throws_ok(
  $$update public.works set title = 'Vandalized' where work_key = 'fourthwing|rebeccayarros'$$,
  '42501',
  null,
  'authenticated cannot UPDATE — one reader''s typo cannot become everyone''s metadata'
);

select throws_ok(
  $$delete from public.works where work_key = 'fourthwing|rebeccayarros'$$,
  '42501',
  null,
  'authenticated cannot DELETE'
);

-- ── anon stays outside entirely ──
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$select count(*) from public.works$$,
  '42501',
  null,
  'anon cannot even SELECT — the corpus is app content, not a public API'
);

select throws_ok(
  $$insert into public.works (work_key, title) values ('anon|writer', 'Anon')$$,
  '42501',
  null,
  'anon cannot INSERT'
);

-- ── and the seed row survived every refusal above ──
reset role;
select is(
  (select title from public.works where work_key = 'fourthwing|rebeccayarros'),
  'Fourth Wing',
  'asserted as a role nothing filters: the refusals refused, they did not silently no-op'
);

select * from finish();
rollback;
