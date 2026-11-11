-- Proposed additive hardening, not applied by this local review.
-- Schedule AFTER the existing RBAC migration: its certified catalog fingerprint
-- includes historical ACLs. Do not rewrite that migration or its baseline.
-- Historical GRANT ALL survives the row-level INSERT/UPDATE hardening below.
-- TRUNCATE bypasses RLS and row DELETE triggers, including ON DELETE actions.
-- PUBLIC must also be revoked because both client roles inherit its grants.
begin;

revoke truncate on table
  public.properties,
  public.property_images,
  public.property_features,
  public.leads,
  public.favorites,
  public.property_views
from public, anon, authenticated;

commit;
