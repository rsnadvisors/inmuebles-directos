create policy "anonymous can publish Piura properties" on public.properties for insert to anon with check (
  status = 'published'
  and listing_type in ('sale','rent')
  and property_type in ('house','land','office','apartment','commercial')
  and lat between -6 and -4
  and lng between -82 and -79
);
create policy "anonymous can add published property images" on public.property_images for insert to anon with check (
  storage_path like 'public/%'
  and exists (select 1 from public.properties p where p.id = property_id and p.status = 'published')
);
create policy "anonymous can upload property images" on storage.objects for insert to anon with check (
  bucket_id = 'property-images'
  and (storage.foldername(name))[1] = 'public'
  and lower((metadata->>'mimetype')) in ('image/jpeg','image/png','image/webp')
  and coalesce((metadata->>'size')::bigint, 0) <= 5242880
);
