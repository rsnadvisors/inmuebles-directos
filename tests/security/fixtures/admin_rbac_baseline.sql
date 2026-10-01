-- TEST ONLY: schema reconstruction from certified read-only catalog metadata.
-- No production rows, credentials or objects. Never apply remotely.
CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE public."profiles" (
"id" uuid NOT NULL,
"full_name" text,
"role" text DEFAULT 'viewer'::text NOT NULL,
"phone" text,
"avatar_url" text,
"created_at" timestamptz DEFAULT now() NOT NULL);
CREATE TABLE public."properties" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"code" text,
"title" text NOT NULL,
"slug" text NOT NULL,
"listing_type" text NOT NULL,
"property_type" text NOT NULL,
"status" text DEFAULT 'draft'::text NOT NULL,
"price" numeric NOT NULL,
"currency" text DEFAULT 'PEN'::text NOT NULL,
"maintenance_fee" numeric,
"area_total_m2" numeric,
"area_built_m2" numeric,
"bedrooms" int4,
"bathrooms" int4,
"parking_spaces" int4,
"floors" int4,
"description" text,
"address" text,
"district" text,
"city" text,
"region" text,
"country" text DEFAULT 'Peru'::text NOT NULL,
"lat" float8 NOT NULL,
"lng" float8 NOT NULL,
"owner_id" uuid,
"agent_id" uuid,
"published_at" timestamptz,
"created_at" timestamptz DEFAULT now() NOT NULL,
"updated_at" timestamptz DEFAULT now() NOT NULL);
CREATE TABLE public."property_images" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"property_id" uuid NOT NULL,
"storage_path" text NOT NULL,
"public_url" text NOT NULL,
"alt_text" text,
"sort_order" int4 DEFAULT 0 NOT NULL,
"is_cover" bool DEFAULT false NOT NULL,
"created_at" timestamptz DEFAULT now() NOT NULL);
CREATE TABLE public."property_features" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"property_id" uuid NOT NULL,
"feature_key" text NOT NULL,
"feature_value" text);
CREATE TABLE public."leads" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"property_id" uuid,
"full_name" text NOT NULL,
"email" text,
"phone" text,
"message" text,
"source" text DEFAULT 'web'::text,
"status" text DEFAULT 'new'::text NOT NULL,
"created_at" timestamptz DEFAULT now() NOT NULL);
CREATE TABLE public."favorites" (
"user_id" uuid NOT NULL,
"property_id" uuid NOT NULL,
"created_at" timestamptz DEFAULT now() NOT NULL);
CREATE TABLE public."property_views" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"property_id" uuid,
"user_id" uuid,
"session_id" text,
"viewed_at" timestamptz DEFAULT now() NOT NULL);
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_role_check" CHECK ((role = ANY (ARRAY['admin'::text, 'agent'::text, 'owner'::text, 'viewer'::text])));
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_pkey" PRIMARY KEY (id);
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."properties" ADD CONSTRAINT "properties_listing_type_check" CHECK ((listing_type = ANY (ARRAY['sale'::text, 'rent'::text])));
ALTER TABLE public."properties" ADD CONSTRAINT "properties_property_type_check" CHECK ((property_type = ANY (ARRAY['house'::text, 'land'::text, 'office'::text, 'apartment'::text, 'commercial'::text])));
ALTER TABLE public."properties" ADD CONSTRAINT "properties_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'reserved'::text, 'sold'::text, 'rented'::text, 'archived'::text])));
ALTER TABLE public."properties" ADD CONSTRAINT "properties_currency_check" CHECK ((currency = ANY (ARRAY['PEN'::text, 'USD'::text])));
ALTER TABLE public."properties" ADD CONSTRAINT "properties_pkey" PRIMARY KEY (id);
ALTER TABLE public."properties" ADD CONSTRAINT "properties_code_key" UNIQUE (code);
ALTER TABLE public."properties" ADD CONSTRAINT "properties_slug_key" UNIQUE (slug);
ALTER TABLE public."properties" ADD CONSTRAINT "properties_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public."properties" ADD CONSTRAINT "properties_agent_id_fkey" FOREIGN KEY (agent_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public."property_images" ADD CONSTRAINT "property_images_pkey" PRIMARY KEY (id);
ALTER TABLE public."property_images" ADD CONSTRAINT "property_images_property_id_fkey" FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE public."property_features" ADD CONSTRAINT "property_features_pkey" PRIMARY KEY (id);
ALTER TABLE public."property_features" ADD CONSTRAINT "property_features_property_id_fkey" FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE public."leads" ADD CONSTRAINT "leads_status_check" CHECK ((status = ANY (ARRAY['new'::text, 'contacted'::text, 'qualified'::text, 'closed'::text])));
ALTER TABLE public."leads" ADD CONSTRAINT "leads_pkey" PRIMARY KEY (id);
ALTER TABLE public."leads" ADD CONSTRAINT "leads_property_id_fkey" FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL;
ALTER TABLE public."favorites" ADD CONSTRAINT "favorites_pkey" PRIMARY KEY (user_id, property_id);
ALTER TABLE public."favorites" ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public."favorites" ADD CONSTRAINT "favorites_property_id_fkey" FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE public."property_views" ADD CONSTRAINT "property_views_pkey" PRIMARY KEY (id);
ALTER TABLE public."property_views" ADD CONSTRAINT "property_views_property_id_fkey" FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL;
ALTER TABLE public."property_views" ADD CONSTRAINT "property_views_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
CREATE INDEX idx_property_features_property ON public.property_features USING btree (property_id);
CREATE INDEX idx_leads_property ON public.leads USING btree (property_id);
CREATE INDEX idx_leads_status_created_at ON public.leads USING btree (status, created_at DESC);
CREATE INDEX idx_favorites_user_created_at ON public.favorites USING btree (user_id, created_at DESC);
CREATE INDEX idx_property_views_property ON public.property_views USING btree (property_id);
CREATE INDEX idx_property_views_property_viewed_at ON public.property_views USING btree (property_id, viewed_at DESC);
CREATE INDEX idx_property_views_user_viewed_at ON public.property_views USING btree (user_id, viewed_at DESC);
CREATE INDEX idx_properties_filters ON public.properties USING btree (status, listing_type, property_type);
CREATE INDEX idx_properties_price ON public.properties USING btree (price);
CREATE INDEX idx_properties_location ON public.properties USING btree (city, district);
CREATE INDEX idx_properties_owner ON public.properties USING btree (owner_id);
CREATE INDEX idx_properties_agent ON public.properties USING btree (agent_id);
CREATE INDEX idx_property_images_property_sort ON public.property_images USING btree (property_id, sort_order);
ALTER TABLE public."profiles" ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public."profiles" TO anon, authenticated, service_role;
ALTER TABLE public."properties" ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public."properties" TO anon, authenticated, service_role;
ALTER TABLE public."property_images" ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public."property_images" TO anon, authenticated, service_role;
ALTER TABLE public."property_features" ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public."property_features" TO anon, authenticated, service_role;
ALTER TABLE public."leads" ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public."leads" TO anon, authenticated, service_role;
ALTER TABLE public."favorites" ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public."favorites" TO anon, authenticated, service_role;
ALTER TABLE public."property_views" ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public."property_views" TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION private.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    'viewer'
  )
  on conflict (id) do nothing;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$function$
;
GRANT EXECUTE ON FUNCTION private."is_admin"() TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION private.is_agent()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('admin', 'agent')
  );
$function$
;
GRANT EXECUTE ON FUNCTION private."is_agent"() TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION private.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;
GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;
CREATE POLICY "agents manage property features" ON public."property_features" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM properties
  WHERE ((properties.id = property_features.property_id) AND ((properties.agent_id = auth.uid()) OR (properties.owner_id = auth.uid()) OR private.is_admin()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM properties
  WHERE ((properties.id = property_features.property_id) AND ((properties.agent_id = auth.uid()) OR (properties.owner_id = auth.uid()) OR private.is_admin())))));
CREATE POLICY "published features are public" ON public."property_features" AS PERMISSIVE FOR SELECT TO "anon","authenticated" USING ((EXISTS ( SELECT 1
   FROM properties
  WHERE ((properties.id = property_features.property_id) AND ((properties.status = 'published'::text) OR private.is_agent())))));
CREATE POLICY "agents read related leads" ON public."leads" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((private.is_agent() AND (EXISTS ( SELECT 1
   FROM properties
  WHERE ((properties.id = leads.property_id) AND ((properties.agent_id = auth.uid()) OR (properties.owner_id = auth.uid()) OR private.is_admin()))))));
CREATE POLICY "agents update related leads" ON public."leads" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((private.is_agent() AND (EXISTS ( SELECT 1
   FROM properties
  WHERE ((properties.id = leads.property_id) AND ((properties.agent_id = auth.uid()) OR (properties.owner_id = auth.uid()) OR private.is_admin())))))) WITH CHECK ((private.is_agent() AND (EXISTS ( SELECT 1
   FROM properties
  WHERE ((properties.id = leads.property_id) AND ((properties.agent_id = auth.uid()) OR (properties.owner_id = auth.uid()) OR private.is_admin()))))));
CREATE POLICY "public can insert leads for published properties" ON public."leads" AS PERMISSIVE FOR INSERT TO "anon","authenticated" WITH CHECK (((property_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM properties
  WHERE ((properties.id = leads.property_id) AND (properties.status = 'published'::text))))));
CREATE POLICY "users manage own favorites" ON public."favorites" AS PERMISSIVE FOR ALL TO "authenticated" USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "agents read property views" ON public."property_views" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((private.is_agent() AND (EXISTS ( SELECT 1
   FROM properties
  WHERE ((properties.id = property_views.property_id) AND ((properties.agent_id = auth.uid()) OR (properties.owner_id = auth.uid()) OR private.is_admin()))))));
CREATE POLICY "public can insert views for published properties" ON public."property_views" AS PERMISSIVE FOR INSERT TO "anon","authenticated" WITH CHECK (((property_id IS NOT NULL) AND ((user_id IS NULL) OR (user_id = auth.uid())) AND (EXISTS ( SELECT 1
   FROM properties
  WHERE ((properties.id = property_views.property_id) AND (properties.status = 'published'::text))))));
CREATE POLICY "agents manage properties" ON public."properties" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((private.is_agent() AND ((agent_id = auth.uid()) OR (owner_id = auth.uid()) OR private.is_admin())));
CREATE POLICY "agents update managed properties" ON public."properties" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((private.is_agent() AND ((agent_id = auth.uid()) OR (owner_id = auth.uid()) OR private.is_admin()))) WITH CHECK ((private.is_agent() AND ((agent_id = auth.uid()) OR (owner_id = auth.uid()) OR private.is_admin())));
CREATE POLICY "published properties are public" ON public."properties" AS PERMISSIVE FOR SELECT TO "anon","authenticated" USING (((status = 'published'::text) OR private.is_agent()));
CREATE POLICY "profiles read own record" ON public."profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((auth.uid() = id) OR private.is_admin()));
CREATE POLICY "profiles update own record" ON public."profiles" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((auth.uid() = id) OR private.is_admin())) WITH CHECK (((auth.uid() = id) OR private.is_admin()));
CREATE POLICY "agents manage property images" ON public."property_images" AS PERMISSIVE FOR ALL TO "authenticated" USING ((private.is_agent() AND (EXISTS ( SELECT 1
   FROM properties p
  WHERE ((p.id = property_images.property_id) AND ((p.agent_id = ( SELECT auth.uid() AS uid)) OR (p.owner_id = ( SELECT auth.uid() AS uid)) OR private.is_admin())))))) WITH CHECK ((private.is_agent() AND (EXISTS ( SELECT 1
   FROM properties p
  WHERE ((p.id = property_images.property_id) AND ((p.agent_id = ( SELECT auth.uid() AS uid)) OR (p.owner_id = ( SELECT auth.uid() AS uid)) OR private.is_admin()))))));
CREATE POLICY "published images are public" ON public."property_images" AS PERMISSIVE FOR SELECT TO "anon","authenticated" USING ((EXISTS ( SELECT 1
   FROM properties
  WHERE ((properties.id = property_images.property_id) AND ((properties.status = 'published'::text) OR private.is_agent())))));
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION private.handle_new_user();
CREATE TRIGGER set_properties_updated_at BEFORE UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

CREATE POLICY "anonymous can publish Piura properties" ON public.properties FOR INSERT TO anon WITH CHECK (status='published');
CREATE POLICY "anonymous can add published property images" ON public.property_images FOR INSERT TO anon WITH CHECK (storage_path LIKE 'public/%');
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('property-images','property-images',true,7340032,array['image/jpeg','image/png','image/webp']::text[]);
create policy "anonymous can upload property images" on storage.objects
  for insert to anon with check (
    bucket_id='property-images' and (storage.foldername(name))[1]='public'
    and lower(metadata->>'mimetype') in ('image/jpeg','image/png','image/webp')
    and coalesce((metadata->>'size')::bigint,0) <= 5242880
  );
create policy "agents upload Piura Habitat images" on storage.objects
  for insert to authenticated with check (
    bucket_id='property-images' and private.is_agent()
    and (storage.foldername(name))[1]=(select auth.uid())::text
  );
-- These two policies exist in the reviewed production baseline. They are
-- intentionally modeled even though the application never uses overwrite.
create policy "property_images_update_own" on storage.objects
  for update to authenticated
  using (bucket_id='property-images' and owner_id=auth.uid()::text)
  with check (bucket_id='property-images' and owner_id=auth.uid()::text);
create policy "property_images_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id='property-images' and owner_id=auth.uid()::text);

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
