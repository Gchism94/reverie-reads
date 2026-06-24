-- Table-level privileges. RLS decides WHICH rows a role may touch, but the role still
-- needs base privileges on the table to touch it at all. anon stays locked out of every
-- per-user table; only the capability-keyed shared_docs is reachable anonymously.

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.books to authenticated;
grant select, insert, update, delete on public.reads to authenticated;
grant select, insert, update, delete on public.lists to authenticated;
grant select, insert, update, delete on public.list_items to authenticated;
grant select, insert, update, delete on public.clubs to authenticated;
grant select, insert, update, delete on public.club_members to authenticated;
grant select, insert, update, delete on public.club_comments to authenticated;

grant select, insert, update on public.shared_docs to anon, authenticated;
