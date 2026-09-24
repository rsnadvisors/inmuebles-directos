-- TEST FIXTURE ONLY. Synthetic reconstruction of the reviewed pre-master
-- property, image and Storage policy surface. Never apply to production.
create table public.properties (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  listing_type text not null check (listing_type in ('sale','rent')),
  property_type text not null check (property_type in ('house','apartment','land','office','commercial')),
  status text not null default 'draft' check (status in ('draft','published','reserved','sold','rented','archived')),
  price numeric not null,
  currency text not null default 'PEN',
  description text,
  address text,
  city text,
  region text,
  country text not null default 'Peru',
  area_total_m2 numeric,
  area_built_m2 numeric,
  maintenance_fee numeric,
  bedrooms integer,
  bathrooms integer,
  parking_spaces integer,
  floors integer,
  lat double precision not null,
  lng double precision not null,
  owner_id uuid references public.profiles(id),
  agent_id uuid references public.profiles(id),
  published_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.property_images (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  storage_path text not null,
  public_url text not null,
  sort_order integer,
  is_cover boolean not null default false
);
alter table public.properties enable row level security;
alter table public.property_images enable row level security;
grant all on public.properties, public.property_images to anon, authenticated, service_role;

create policy "published properties are public" on public.properties
  for select to anon, authenticated using (status='published' or private.is_agent());
create policy "anonymous can publish Piura properties" on public.properties
  for insert to anon with check (
    status='published' and listing_type in ('sale','rent')
    and property_type in ('house','apartment','land','office','commercial')
    and lat between -6 and -4 and lng between -82 and -79
  );
create policy "agents manage properties" on public.properties
  for insert to authenticated with check (
    private.is_agent() and (agent_id=auth.uid() or owner_id=auth.uid() or private.is_admin())
  );
create policy "agents update managed properties" on public.properties
  for update to authenticated using (
    private.is_agent() and (agent_id=auth.uid() or owner_id=auth.uid() or private.is_admin())
  ) with check (
    private.is_agent() and (agent_id=auth.uid() or owner_id=auth.uid() or private.is_admin())
  );

create policy "published images are public" on public.property_images
  for select to anon, authenticated using (exists (
    select 1 from public.properties p where p.id=property_id and (p.status='published' or private.is_agent())
  ));
create policy "anonymous can add published property images" on public.property_images
  for insert to anon with check (storage_path like 'public/%' and exists (
    select 1 from public.properties p where p.id=property_id and p.status='published'
  ));
create policy "agents manage property images" on public.property_images
  for all to authenticated using (exists (
    select 1 from public.properties p where p.id=property_id
      and (p.agent_id=auth.uid() or p.owner_id=auth.uid() or private.is_admin())
  )) with check (exists (
    select 1 from public.properties p where p.id=property_id
      and (p.agent_id=auth.uid() or p.owner_id=auth.uid() or private.is_admin())
  ));

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
