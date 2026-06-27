-- Phase 7 H2: a global, shared Storage bucket for book covers. On enrichment the resolved cover
-- image is fetched once and stored here keyed by work/edition (like enrichment_cache), then served
-- from Supabase Storage's CDN — so we stop hotlinking retailer/library URLs (which break, throttle,
-- and bandwidth-charge). Public-read (covers aren't sensitive); only the service role (the enrich
-- Edge Function) writes. A broken/absent cover falls back to the source URL, then a placeholder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('covers', 'covers', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;
