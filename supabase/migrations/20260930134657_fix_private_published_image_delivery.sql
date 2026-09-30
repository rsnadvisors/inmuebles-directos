-- The managed delivery path checks authenticated object-info before returning
-- private bytes. Phase A allowed only object.get_authenticated, causing
-- NoSuchKey for an existing published object. Neither operation is listing.
begin;

do $preflight$
begin
  if not exists (select 1 from storage.buckets
                 where id = 'property-images-private' and public = false)
      or not exists (select 1 from pg_policies
                     where schemaname = 'storage' and tablename = 'objects'
                       and policyname = 'published private property images are readable') then
    raise exception 'Private published image delivery precondition failed';
  end if;
end;
$preflight$;

drop policy "published private property images are readable" on storage.objects;
create policy "published private property images are readable" on storage.objects
  for select to anon, authenticated using (
    bucket_id = 'property-images-private'
    and (
      storage.allow_only_operation('object.get_authenticated')
      or storage.allow_only_operation('object.get_authenticated_info')
    )
    and exists (select 1 from public.property_images i
      join public.properties p on p.id = i.property_id
      where i.storage_bucket = 'property-images-private' and i.storage_path = name
        and p.status = 'published'
        and i.storage_path like p.owner_id::text || '/' || p.id::text || '/%'
        and storage.objects.owner_id = p.owner_id::text)
  );

commit;
