# Supabase (wired in Step 2)

Local stack, migrations, edge functions, and seed live here.

`backend/supabase_schema.sql` gets migrated in during Step 2 and expanded to the
relational schema in `docs/DATA_MODEL.md` (profiles, books, reads, lists/list_items,
clubs/…), with row-level security scoped to the user. Run `supabase start` once the
local project is initialized.
