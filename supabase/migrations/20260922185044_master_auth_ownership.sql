-- Follows E0. This migration is intentionally not applied by the application deploy.
-- Preflight current production metadata and backup before a separately authorized rollout.
begin;

do $preflight$
begin
  if to_regclass('public.properties') is null or to_regclass('public.property_images') is null
     or to_regclass('public.profiles') is null or to_regclass('storage.objects') is null then
    raise exception 'Master auth precondition: required tables are missing';
  end if;
  if to_regprocedure('private.guard_profile_system_fields()') is null then
    raise exception 'Master auth precondition: E0 must be applied first';
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='properties' and policyname='anonymous can publish Piura properties')
     or not exists (select 1 from pg_policies where schemaname='public' and tablename='property_images' and policyname='anonymous can add published property images')
     or not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='anonymous can upload property images')
     or not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='agents upload Piura Habitat images' and roles::text[]=array['authenticated']::text[])
     or not exists (select 1 from pg_policies where schemaname='public' and tablename='properties' and policyname='agents manage properties' and roles::text[]=array['authenticated']::text[])
     or not exists (select 1 from pg_policies where schemaname='public' and tablename='property_images' and policyname='agents manage property images') then
    raise exception 'Master auth precondition: expected legacy policies differ';
  end if;
  if exists (
    select 1 from pg_policies
    where ((schemaname='public' and tablename='properties' and policyname not in (
             'anonymous can publish Piura properties', 'published properties are public',
             'agents manage properties', 'agents update managed properties'))
        or (schemaname='public' and tablename='property_images' and policyname not in (
             'anonymous can add published property images', 'published images are public',
             'agents manage property images'))
        or (schemaname='storage' and tablename='objects' and policyname not in (
             'anonymous can upload property images', 'agents upload Piura Habitat images',
             'property_images_update_own', 'property_images_delete_own')))
  ) then
    raise exception 'Master auth precondition: unreviewed policy';
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects'
      and policyname='property_images_update_own' and cmd='UPDATE' and roles::text[]=array['authenticated']::text[]
      and qual='((bucket_id = ''property-images''::text) AND (owner_id = (auth.uid())::text))'
      and with_check='((bucket_id = ''property-images''::text) AND (owner_id = (auth.uid())::text))')
    or not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects'
      and policyname='property_images_delete_own' and cmd='DELETE' and roles::text[]=array['authenticated']::text[]
      and qual='((bucket_id = ''property-images''::text) AND (owner_id = (auth.uid())::text))') then
    raise exception 'Master auth precondition: legacy Storage UPDATE/DELETE policies differ';
  end if;
  if not exists (select 1 from storage.buckets where id='property-images' and public) then
    raise exception 'Master auth precondition: public property-images bucket is missing';
  end if;
end;
$preflight$;

-- Close every previously approved direct anonymous publication route.
drop policy "anonymous can publish Piura properties" on public.properties;
drop policy "anonymous can add published property images" on public.property_images;
drop policy "anonymous can upload property images" on storage.objects;
drop policy "agents upload Piura Habitat images" on storage.objects;
-- These production-only legacy policies were absent from the old test fixture.
-- The new publication API never overwrites or deletes objects; retaining them
-- would allow mutations outside the owner/property INSERT boundary.
drop policy "property_images_update_own" on storage.objects;
drop policy "property_images_delete_own" on storage.objects;
revoke insert on public.properties, public.property_images from anon;

-- Existing published SELECT remains available to everyone. Owners also see their
-- own future non-public records, but legacy ownerless rows are never claimed.
create policy "owners read own properties" on public.properties
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "owners publish own properties" on public.properties
  for insert to authenticated with check (
    owner_id = (select auth.uid()) and agent_id is null and status = 'draft'
  );
create policy "owners discard own unfinished properties" on public.properties
  for delete to authenticated using (
    owner_id = (select auth.uid()) and agent_id is null and status = 'draft'
  );

-- Replace the permissive ALL policy so ordinary owners cannot insert arbitrary
-- image metadata for a property they own through the legacy agent branch.
drop policy "agents manage property images" on public.property_images;
create policy "agents manage property images" on public.property_images
  for all to authenticated
  using (private.is_agent() and exists (
    select 1 from public.properties p where p.id=property_id
      and (p.agent_id=(select auth.uid()) or p.owner_id=(select auth.uid()) or private.is_admin())
  ))
  with check (private.is_agent() and exists (
    select 1 from public.properties p where p.id=property_id
      and (p.agent_id=(select auth.uid()) or p.owner_id=(select auth.uid()) or private.is_admin())
  ));
create policy "owners read own property images" on public.property_images
  for select to authenticated using (exists (
    select 1 from public.properties p where p.id=property_id and p.owner_id=(select auth.uid())
  ));
create policy "owners add own property images" on public.property_images
  for insert to authenticated with check (
    storage_path like (select auth.uid())::text || '/' || property_id::text || '/%'
    and exists (select 1 from public.properties p where p.id=property_id
      and p.owner_id=(select auth.uid()) and p.status='draft' and p.agent_id is null)
  );
create policy "owners discard unfinished property images" on public.property_images
  for delete to authenticated using (exists (
    select 1 from public.properties p where p.id=property_id
      and p.owner_id=(select auth.uid()) and p.status='draft' and p.agent_id is null
  ));

-- Storage owns the bytes and enforces the bucket's MIME and 5 MiB limits.
-- The authenticated owner's path is user/property/file;
-- the property must already belong to that user. Public reads still use the
-- bucket's existing public setting. No overwrite policy is added.
update storage.buckets set file_size_limit=5242880,
  allowed_mime_types=array['image/jpeg','image/png','image/webp']::text[]
where id='property-images';
create policy "owners upload own property images" on storage.objects
  for insert to authenticated with check (
    bucket_id='property-images'
    and (storage.foldername(name))[1]=(select auth.uid())::text
    and exists (
      select 1 from public.properties p
      where p.id::text=(storage.foldername(name))[2] and p.owner_id=(select auth.uid())
        and p.status='draft' and p.agent_id is null
    )
    and lower(metadata->>'mimetype') in ('image/jpeg','image/png','image/webp')
  );
create policy "agents upload managed property images" on storage.objects
  for insert to authenticated with check (
    bucket_id='property-images' and private.is_agent()
    and (storage.foldername(name))[1]=(select auth.uid())::text
    and exists (
      select 1 from public.properties p
      where p.id::text=(storage.foldername(name))[2]
        and (p.agent_id=(select auth.uid()) or p.owner_id=(select auth.uid()) or private.is_admin())
    )
    and lower(metadata->>'mimetype') in ('image/jpeg','image/png','image/webp')
  );
-- Storage removal requires SELECT as well as DELETE. Limit both to objects
-- owned by the caller under a property that is still an unfinished draft.
create policy "owners inspect unfinished property image objects" on storage.objects
  for select to authenticated using (
    bucket_id='property-images' and owner_id=(select auth.uid())::text
    and (storage.foldername(name))[1]=(select auth.uid())::text
    and exists (select 1 from public.properties p
      where p.id::text=(storage.foldername(name))[2]
        and p.owner_id=(select auth.uid()) and p.status='draft' and p.agent_id is null)
  );
create policy "owners discard unfinished property image objects" on storage.objects
  for delete to authenticated using (
    bucket_id='property-images' and owner_id=(select auth.uid())::text
    and (storage.foldername(name))[1]=(select auth.uid())::text
    and exists (select 1 from public.properties p
      where p.id::text=(storage.foldername(name))[2]
        and p.owner_id=(select auth.uid()) and p.status='draft' and p.agent_id is null)
  );

-- The only public transition available to an ordinary owner. Direct REST
-- INSERT/UPDATE cannot publish a row; this function validates the completed
-- property, image metadata and actual Storage objects in one DB transaction.
create function public.finalize_own_property_publication(p_property_id uuid)
returns text language plpgsql security definer set search_path = '' as $finalize$
declare
  v_user uuid := auth.uid();
  v_property public.properties%rowtype;
  v_image_count integer;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into v_property from public.properties where id=p_property_id for update;
  if not found or v_property.owner_id is distinct from v_user or v_property.agent_id is not null
      or v_property.status <> 'draft' then
    raise exception 'Property cannot be finalized' using errcode='42501';
  end if;
  if length(btrim(v_property.title)) not between 1 and 120
      or v_property.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      or length(btrim(coalesce(v_property.description,''))) not between 1 and 3000
      or length(btrim(coalesce(v_property.address,''))) not between 1 and 250
      or length(btrim(coalesce(v_property.city,''))) not between 1 and 120
      or length(btrim(coalesce(v_property.region,''))) not between 1 and 120
      or lower(btrim(v_property.country)) <> 'peru'
      or v_property.price <= 0 or v_property.price > 1000000000
      or v_property.lat not between -19 and 1 or v_property.lng not between -82 and -68
      or v_property.listing_type not in ('sale','rent')
      or v_property.property_type not in ('house','apartment','land','office','commercial')
      or v_property.currency not in ('PEN','USD')
      or coalesce(v_property.area_total_m2 < 0 or v_property.area_total_m2 > 100000000, false)
      or coalesce(v_property.area_built_m2 < 0 or v_property.area_built_m2 > 100000000, false)
      or coalesce(v_property.maintenance_fee < 0 or v_property.maintenance_fee > 1000000000, false)
      or coalesce(v_property.bedrooms < 0 or v_property.bedrooms > 1000, false)
      or coalesce(v_property.bathrooms < 0 or v_property.bathrooms > 1000, false)
      or coalesce(v_property.parking_spaces < 0 or v_property.parking_spaces > 1000, false)
      or coalesce(v_property.floors < 0 or v_property.floors > 1000, false)
      or (v_property.property_type='land' and (v_property.area_built_m2 is not null
        or v_property.bedrooms is not null or v_property.bathrooms is not null
        or v_property.parking_spaces is not null or v_property.floors is not null
        or v_property.maintenance_fee is not null))
      or (v_property.property_type in ('office','commercial') and v_property.bedrooms is not null) then
    raise exception 'Property is not ready for publication' using errcode='23514';
  end if;
  select count(*) into v_image_count from public.property_images where property_id=p_property_id;
  if v_image_count not between 1 and 5 or exists (
    select 1 from public.property_images i
    where i.property_id=p_property_id and (
      i.storage_path not like v_user::text || '/' || p_property_id::text || '/%'
      or i.public_url is null or btrim(i.public_url)=''
      or right(i.public_url, length(i.storage_path)) <> i.storage_path
      or position('/storage/v1/object/public/property-images/' in i.public_url)=0
      or not exists (select 1 from storage.objects o
        where o.bucket_id='property-images' and o.name=i.storage_path and o.owner_id=v_user::text
          and lower(o.metadata->>'mimetype') in ('image/jpeg','image/png','image/webp')
          and (o.metadata->>'size') ~ '^[0-9]+$'
          and (o.metadata->>'size')::bigint between 1 and 5242880)
    )
  ) then
    raise exception 'Property images are not ready' using errcode='23514';
  end if;
  update public.properties set status='published', published_at=now() where id=p_property_id;
  return v_property.slug;
end;
$finalize$;
revoke all on function public.finalize_own_property_publication(uuid) from public, anon;
grant execute on function public.finalize_own_property_publication(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
