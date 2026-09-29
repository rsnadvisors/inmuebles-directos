-- CONTRACT: apply only after the private-image application is deployed and
-- verified. Never apply this alongside EXPAND while old publishers run.
begin;

-- Wait for in-flight writes, then keep the draft preflight stable until the
-- restrictive policies and legacy RPC revocation commit together.
lock table public.properties, public.property_images, storage.objects
  in share row exclusive mode;

do $preflight$
begin
  if to_regclass('public.property_images') is null
      or to_regclass('storage.objects') is null
      or to_regprocedure('public.finalize_private_property_publication(uuid)') is null
      or to_regprocedure('public.finalize_own_property_publication(uuid)') is null
      or not exists (select 1 from information_schema.columns where table_schema='public'
        and table_name='property_images' and column_name='storage_bucket')
      or not exists (select 1 from storage.buckets where id='property-images-private' and not public)
      or not exists (select 1 from storage.buckets where id='property-images' and public) then
    raise exception 'Private image contract precondition: expand state is missing';
  end if;
  if (select count(*) from pg_policies where schemaname='storage' and tablename='objects'
      and policyname in ('owners upload own property images',
        'agents upload managed property images',
        'owners inspect unfinished property image objects',
        'owners discard unfinished property image objects',
        'owners upload private draft property images',
        'agents upload private managed property images',
        'owners inspect private draft image objects',
        'owners discard private draft image objects',
        'published private property images are readable')) <> 9
      or not exists (select 1 from pg_policies where schemaname='public'
        and tablename='property_images' and policyname='owners add own property images') then
    raise exception 'Private image contract precondition: policy set differs';
  end if;
  -- The old publisher inserts the draft before uploading its first object.
  -- No persisted field distinguishes that interval from another draft, so
  -- refuse every draft rather than strand an in-flight publication. Human
  -- rollout must also quiesce old publishers before this transaction starts.
  if exists (select 1 from public.properties where status='draft') then
    raise exception 'Private image contract precondition: unsafe legacy drafts exist; Contract cannot proceed until legacy publication is quiesced and drafts are resolved';
  end if;
end;
$preflight$;

drop policy "owners upload own property images" on storage.objects;
drop policy "agents upload managed property images" on storage.objects;
drop policy "owners inspect unfinished property image objects" on storage.objects;
drop policy "owners discard unfinished property image objects" on storage.objects;

-- Existing published public-bucket objects and URLs remain untouched.
create policy "agents upload managed property images" on storage.objects
  for insert to authenticated with check (
    bucket_id='property-images' and private.is_agent()
    and (storage.foldername(name))[1]=(select auth.uid())::text
    and exists (select 1 from public.properties p
      where p.id::text=(storage.foldername(name))[2] and p.status='published'
        and (p.agent_id=(select auth.uid()) or p.owner_id=(select auth.uid()) or private.is_admin()))
    and lower(metadata->>'mimetype') in ('image/jpeg','image/png','image/webp')
  );

drop policy "owners add own property images" on public.property_images;
create policy "owners add own property images" on public.property_images
  for insert to authenticated with check (
    storage_bucket='property-images-private' and public_url is null
    and storage_path like (select auth.uid())::text || '/' || property_id::text || '/%'
    and exists (select 1 from public.properties p where p.id=property_id
      and p.owner_id=(select auth.uid()) and p.status='draft' and p.agent_id is null)
  );
-- The agent ALL policy is permissive, so these restrictions protect all
-- authenticated draft metadata writes, not just the owner policy above.
create policy "draft metadata requires private storage" on public.property_images
  as restrictive for insert to authenticated with check (
    not exists (select 1 from public.properties p where p.id=property_id and p.status='draft')
    or (storage_bucket='property-images-private' and public_url is null
        and storage_path like (select auth.uid())::text || '/' || property_id::text || '/%')
  );
create policy "draft metadata updates stay private" on public.property_images
  as restrictive for update to authenticated using (true) with check (
    not exists (select 1 from public.properties p where p.id=property_id and p.status='draft')
    or (storage_bucket='property-images-private' and public_url is null)
  );

revoke execute on function public.finalize_own_property_publication(uuid) from authenticated;
notify pgrst, 'reload schema';
commit;
