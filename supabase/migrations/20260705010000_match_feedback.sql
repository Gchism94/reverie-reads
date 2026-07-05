-- Match feedback (owner-approved dev path): the reader's "not tonight" survives the device.
-- The matcher's novelty decay reads dismissed-at timestamps; before this they lived in
-- localStorage, so a dismissal on the phone never reached the laptop. One row per
-- (user, book, kind); v1 ships kind='dismissed' only, but the check stays a list on purpose —
-- Tier-2 signals (saved, more-like-this) extend it without a reshape.

create table public.match_feedback (
  user_id uuid not null references auth.users (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  kind text not null default 'dismissed' check (kind in ('dismissed')),
  at timestamptz not null default now(),
  primary key (user_id, book_id, kind)
);

create index match_feedback_user_idx on public.match_feedback (user_id);

alter table public.match_feedback enable row level security;

create policy "match_feedback: own rows" on public.match_feedback
  for all using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- RLS decides WHICH rows; the role still needs base privileges (house rule from the grants
-- migration). anon stays locked out — feedback is a signed-in signal.
grant select, insert, update, delete on public.match_feedback to authenticated;
grant all on public.match_feedback to service_role;
