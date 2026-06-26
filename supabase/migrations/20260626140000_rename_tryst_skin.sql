-- D0a: the romance skin's id moves 'reverie' -> 'tryst'. "Reverie" is now the umbrella app name;
-- the romance skin took the other cleared finalist, Tryst. Visuals are unchanged. This migrates
-- existing prefs so no profile is left pointing at a now-invalid skin id. Idempotent (re-running
-- finds nothing left to change); covered by the existing owner-scoped profiles RLS.

-- Default for new profiles.
alter table public.profiles alter column skin set default 'tryst';

-- Backfill the selected skin.
update public.profiles set skin = 'tryst' where skin = 'reverie';

-- Backfill the stored adaptive bundle: rename the 'reverie' weight key and the dominant value.
-- Inner parens are required: '-' binds tighter than '->', so (x->'weights') must be grouped.
update public.profiles
set adaptive_skin = jsonb_set(
      (adaptive_skin - 'weights') || jsonb_build_object(
        'weights',
        ((adaptive_skin -> 'weights') - 'reverie')
          || jsonb_build_object('tryst', adaptive_skin -> 'weights' -> 'reverie')
      ),
      '{dominant}',
      to_jsonb(case when adaptive_skin ->> 'dominant' = 'reverie' then 'tryst'
                    else adaptive_skin ->> 'dominant' end)
    )
where adaptive_skin is not null
  and adaptive_skin ? 'weights'
  and (adaptive_skin -> 'weights') ? 'reverie';

-- Same for any pending suggestion the cron has written.
update public.profiles
set adaptive_pending = jsonb_set(
      (adaptive_pending - 'weights') || jsonb_build_object(
        'weights',
        ((adaptive_pending -> 'weights') - 'reverie')
          || jsonb_build_object('tryst', adaptive_pending -> 'weights' -> 'reverie')
      ),
      '{dominant}',
      to_jsonb(case when adaptive_pending ->> 'dominant' = 'reverie' then 'tryst'
                    else adaptive_pending ->> 'dominant' end)
    )
where adaptive_pending is not null
  and adaptive_pending ? 'weights'
  and (adaptive_pending -> 'weights') ? 'reverie';
