-- Gestión de anuncios por el anunciante · Fase 1 (15/11/2026)
-- El dueño NO recibe permiso UPDATE/DELETE directo sobre public.properties. Todo cambio pasa por
-- funciones SECURITY DEFINER que comprueban titularidad, validan los datos y limitan las transiciones:
--   owner_update_listing      editar datos y precio (no tipo ni operación, no slug, no estado)
--   owner_set_listing_status  vendido / alquilado / reservado / pausar / reactivar
--   owner_begin_listing_deletion + owner_finish_listing_deletion  eliminación en dos fases
--     (entre ambas, la ruta del servidor borra las fotos por la API de Storage con la sesión del dueño).

alter table public.properties add column if not exists owner_paused boolean not null default false;
alter table public.properties add column if not exists is_reserved boolean not null default false;
alter table public.properties add column if not exists deletion_requested_at timestamptz;
comment on column public.properties.owner_paused is 'Archivado por su dueño (puede reactivarlo). Un archivo por moderación debe dejarlo en false.';
comment on column public.properties.is_reserved is 'Anuncio publicado marcado como reservado por su dueño.';
comment on column public.properties.deletion_requested_at is 'Eliminación solicitada por el dueño; oculta el anuncio hasta completar el borrado.';

-- Titularidad: devuelve la fila bloqueada si pertenece al usuario autenticado (no anónimo, sin agente).
create or replace function private.owned_listing(p_id uuid)
returns public.properties language plpgsql security definer set search_path = '' as $fn$
declare r public.properties;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  select * into r from public.properties p where p.id = p_id for update;
  if not found or r.owner_id is distinct from auth.uid() or r.agent_id is not null then
    raise exception 'LISTING_NOT_FOUND' using errcode = 'PT404';
  end if;
  return r;
end $fn$;

create or replace function private.listing_summary(r public.properties)
returns jsonb language sql immutable set search_path = '' as $fn$
  select jsonb_build_object('id', r.id, 'status', r.status, 'is_reserved', r.is_reserved,
    'owner_paused', r.owner_paused, 'deleting', r.deletion_requested_at is not null, 'slug', r.slug);
$fn$;

-- 1) Edición de datos. Reemplaza todos los campos editables (los opcionales llegan como null).
create or replace function public.owner_update_listing(p_id uuid, p_fields jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  r public.properties;
  allowed constant text[] := array['title','description','price','currency','contact_phone','maintenance_fee',
    'area_total_m2','area_built_m2','bedrooms','bathrooms','parking_spaces','floors','address','district','city','region','lat','lng'];
  v_title text; v_description text; v_address text; v_district text; v_city text; v_region text; v_phone text; v_currency text;
  v_price numeric; v_fee numeric; v_total numeric; v_built numeric; v_lat double precision; v_lng double precision;
  v_bed numeric; v_bath numeric; v_park numeric; v_floors numeric;
begin
  r := private.owned_listing(p_id);
  if r.deletion_requested_at is not null or r.status not in ('published','archived','sold','rented')
     or (r.status = 'archived' and not r.owner_paused) then
    raise exception 'LISTING_NOT_EDITABLE' using errcode = 'P0001';
  end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_fields) k where k <> all(allowed))
     or (select count(*) from jsonb_object_keys(p_fields)) <> cardinality(allowed) then
    raise exception 'INVALID_FIELDS' using errcode = '22023';
  end if;
  begin
    v_title := btrim(p_fields->>'title'); v_description := btrim(p_fields->>'description');
    v_address := btrim(p_fields->>'address'); v_district := nullif(btrim(p_fields->>'district'), '');
    v_city := btrim(p_fields->>'city'); v_region := btrim(p_fields->>'region');
    v_phone := p_fields->>'contact_phone'; v_currency := p_fields->>'currency';
    v_price := (p_fields->>'price')::numeric; v_fee := (p_fields->>'maintenance_fee')::numeric;
    v_total := (p_fields->>'area_total_m2')::numeric; v_built := (p_fields->>'area_built_m2')::numeric;
    v_lat := (p_fields->>'lat')::double precision; v_lng := (p_fields->>'lng')::double precision;
    v_bed := (p_fields->>'bedrooms')::numeric; v_bath := (p_fields->>'bathrooms')::numeric;
    v_park := (p_fields->>'parking_spaces')::numeric; v_floors := (p_fields->>'floors')::numeric;
  exception when others then
    raise exception 'INVALID_FIELDS' using errcode = '22023';
  end;
  if v_title is null or length(v_title) not between 1 and 120
    or v_description is null or length(v_description) not between 1 and 3000
    or v_address is null or length(v_address) not between 1 and 250
    or v_city is null or length(v_city) not between 1 and 120
    or v_region is null or length(v_region) not between 1 and 120
    or coalesce(length(v_district) > 120, false)
    or v_phone is null or v_phone !~ '^\+[1-9][0-9]{7,14}$'
    or v_currency is null or v_currency not in ('PEN','USD')
    or v_price is null or v_price <= 0 or v_price > 1000000000
    or v_lat is null or v_lat not between -19 and 1 or v_lng is null or v_lng not between -82 and -68
    or coalesce(v_total < 0 or v_total > 100000000, false)
    or coalesce(v_built < 0 or v_built > 100000000, false)
    or coalesce(v_fee < 0 or v_fee > 1000000000, false)
    or coalesce(v_bed < 0 or v_bed > 1000 or v_bed <> trunc(v_bed), false)
    or coalesce(v_bath < 0 or v_bath > 1000 or v_bath <> trunc(v_bath), false)
    or coalesce(v_park < 0 or v_park > 1000 or v_park <> trunc(v_park), false)
    or coalesce(v_floors < 0 or v_floors > 1000 or v_floors <> trunc(v_floors), false)
    or (r.property_type = 'land' and (v_built is not null or v_bed is not null or v_bath is not null
        or v_park is not null or v_floors is not null or v_fee is not null))
    or (r.property_type in ('office','commercial') and v_bed is not null) then
    raise exception 'INVALID_FIELDS' using errcode = '22023';
  end if;
  update public.properties p set title = v_title, description = v_description, address = v_address, district = v_district,
    city = v_city, region = v_region, contact_phone = v_phone, currency = v_currency, price = v_price,
    maintenance_fee = v_fee, area_total_m2 = v_total, area_built_m2 = v_built, lat = v_lat, lng = v_lng,
    bedrooms = v_bed::integer, bathrooms = v_bath::integer, parking_spaces = v_park::integer, floors = v_floors::integer
  where p.id = p_id returning * into r;
  return private.listing_summary(r);
end $fn$;

-- 2) Estado del anuncio.
create or replace function public.owner_set_listing_status(p_id uuid, p_action text)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare r public.properties;
begin
  r := private.owned_listing(p_id);
  if r.deletion_requested_at is not null then raise exception 'LISTING_NOT_EDITABLE' using errcode = 'P0001'; end if;
  if p_action = 'mark_sold' and r.status = 'published' and r.listing_type = 'sale' then
    update public.properties p set status = 'sold', is_reserved = false where p.id = p_id returning * into r;
  elsif p_action = 'mark_rented' and r.status = 'published' and r.listing_type = 'rent' then
    update public.properties p set status = 'rented', is_reserved = false where p.id = p_id returning * into r;
  elsif p_action = 'reserve' and r.status = 'published' and not r.is_reserved then
    update public.properties p set is_reserved = true where p.id = p_id returning * into r;
  elsif p_action = 'unreserve' and r.status = 'published' and r.is_reserved then
    update public.properties p set is_reserved = false where p.id = p_id returning * into r;
  elsif p_action = 'pause' and r.status = 'published' then
    update public.properties p set status = 'archived', owner_paused = true, is_reserved = false where p.id = p_id returning * into r;
  elsif p_action = 'reactivate' and ((r.status = 'archived' and r.owner_paused) or r.status in ('sold','rented'))
        and r.published_at is not null then
    -- Only listings that were published before; drafts keep using the controlled publication flow.
    update public.properties p set status = 'published', owner_paused = false where p.id = p_id returning * into r;
  else
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  return private.listing_summary(r);
end $fn$;

-- 3) Eliminación en dos fases.
create or replace function public.owner_begin_listing_deletion(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare r public.properties; paths jsonb;
begin
  r := private.owned_listing(p_id);
  if r.status = 'draft' then raise exception 'LISTING_NOT_EDITABLE' using errcode = 'P0001'; end if;
  -- Legacy public-bucket images cannot be removed by the owner: refuse instead of orphaning them
  -- (support deletes those listings manually with the service role).
  if exists (select 1 from public.property_images i where i.property_id = p_id
             and i.storage_bucket is distinct from 'property-images-private') then
    raise exception 'LEGACY_IMAGES' using errcode = 'P0001';
  end if;
  update public.properties p set status = 'archived', owner_paused = false, is_reserved = false,
    deletion_requested_at = coalesce(p.deletion_requested_at, now())
  where p.id = p_id returning * into r;
  select coalesce(jsonb_agg(i.storage_path order by i.sort_order), '[]'::jsonb) into paths
  from public.property_images i where i.property_id = p_id and i.storage_bucket = 'property-images-private';
  return private.listing_summary(r) || jsonb_build_object('paths', paths);
end $fn$;

create or replace function public.owner_finish_listing_deletion(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare r public.properties;
begin
  r := private.owned_listing(p_id);
  if r.deletion_requested_at is null then raise exception 'DELETION_NOT_REQUESTED' using errcode = 'P0001'; end if;
  if exists (select 1 from storage.objects o join public.property_images i
             on o.bucket_id = i.storage_bucket and o.name = i.storage_path
             where i.property_id = p_id and i.storage_bucket = 'property-images-private') then
    raise exception 'IMAGES_REMAIN' using errcode = 'P0001';
  end if;
  -- property_images, property_features y favorites caen en cascada; leads y property_views quedan en null.
  delete from public.properties p where p.id = p_id;
  return jsonb_build_object('id', p_id, 'deleted', true);
end $fn$;

-- Storage: el dueño puede borrar las fotos privadas SOLO de sus anuncios con eliminación solicitada.
drop policy if exists "owners delete images of own listings being deleted" on storage.objects;
create policy "owners delete images of own listings being deleted" on storage.objects for delete to authenticated
using (
  bucket_id = 'property-images-private'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (select 1 from public.properties p
              where p.id::text = (storage.foldername(objects.name))[2]
                and p.owner_id = (select auth.uid()) and p.agent_id is null
                and p.deletion_requested_at is not null)
);

revoke all on function private.owned_listing(uuid) from public, anon, authenticated;
revoke all on function private.listing_summary(public.properties) from public, anon, authenticated;
revoke all on function public.owner_update_listing(uuid, jsonb) from public, anon;
revoke all on function public.owner_set_listing_status(uuid, text) from public, anon;
revoke all on function public.owner_begin_listing_deletion(uuid) from public, anon;
revoke all on function public.owner_finish_listing_deletion(uuid) from public, anon;
grant execute on function public.owner_update_listing(uuid, jsonb) to authenticated;
grant execute on function public.owner_set_listing_status(uuid, text) to authenticated;
grant execute on function public.owner_begin_listing_deletion(uuid) to authenticated;
grant execute on function public.owner_finish_listing_deletion(uuid) to authenticated;
