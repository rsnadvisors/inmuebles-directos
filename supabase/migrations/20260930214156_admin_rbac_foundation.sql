-- DESIGN ONLY. Not executed. PR-A: foundation/read-only capabilities.
-- Current catalog fingerprint is strict; any drift requires re-review.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $pre$
DECLARE v text;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Run only through authorized postgres migration operator';
  END IF;
  select md5(jsonb_build_object(
'columns',(select jsonb_agg(jsonb_build_array(table_schema,table_name,column_name,data_type,udt_name,is_nullable,column_default) order by table_schema,table_name,ordinal_position) from information_schema.columns where table_schema='public' and table_name in ('profiles','properties','property_images','property_features','leads','property_views','favorites')),
'constraints',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,k.conname,pg_get_constraintdef(k.oid)) order by n.nspname,c.relname,k.conname) from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'),
'policies',(select jsonb_agg(jsonb_build_array(schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check) order by schemaname,tablename,policyname) from pg_policies where schemaname='public' or (schemaname='storage' and tablename='objects')),
'functions',(select jsonb_agg(jsonb_build_array(n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid),p.proacl::text,pg_get_userbyid(p.proowner)) order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' or (n.nspname='public' and p.proname in ('finalize_own_property_publication','finalize_private_property_publication'))),
'tables',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text) order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'),
'column_acl',(select jsonb_agg(jsonb_build_array(c.relname,a.attname,a.attacl::text) order by c.relname,a.attname) from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and a.attnum>0 and not a.attisdropped),
'triggers',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)) order by n.nspname,c.relname,t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and (n.nspname='public' or (n.nspname='auth' and c.relname='users')))
)::text) INTO v;
  IF v IS DISTINCT FROM 'e83685a3edb9d051ed75374c6f241ff8' THEN
    RAISE EXCEPTION 'RBAC baseline catalog drift';
  END IF;
  IF (SELECT array_agg(version::text ORDER BY version)
      FROM supabase_migrations.schema_migrations)
     IS DISTINCT FROM ARRAY['20260909040437','20260921140457',
       '20260922185044','20260926200632','20260927153000','20260930134657']::text[]
  THEN RAISE EXCEPTION 'Migration history drift'; END IF;
  IF to_regclass('private.dashboard_admins') IS NOT NULL
     OR to_regclass('public.admin_audit_log') IS NOT NULL THEN
    RAISE EXCEPTION 'RBAC objects already exist; do not silently reuse';
  END IF;
END $pre$;

-- Existing roles/constraints stay unchanged; only harden resolution.
ALTER FUNCTION private.is_admin() SET search_path = '';

CREATE TABLE private.dashboard_admins (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by text NOT NULL
);
ALTER TABLE private.dashboard_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.dashboard_admins FROM PUBLIC, anon, authenticated, service_role;
-- No client policies and no initial rows. Operator access only.

CREATE TABLE public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  request_id uuid NOT NULL,
  before_data jsonb NOT NULL,
  after_data jsonb NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(action, entity_id, request_id),
  CHECK (jsonb_typeof(before_data)='object'
     AND jsonb_typeof(after_data)='object'
     AND jsonb_typeof(metadata)='object')
);
CREATE INDEX admin_audit_entity_time
  ON public.admin_audit_log(entity_type,entity_id,created_at DESC,id DESC);
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_audit_log FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.is_dashboard_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $f$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN private.dashboard_admins m ON m.user_id=p.id
    WHERE p.id=auth.uid() AND p.role='admin' AND m.enabled
  );
$f$;
REVOKE ALL ON FUNCTION private.is_dashboard_admin()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_dashboard_admin() TO authenticated;

CREATE POLICY dashboard_admin_audit_read ON public.admin_audit_log
FOR SELECT TO authenticated USING ((SELECT private.is_dashboard_admin()));
GRANT SELECT ON public.admin_audit_log TO authenticated;

CREATE FUNCTION private.reject_audit_change() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $f$
BEGIN
  RAISE EXCEPTION 'Audit is append-only' USING ERRCODE='42501';
END $f$;
REVOKE ALL ON FUNCTION private.reject_audit_change()
  FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER audit_no_update_delete BEFORE UPDATE OR DELETE
ON public.admin_audit_log FOR EACH ROW
EXECUTE FUNCTION private.reject_audit_change();
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE
ON public.admin_audit_log FOR EACH STATEMENT
EXECUTE FUNCTION private.reject_audit_change();

-- Operator-only; NOT a web RPC and no role promotion.
CREATE FUNCTION private.set_dashboard_admin(
  p_user uuid,p_enabled boolean,p_reason text,p_request uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $f$
DECLARE old_enabled boolean; prior_exists boolean;
BEGIN
  IF current_user <> 'postgres' OR p_user IS NULL OR p_enabled IS NULL
     OR p_request IS NULL OR p_reason IS NULL
     OR length(btrim(p_reason)) NOT BETWEEN 1 AND 250 THEN
    RAISE EXCEPTION 'Invalid operator request' USING ERRCODE='42501';
  END IF;
  LOCK TABLE private.dashboard_admins IN EXCLUSIVE MODE;
  PERFORM 1 FROM public.profiles WHERE id=p_user AND role='admin' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Target must already have admin role'; END IF;
  SELECT enabled INTO old_enabled FROM private.dashboard_admins WHERE user_id=p_user;
  prior_exists := FOUND;
  IF NOT p_enabled AND NOT prior_exists THEN
    RAISE EXCEPTION 'Membership does not exist';
  END IF;
  IF prior_exists AND old_enabled=p_enabled THEN
    IF EXISTS (SELECT 1 FROM public.admin_audit_log
      WHERE action='dashboard_membership' AND entity_id=p_user
        AND request_id=p_request AND after_data->>'enabled'=p_enabled::text)
    THEN RETURN; END IF;
    RAISE EXCEPTION 'No state change; use original request for retry';
  END IF;
  IF NOT p_enabled AND (SELECT count(*) FROM private.dashboard_admins m
    JOIN public.profiles p ON p.id=m.user_id
    WHERE m.enabled AND p.role='admin' AND m.user_id<>p_user)=0 THEN
    RAISE EXCEPTION 'Cannot revoke last effective dashboard administrator';
  END IF;
  INSERT INTO private.dashboard_admins(user_id,enabled,changed_by)
    VALUES(p_user,p_enabled,current_user)
  ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled,
    changed_at=now(),changed_by=excluded.changed_by;
  INSERT INTO public.admin_audit_log(
    actor_id,action,entity_type,entity_id,request_id,before_data,after_data,metadata)
  VALUES(NULL,'dashboard_membership','profile',p_user,p_request,
    jsonb_build_object('exists',prior_exists,'enabled',old_enabled),
    jsonb_build_object('enabled',p_enabled),
    jsonb_build_object('operator',current_user,'reason',btrim(p_reason)));
END $f$;
REVOKE ALL ON FUNCTION private.set_dashboard_admin(uuid,boolean,text,uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- No owner UPDATE is opened by PR-A. Protect even if later RLS is widened.
CREATE FUNCTION private.guard_property_system_fields() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $f$
DECLARE permitted text[];
BEGIN
  IF current_user IN ('postgres','service_role') THEN RETURN NEW; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
    OR NEW.agent_id IS DISTINCT FROM OLD.agent_id
    OR NEW.status IS DISTINCT FROM OLD.status
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.published_at IS DISTINCT FROM OLD.published_at
    OR NEW.slug IS DISTINCT FROM OLD.slug
    OR NEW.code IS DISTINCT FROM OLD.code THEN
    RAISE EXCEPTION 'Protected property field' USING ERRCODE='42501';
  END IF;
  -- Keep existing agent/admin content workflows, but not ownership/status mutation.
  IF private.is_agent() THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL OR OLD.owner_id IS DISTINCT FROM auth.uid()
     OR OLD.agent_id IS NOT NULL OR OLD.status NOT IN ('draft','published') THEN
    RAISE EXCEPTION 'Not an editable own property' USING ERRCODE='42501';
  END IF;
  permitted := CASE WHEN OLD.status='draft' THEN ARRAY[
    'title','description','listing_type','property_type','price','currency',
    'maintenance_fee','area_total_m2','area_built_m2','bedrooms','bathrooms',
    'parking_spaces','floors','address','district','city','region','country','lat','lng']
  ELSE ARRAY['description','price','maintenance_fee','area_total_m2',
    'area_built_m2','bedrooms','bathrooms','parking_spaces','floors'] END;
  IF (to_jsonb(NEW)-permitted-'updated_at')
     IS DISTINCT FROM (to_jsonb(OLD)-permitted-'updated_at') THEN
    RAISE EXCEPTION 'Field not allowed for this state' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $f$;
REVOKE ALL ON FUNCTION private.guard_property_system_fields()
  FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER zz_guard_property_system_fields BEFORE UPDATE
ON public.properties FOR EACH ROW
EXECUTE FUNCTION private.guard_property_system_fields();

-- Remove table-wide and previously explicit column UPDATE grants first.
-- Column grants complement the trigger; they do not open owner RLS.
REVOKE UPDATE ON public.properties FROM PUBLIC, anon, authenticated;
REVOKE UPDATE(id,code,title,slug,listing_type,property_type,status,price,currency,
  maintenance_fee,area_total_m2,area_built_m2,bedrooms,bathrooms,parking_spaces,
  floors,description,address,district,city,region,country,lat,lng,owner_id,
  agent_id,published_at,created_at,updated_at)
ON public.properties FROM PUBLIC, anon, authenticated;
GRANT UPDATE(title,description,listing_type,property_type,price,currency,
  maintenance_fee,area_total_m2,area_built_m2,bedrooms,bathrooms,parking_spaces,
  floors,address,district,city,region,country,lat,lng)
ON public.properties TO authenticated;

CREATE FUNCTION private.admin_summary() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $f$
DECLARE v jsonb; day_start timestamptz;
BEGIN
  IF NOT private.is_dashboard_admin() THEN
    RAISE EXCEPTION 'Dashboard access denied' USING ERRCODE='42501';
  END IF;
  day_start := date_trunc('day',now() AT TIME ZONE 'America/Lima')
    AT TIME ZONE 'America/Lima';
  SELECT jsonb_build_object(
    'profiles_total',(SELECT count(*) FROM public.profiles),
    'auth_users_total',(SELECT count(*) FROM auth.users),
    'properties_total',count(*),
    'published',count(*) FILTER(WHERE status='published'),
    'draft',count(*) FILTER(WHERE status='draft'),
    'archived',count(*) FILTER(WHERE status='archived'),
    'reserved',count(*) FILTER(WHERE status='reserved'),
    'sold',count(*) FILTER(WHERE status='sold'),
    'rented',count(*) FILTER(WHERE status='rented'),
    'sale',count(*) FILTER(WHERE listing_type='sale'),
    'rent',count(*) FILTER(WHERE listing_type='rent'),
    'today',count(*) FILTER(WHERE created_at>=day_start AND created_at<=now()),
    '7d',count(*) FILTER(WHERE created_at>=day_start-interval '6 days' AND created_at<=now()),
    '30d',count(*) FILTER(WHERE created_at>=day_start-interval '29 days' AND created_at<=now()),
    'views_raw_count',(SELECT count(*) FROM public.property_views),
    'leads_raw_count',(SELECT count(*) FROM public.leads),
    'favorites_count',(SELECT count(*) FROM public.favorites)
  ) INTO v FROM public.properties;
  RETURN v || jsonb_build_object('by_market',(
    SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.currency,x.listing_type,x.property_type),'[]')
    FROM (SELECT currency,listing_type,property_type,count(*) AS count
      FROM public.properties GROUP BY currency,listing_type,property_type) x));
END $f$;

CREATE FUNCTION private.admin_users(
  p_limit integer,p_before timestamptz,p_before_id uuid,p_search text,p_user uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $f$
BEGIN
  IF NOT private.is_dashboard_admin() THEN
    RAISE EXCEPTION 'Dashboard access denied' USING ERRCODE='42501';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50
    OR length(coalesce(p_search,''))>80
    OR (p_before IS NULL)<>(p_before_id IS NULL) THEN
    RAISE EXCEPTION 'Invalid pagination/search' USING ERRCODE='22023';
  END IF;
  RETURN (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.profile_created_at DESC,x.profile_id DESC),'[]')
  FROM (
    SELECT p.id AS profile_id,p.full_name,p.phone,p.role,
      p.created_at AS profile_created_at,u.email,
      u.created_at AS auth_created_at,u.last_sign_in_at,u.email_confirmed_at,
      (SELECT count(*) FROM public.properties q WHERE q.owner_id=p.id) AS property_count,
      (SELECT count(*) FROM public.properties q WHERE q.owner_id=p.id AND q.status='published') AS published_count,
      (SELECT count(*) FROM public.properties q WHERE q.owner_id=p.id AND q.status='draft') AS draft_count
    FROM public.profiles p LEFT JOIN auth.users u ON u.id=p.id
    WHERE (p_user IS NULL OR p.id=p_user)
      AND (p_before IS NULL OR (p.created_at,p.id)<(p_before,p_before_id))
      AND (coalesce(p_search,'')='' OR strpos(lower(coalesce(p.full_name,'')),lower(p_search))>0
        OR strpos(lower(coalesce(u.email,'')),lower(p_search))>0)
    ORDER BY p.created_at DESC,p.id DESC LIMIT p_limit
  ) x);
END $f$;

CREATE FUNCTION private.admin_properties(
  p_limit integer,p_before timestamptz,p_before_id uuid,p_search text,
  p_status text,p_listing text,p_type text,p_city text,p_district text,
  p_owner uuid,p_ownerless boolean,p_from timestamptz,p_to timestamptz,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $f$
BEGIN
  IF NOT private.is_dashboard_admin() THEN
    RAISE EXCEPTION 'Dashboard access denied' USING ERRCODE='42501';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50
    OR length(coalesce(p_search,''))>80 OR length(coalesce(p_city,''))>120
    OR length(coalesce(p_district,''))>120
    OR (p_before IS NULL)<>(p_before_id IS NULL)
    OR (p_status IS NOT NULL AND p_status NOT IN ('draft','published','reserved','sold','rented','archived'))
    OR (p_listing IS NOT NULL AND p_listing NOT IN ('sale','rent'))
    OR (p_type IS NOT NULL AND p_type NOT IN ('house','apartment','land','office','commercial'))
    OR (p_owner IS NOT NULL AND p_ownerless IS TRUE)
    OR (p_from IS NOT NULL AND p_to IS NOT NULL AND p_from>=p_to) THEN
    RAISE EXCEPTION 'Invalid property filter' USING ERRCODE='22023';
  END IF;
  RETURN (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC,x.id DESC),'[]')
    FROM (
      SELECT p.id,p.code,p.slug,p.title,p.status,p.listing_type,p.property_type,
        p.price,p.currency,p.city,p.district,p.owner_id,p.agent_id,p.created_at,
        p.updated_at,p.published_at
      FROM public.properties p
      WHERE (p_id IS NULL OR p.id=p_id)
        AND (p_before IS NULL OR (p.created_at,p.id)<(p_before,p_before_id))
        AND (p_status IS NULL OR p.status=p_status)
        AND (p_listing IS NULL OR p.listing_type=p_listing)
        AND (p_type IS NULL OR p.property_type=p_type)
        AND (p_city IS NULL OR p.city=p_city)
        AND (p_district IS NULL OR p.district=p_district)
        AND (p_owner IS NULL OR p.owner_id=p_owner)
        AND (p_ownerless IS NOT TRUE OR p.owner_id IS NULL)
        AND (p_from IS NULL OR p.created_at>=p_from)
        AND (p_to IS NULL OR p.created_at<p_to)
        AND (coalesce(p_search,'')='' OR strpos(lower(p.title),lower(p_search))>0
          OR strpos(lower(p.slug),lower(p_search))>0
          OR strpos(lower(coalesce(p.code,'')),lower(p_search))>0)
      ORDER BY p.created_at DESC,p.id DESC LIMIT p_limit
    ) x);
END $f$;

-- Public INVOKER wrappers; privileged implementations stay in private.
CREATE FUNCTION public.dashboard_access() RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $f$ SELECT private.is_dashboard_admin() $f$;
CREATE FUNCTION public.admin_dashboard_summary() RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $f$ SELECT private.admin_summary() $f$;
CREATE FUNCTION public.admin_users(
  p_limit integer,p_before timestamptz,p_before_id uuid,p_search text,p_user uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $f$ SELECT private.admin_users(p_limit,p_before,p_before_id,p_search,p_user) $f$;
CREATE FUNCTION public.admin_properties(
  p_limit integer,p_before timestamptz,p_before_id uuid,p_search text,
  p_status text,p_listing text,p_type text,p_city text,p_district text,
  p_owner uuid,p_ownerless boolean,p_from timestamptz,p_to timestamptz,p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $f$ SELECT private.admin_properties(p_limit,p_before,p_before_id,p_search,
  p_status,p_listing,p_type,p_city,p_district,p_owner,p_ownerless,p_from,p_to,p_id) $f$;

-- Only exact object GET/INFO for approved admins; never object list.
CREATE POLICY dashboard_admin_private_image_get ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id='property-images-private'
  AND (storage.allow_only_operation('object.get_authenticated')
    OR storage.allow_only_operation('object.get_authenticated_info'))
  AND (SELECT private.is_dashboard_admin())
  AND EXISTS (
    SELECT 1 FROM public.property_images i JOIN public.properties p ON p.id=i.property_id
    WHERE i.storage_bucket='property-images-private'
      AND i.storage_path=storage.objects.name AND i.public_url IS NULL
      AND p.status IN ('draft','published','reserved','sold','rented','archived')
      AND p.owner_id IS NOT NULL AND storage.objects.owner_id=p.owner_id::text
      AND storage.objects.name ~ (
        '^'||p.owner_id::text||'/'||p.id::text||
        '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](png|jpg|webp)$')
      AND CASE right(storage.objects.name,4)
        WHEN '.png' THEN storage.objects.metadata->>'mimetype'='image/png'
        WHEN '.jpg' THEN storage.objects.metadata->>'mimetype'='image/jpeg'
        WHEN 'webp' THEN storage.objects.metadata->>'mimetype'='image/webp'
        ELSE false END
  )
);

-- Restrict every new callable function explicitly.
REVOKE ALL ON FUNCTION private.admin_summary(),
  private.admin_users(integer,timestamptz,uuid,text,uuid),
  private.admin_properties(integer,timestamptz,uuid,text,text,text,text,text,text,uuid,boolean,timestamptz,timestamptz,uuid),
  public.dashboard_access(),public.admin_dashboard_summary(),
  public.admin_users(integer,timestamptz,uuid,text,uuid),
  public.admin_properties(integer,timestamptz,uuid,text,text,text,text,text,text,uuid,boolean,timestamptz,timestamptz,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.admin_summary(),
  private.admin_users(integer,timestamptz,uuid,text,uuid),
  private.admin_properties(integer,timestamptz,uuid,text,text,text,text,text,text,uuid,boolean,timestamptz,timestamptz,uuid),
  public.dashboard_access(),public.admin_dashboard_summary(),
  public.admin_users(integer,timestamptz,uuid,text,uuid),
  public.admin_properties(integer,timestamptz,uuid,text,text,text,text,text,text,uuid,boolean,timestamptz,timestamptz,uuid)
  TO authenticated;
-- Function/table owner is postgres because of the entry assertion.
-- No members, new owner UPDATE policy, admin mutation RPC, role change or backfill.
NOTIFY pgrst, 'reload schema';
COMMIT;
