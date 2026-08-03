-- S2 of the reading-orders demolition (docs/task-drop-reading-orders.md). S1 (merged, live) stopped
-- the app touching these tables; this drops them. Series position is now the single ordering
-- mechanism — see chore/drop-reading-orders for the audit that decided this.
--
-- Production record before this ran (read-only query, chore/drop-reading-orders-schema):
--   reading_orders: 1 row — id 9f1d1575-7108-4b67-ad1f-cda62d705dac, owner_id
--   206adb0b-3bfa-47c9-9ef0-0b41b9376dc7, name 'Game of', description null,
--   created_at = updated_at = 2026-07-11 10:39:21.487263+00 (never edited after creation).
--   reading_order_items: 0 rows.
-- No S1 restore path can recreate this row — the backup format skips the key on purpose. This
-- comment is the only remaining record of it once the migration runs.
--
-- DROP ORDER — items before orders, not arbitrary. reading_order_items.reading_order_id references
-- reading_orders(id) on delete cascade; that ON DELETE CASCADE governs row deletes, not table drops.
-- Postgres refuses to drop a table another table's FK still points at, so the referencing table
-- (reading_order_items) must go first. Nothing else in the schema references either table — checked
-- by grep across every migration before this ran.

drop table if exists public.reading_order_items;
drop table if exists public.reading_orders;
