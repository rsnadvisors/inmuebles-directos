-- E0 and the master ownership migration must already be applied. This file is
-- staged for a separately authorized production rollout; local tests apply it
-- only to a disposable Supabase instance.
begin;

do $preflight$
begin
  if to_regclass('public.properties') is null or to_regclass('public.property_images') is null
      or to_regclass('storage.objects') is null
      or to_regprocedure('public.finalize_own_property_publication(uuid)') is null then
    raise exception 'Private image precondition: master ownership state is missing';
  end if;
  if not exists (select 1 from storage.buckets where id='property-images' and public) then
    raise exception 'Private image precondition: legacy public bucket differs';
  end if;
  if exists (select 1 from storage.buckets where id='property-images-private') then
    raise exception 'Private image precondition: private bucket already exists';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='property_images' and column_name='storage_bucket') then
    raise exception 'Private image precondition: storage_bucket already exists';
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects'
      and policyname='owners upload own property images')
      or not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects'
      and policyname='agents upload managed property images')
      or not exists (select 1 from pg_policies where schemaname='public' and tablename='property_images'
      and policyname='owners add own property images') then
    raise exception 'Private image precondition: master policies differ';
  end if;
end;
$preflight$;

alter table public.property_images
  add column storage_bucket text not null default 'property-images';
alter table public.property_images alter column public_url drop not null;
alter table public.property_images
  add constraint property_images_storage_bucket_check
  check (storage_bucket in ('property-images', 'property-images-private'));
alter table public.property_images
  add constraint property_images_private_url_check
  check (storage_bucket <> 'property-images-private' or public_url is null);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('property-images-private', 'property-images-private', false, 5242880,
        array['image/jpeg','image/png','image/webp']::text[]);

-- EXPAND: retain every existing legacy policy and the original finalization
-- RPC while the old application remains deployed. These permissions already
-- exist in production; the private path below adds no access to that bucket.

create policy "owners upload private draft property images" on storage.objects
  for insert to authenticated with check (
    bucket_id='property-images-private'
    and (storage.foldername(name))[1]=(select auth.uid())::text
    and exists (select 1 from public.properties p
      where p.id::text=(storage.foldername(name))[2]
        and p.owner_id=(select auth.uid()) and p.status='draft' and p.agent_id is null)
    and lower(metadata->>'mimetype') in ('image/jpeg','image/png','image/webp')
  );
-- Agents retain their managed-property upload ability, but a draft can only
-- receive private bytes. Published legacy uploads may continue in the old bucket.
create policy "agents upload private managed property images" on storage.objects
  for insert to authenticated with check (
    private.is_agent()
    and bucket_id='property-images-private' and exists (
             select 1 from public.properties p where p.id::text=(storage.foldername(name))[2]
               and p.status='draft'
               and (p.agent_id=(select auth.uid()) or p.owner_id=(select auth.uid()) or private.is_admin()))
    and (storage.foldername(name))[1]=(select auth.uid())::text
    and lower(metadata->>'mimetype') in ('image/jpeg','image/png','image/webp')
  );
create policy "owners inspect private draft image objects" on storage.objects
  for select to authenticated using (
    bucket_id='property-images-private' and owner_id=(select auth.uid())::text
    and (storage.foldername(name))[1]=(select auth.uid())::text
    and exists (select 1 from public.properties p
      where p.id::text=(storage.foldername(name))[2]
        and p.owner_id=(select auth.uid()) and p.status='draft' and p.agent_id is null)
  );
create policy "owners discard private draft image objects" on storage.objects
  for delete to authenticated using (
    bucket_id='property-images-private' and owner_id=(select auth.uid())::text
    and (storage.foldername(name))[1]=(select auth.uid())::text
    and exists (select 1 from public.properties p
      where p.id::text=(storage.foldername(name))[2]
        and p.owner_id=(select auth.uid()) and p.status='draft' and p.agent_id is null)
  );
-- This policy controls direct Storage downloads as well as the application
-- delivery route. A guessed draft path has no matching published image row.
create policy "published private property images are readable" on storage.objects
  for select to anon, authenticated using (
    bucket_id='property-images-private'
    -- SELECT also powers listing. Permit only an exact authenticated-object
    -- download; anonymous callers must never enumerate the private bucket.
    and storage.allow_only_operation('object.get_authenticated')
    and exists (select 1 from public.property_images i
      join public.properties p on p.id=i.property_id
      where i.storage_bucket='property-images-private' and i.storage_path=name
        and p.status='published'
        and i.storage_path like p.owner_id::text || '/' || p.id::text || '/%'
        and storage.objects.owner_id=p.owner_id::text)
  );

-- A distinct RPC lets new code enforce private images without changing the
-- legacy RPC consumed by the still-running production application.
create function public.finalize_private_property_publication(p_property_id uuid)
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
      i.storage_bucket <> 'property-images-private'
      or i.storage_path not like v_user::text || '/' || p_property_id::text || '/%'
      or i.public_url is not null
      or not exists (select 1 from storage.objects o
        where o.bucket_id='property-images-private' and o.name=i.storage_path
          and o.owner_id=v_user::text
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
revoke all on function public.finalize_private_property_publication(uuid) from public, anon;
grant execute on function public.finalize_private_property_publication(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
