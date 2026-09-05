begin;
select plan(22);
insert into auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('dd000000-0000-0000-0000-000000000001','authenticated','authenticated','delete-category@example.com','{}','{}',now(),now()),
('dd000000-0000-0000-0000-000000000002','authenticated','authenticated','other-category@example.com','{}','{}',now(),now());
insert into public.series(id,owner_id,name) values
('dd100000-0000-0000-0000-000000000001','dd000000-0000-0000-0000-000000000001','Incorrect category'),
('dd100000-0000-0000-0000-000000000002','dd000000-0000-0000-0000-000000000001','Real series');
insert into public.books(id,owner_id,title,ownership) values
('dd200000-0000-0000-0000-000000000001','dd000000-0000-0000-0000-000000000001','My book','owned'),
('dd200000-0000-0000-0000-000000000002','dd000000-0000-0000-0000-000000000001','Another book','unowned');
insert into public.reads(id,book_id,owner_id,read_on,format,notes) values
('dd300000-0000-0000-0000-000000000001','dd200000-0000-0000-0000-000000000001','dd000000-0000-0000-0000-000000000001','2026-08-01','ebook','My private memory');
insert into public.series_entries(series_id,owner_id,position,title,author,book_id,is_primary,membership_claim) values
('dd100000-0000-0000-0000-000000000001','dd000000-0000-0000-0000-000000000001',1,'My book','','dd200000-0000-0000-0000-000000000001',true,'{"origin":"reader"}'),
('dd100000-0000-0000-0000-000000000001','dd000000-0000-0000-0000-000000000001',2,'Another book','','dd200000-0000-0000-0000-000000000002',false,'{"origin":"reader"}'),
('dd100000-0000-0000-0000-000000000001','dd000000-0000-0000-0000-000000000001',3,'Imagined missing book','',null,false,'{"origin":"reader"}');
insert into public.series_entries(series_id,owner_id,position,title,author,book_id,is_primary,membership_claim) values
('dd100000-0000-0000-0000-000000000002','dd000000-0000-0000-0000-000000000001',1,'Another book','','dd200000-0000-0000-0000-000000000002',true,'{"origin":"reader"}');
select ok(not has_function_privilege('anon','public.delete_personal_series(uuid)','execute'),'anon has no delete privilege');
select ok(not has_function_privilege('service_role','public.delete_personal_series(uuid)','execute'),'service role has no delete privilege');
set local role anon;
select throws_ok($$select public.delete_personal_series('dd100000-0000-0000-0000-000000000001')$$,'42501',null,'anon stopped at grant boundary');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"dd000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.delete_personal_series('dd100000-0000-0000-0000-000000000001')$$,'42501','not owner of series','another reader cannot delete the category');
reset role;
select is((select count(*)::int from public.series_entries where series_id='dd100000-0000-0000-0000-000000000001'),3,'failed foreign action keeps every entry');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"dd000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.delete_personal_series('dd100000-0000-0000-0000-000000000001')$$,'owner deletes an incorrect category');
reset role;
select is((select count(*)::int from public.series where id='dd100000-0000-0000-0000-000000000001'),0,'category is physically deleted, not hidden by RLS');
select is((select count(*)::int from public.series_entries where series_id='dd100000-0000-0000-0000-000000000001'),0,'category memberships and ghost slots are deleted');
select is((select count(*)::int from public.books where owner_id='dd000000-0000-0000-0000-000000000001'),2,'both personal books remain');
select ok((select series is null and position is null and series_user_chosen and series_claim->>'origin'='reader' from public.books where id='dd200000-0000-0000-0000-000000000001'),'primary clear is deliberate reader intent');
select is((select ownership from public.books where id='dd200000-0000-0000-0000-000000000001'),'owned','possession is unchanged');
select is((select notes from public.reads where id='dd300000-0000-0000-0000-000000000001'),'My private memory','reading history and notes survive');
select is((select series from public.books where id='dd200000-0000-0000-0000-000000000002'),'Real series','other primary remains intact');
select is((select count(*)::int from public.series_entries where series_id='dd100000-0000-0000-0000-000000000002'),1,'other membership remains intact');
set local role authenticated;
select is((public.delete_personal_series('dd100000-0000-0000-0000-000000000001')->>'already_deleted')::boolean,true,'lost-response retry is idempotent');
select is((select count(*)::int from public.list_archived_personal_series()),0,'permanent deletion leaves no restorable category');
reset role;
-- Legacy unknown membership, an empty category, and an already archived category all remain
-- removable; the legacy scalar must not re-create the category through enrichment later.
insert into public.series(id,owner_id,name) values
('dd100000-0000-0000-0000-000000000003','dd000000-0000-0000-0000-000000000001','Legacy category'),
('dd100000-0000-0000-0000-000000000004','dd000000-0000-0000-0000-000000000001','Empty category'),
('dd100000-0000-0000-0000-000000000005','dd000000-0000-0000-0000-000000000001','Archived category');
insert into public.books(id,owner_id,title,series,series_claim) values
('dd200000-0000-0000-0000-000000000003','dd000000-0000-0000-0000-000000000001','Legacy book','Legacy category','{"origin":"unknown"}');
select is((select series from public.books where id='dd200000-0000-0000-0000-000000000003'),'Legacy category','fixture carries an unreviewed legacy series label');
set local role authenticated;
select lives_ok($$select public.delete_personal_series('dd100000-0000-0000-0000-000000000003')$$,'legacy category can be removed');
select ok((select series is null and series_user_chosen from public.books where id='dd200000-0000-0000-0000-000000000003'),'legacy label is cleared with reader-choice protection');
select lives_ok($$select public.delete_personal_series('dd100000-0000-0000-0000-000000000004')$$,'empty category can be removed');
select public.archive_personal_series('dd100000-0000-0000-0000-000000000005');
select lives_ok($$select public.delete_personal_series('dd100000-0000-0000-0000-000000000005')$$,'an already archived category can be removed');
reset role;
select is((select count(*)::int from public.series where id in ('dd100000-0000-0000-0000-000000000003','dd100000-0000-0000-0000-000000000004','dd100000-0000-0000-0000-000000000005')),0,'all three categories are physically gone');
select * from finish();
rollback;
