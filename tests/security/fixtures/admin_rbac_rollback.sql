-- DESIGN ONLY: emergency capability shutdown, not a destructive schema rollback.
-- Apply only after a future rollout explicitly authorizes recovery.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION private.is_dashboard_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $f$ SELECT false $f$;
DROP POLICY dashboard_admin_private_image_get ON storage.objects;
REVOKE SELECT ON public.admin_audit_log FROM authenticated;
REVOKE EXECUTE ON FUNCTION
  private.admin_summary(),
  private.admin_users(integer,timestamptz,uuid,text,uuid),
  private.admin_properties(integer,timestamptz,uuid,text,text,text,text,text,text,uuid,boolean,timestamptz,timestamptz,uuid),
  public.admin_dashboard_summary(),
  public.admin_users(integer,timestamptz,uuid,text,uuid),
  public.admin_properties(integer,timestamptz,uuid,text,text,text,text,text,text,uuid,boolean,timestamptz,timestamptz,uuid)
FROM authenticated;
-- Keep audit/memberships/history and system-field/E0/publication protections.
-- public.dashboard_access() remains callable and returns false.
NOTIFY pgrst,'reload schema';
COMMIT;
