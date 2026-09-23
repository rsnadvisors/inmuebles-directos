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
    where ((schemaname='public' and tablename in ('properties','property_images')) or (schemaname='storage' and tablename='objects'))
      and cmd in ('INSERT','ALL')
      and policyname not in (
        'anonymous can publish Piura properties', 'anonymous can add published property images',
        'anonymous can upload property images', 'agents manage properties',
        'agents manage property images', 'agents upload Piura Habitat images'
      )
  ) then
    raise exception 'Master auth precondition: unreviewed INSERT policy';
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
revoke insert on public.properties, public.property_images from anon;

-- Existing published SELECT remains available to everyone. Owners also see their
-- own future non-public records, but legacy ownerless rows are never claimed.
create policy "owners read own properties" on public.properties
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "owners publish own properties" on public.properties
  for insert to authenticated with check (
    owner_id = (select auth.uid()) and agent_id is null and status = 'published'
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
    and exists (select 1 from public.properties p where p.id=property_id and p.owner_id=(select auth.uid()))
  );

-- Storage owns the bytes. The authenticated owner's path is user/property/file;
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
    )
    and lower(metadata->>'mimetype') in ('image/jpeg','image/png','image/webp')
    and (metadata->>'size') ~ '^[0-9]+$'
    and (metadata->>'size')::bigint between 1 and 5242880
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
    and (metadata->>'size') ~ '^[0-9]+$'
    and (metadata->>'size')::bigint between 1 and 5242880
  );

notify pgrst, 'reload schema';
commit;
