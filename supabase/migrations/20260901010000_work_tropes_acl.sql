-- Close the work_tropes table ACL after production verification found legacy auto-exposure grants
-- that the creating migration never revoked. The local stack uses the newer non-auto-exposed
-- default, so additive grants alone looked correct there. RLS remains enabled, but it is not a
-- substitute for the grant-layer boundary: anonymous receives no table access, authenticated
-- receives read-only access, and service_role remains the only direct writer.
revoke all privileges on table public.work_tropes
  from public, anon, authenticated, service_role;

grant select on table public.work_tropes to authenticated;
grant all privileges on table public.work_tropes to service_role;
