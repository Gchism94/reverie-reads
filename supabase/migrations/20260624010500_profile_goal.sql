-- The yearly reading goal lives on the profile (one current goal per user).
alter table public.profiles
  add column goal_year smallint,
  add column goal_target smallint;
