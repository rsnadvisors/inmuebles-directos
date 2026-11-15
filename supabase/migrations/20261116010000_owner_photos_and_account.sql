-- Gestión del anunciante · Fase 2 (16/11/2026)
-- A) Fotos de anuncios ya publicados: añadir (subida admitida por fila pendiente), quitar, portada y orden.
-- B) Baja de cuenta (derecho de cancelación, Ley N.º 29733) cuando ya no quedan anuncios ni fotos.
-- Igual que en la fase 1: sin permisos directos nuevos sobre tablas; todo por funciones SECURITY DEFINER.

create table if not exists private.listing_image_uploads (
  image_id uuid primary key,
  property_id uuid not null,
  owner_id uuid not null,
  storage_path text not null unique,
  mime text not null check (mime in ('image/jpeg','image/png','image/webp')),
  size bigint not null check (size between 1 and 5242880),
  state text not null default 'PENDING' check (state in ('PENDING','DONE','REJECTED')),
  created_at timestamptz not null default now()
);
create index if not exists listing_image_uploads_owner_created on private.listing_image_uploads(owner_id, created_at);
create table if not exists private.listing_image_removals (
  storage_path text primary key,
  owner_id uuid not null,
  property_id uuid not null,
  created_at timestamptz not null default now()
);
alter table private.listing_image_uploads enable row level security;
alter table private.listing_image_removals enable row level security;
revoke all on private.listing_image_uploads, private.listing_image_removals from public, anon, authenticated;

-- Estados en los que el dueño puede gestionar fotos (los mismos en que puede editar).
create or replace function private.listing_photos_editable(r public.properties)
returns boolean language sql immutable set search_path = '' as $fn$
  select r.deletion_requested_at is null and r.agent_id is null
    and (r.status in ('published','sold','rented') or (r.status = 'archived' and r.owner_paused));
$fn$;

-- Admisión de Storage: solo la ruta exacta de una subida pendiente, reciente, del propio dueño y con su tipo.
create or replace function private.listing_image_admission(p_bucket text, p_path text, p_mime text)
returns boolean language sql stable security definer set search_path = '' as $fn$
  select auth.uid() is not null and p_bucket = 'property-images-private' and exists (
    select 1 from private.listing_image_uploads u join public.properties p on p.id = u.property_id
    where u.storage_path = p_path and u.owner_id = auth.uid() and u.state = 'PENDING'
      and u.created_at > now() - interval '15 minutes' and lower(coalesce(p_mime, '')) = u.mime
      and p.owner_id = auth.uid() and private.listing_photos_editable(p));
$fn$;

-- Objetos que el dueño puede borrar: fotos quitadas o subidas que no llegaron a completarse.
create or replace function private.listing_image_disposable(p_bucket text, p_path text)
returns boolean language sql stable security definer set search_path = '' as $fn$
  select auth.uid() is not null and p_bucket = 'property-images-private' and (
    exists (select 1 from private.listing_image_removals x where x.storage_path = p_path and x.owner_id = auth.uid())
    or exists (select 1 from private.listing_image_uploads u where u.storage_path = p_path and u.owner_id = auth.uid()
               and (u.state = 'REJECTED' or (u.state = 'PENDING' and u.created_at <= now() - interval '15 minutes'))));
$fn$;

alter policy "publication exact private slot admission" on storage.objects
  with check ((bucket_id <> 'property-images-private') or private.publication_slot_admission(bucket_id, name)
    or private.listing_image_admission(bucket_id, name, metadata->>'mimetype'));
drop policy if exists "owners upload pending listing images" on storage.objects;
create policy "owners upload pending listing images" on storage.objects for insert to authenticated
  with check (private.listing_image_admission(bucket_id, name, metadata->>'mimetype'));
drop policy if exists "owners delete disposable listing images" on storage.objects;
create policy "owners delete disposable listing images" on storage.objects for delete to authenticated
  using (private.listing_image_disposable(bucket_id, name));
-- El dueño ve sus propias fotos en cualquier estado del anuncio (vista previa de pausados/vendidos y
-- comprobación de borrados). No da acceso a fotos de otros.
drop policy if exists "owners read own listing images" on storage.objects;
create policy "owners read own listing images" on storage.objects for select to authenticated
using (
  bucket_id = 'property-images-private'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (select 1 from public.properties p where p.id::text = (storage.foldername(objects.name))[2]
              and p.owner_id = (select auth.uid()) and p.agent_id is null)
);

create or replace function private.renumber_listing_images(p_id uuid)
returns void language sql security definer set search_path = '' as $fn$
  update public.property_images i set sort_order = o.n - 1, is_cover = (o.n = 1)
  from (select id, row_number() over (order by sort_order, id) n from public.property_images where property_id = p_id) o
  where i.id = o.id;
$fn$;

-- A1) Reservar una foto nueva. Máximo 5 por anuncio y 40 subidas por cuenta cada 24 h.
create or replace function public.owner_begin_image_upload(p_id uuid, p_mime text, p_size bigint)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare r public.properties; v_image uuid := gen_random_uuid(); v_path text; v_ext text;
begin
  r := private.owned_listing(p_id);
  if not private.listing_photos_editable(r) then raise exception 'LISTING_NOT_EDITABLE' using errcode = 'P0001'; end if;
  v_ext := case p_mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' end;
  if v_ext is null or p_size is null or p_size not between 1 and 5242880 then
    raise exception 'INVALID_IMAGE' using errcode = '22023';
  end if;
  if (select count(*) from public.property_images i where i.property_id = p_id)
     + (select count(*) from private.listing_image_uploads u where u.property_id = p_id and u.state = 'PENDING'
        and u.created_at > now() - interval '15 minutes') >= 5 then
    raise exception 'TOO_MANY_IMAGES' using errcode = 'P0001';
  end if;
  if (select count(*) from private.listing_image_uploads u where u.owner_id = r.owner_id
      and u.created_at > now() - interval '24 hours') >= 40 then
    raise exception 'UPLOAD_DAILY_LIMIT' using errcode = 'P0001';
  end if;
  v_path := r.owner_id::text || '/' || p_id::text || '/' || v_image::text || '.' || v_ext;
  insert into private.listing_image_uploads(image_id, property_id, owner_id, storage_path, mime, size)
    values (v_image, p_id, r.owner_id, v_path, p_mime, p_size);
  return jsonb_build_object('image_id', v_image, 'path', v_path);
end $fn$;

-- A2) Confirmar la subida: el objeto existe con el tamaño y tipo reservados.
create or replace function public.owner_finish_image_upload(p_id uuid, p_image_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare r public.properties; u private.listing_image_uploads; o storage.objects; v_next int;
begin
  r := private.owned_listing(p_id);
  select * into u from private.listing_image_uploads x where x.image_id = p_image_id and x.property_id = p_id
    and x.owner_id = auth.uid() for update;
  if not found or u.state <> 'PENDING' then raise exception 'UPLOAD_NOT_FOUND' using errcode = 'P0001'; end if;
  select * into o from storage.objects s where s.bucket_id = 'property-images-private' and s.name = u.storage_path;
  if not found or o.owner_id is distinct from auth.uid()::text
     or (o.metadata->>'size')::bigint is distinct from u.size or lower(o.metadata->>'mimetype') is distinct from u.mime
     or not private.listing_photos_editable(r)
     or (select count(*) from public.property_images i where i.property_id = p_id) >= 5 then
    update private.listing_image_uploads x set state = 'REJECTED' where x.image_id = u.image_id;
    return jsonb_build_object('accepted', false, 'path', u.storage_path);
  end if;
  select coalesce(max(i.sort_order) + 1, 0) into v_next from public.property_images i where i.property_id = p_id;
  insert into public.property_images(id, property_id, storage_bucket, storage_path, public_url, sort_order, is_cover)
    values (u.image_id, p_id, 'property-images-private', u.storage_path, null, v_next, v_next = 0);
  update private.listing_image_uploads x set state = 'DONE' where x.image_id = u.image_id;
  return jsonb_build_object('accepted', true, 'image_id', u.image_id);
end $fn$;

-- A3) Quitar una foto (siempre queda al menos una). El objeto lo borra después la ruta.
create or replace function public.owner_remove_listing_image(p_id uuid, p_image_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare r public.properties; i public.property_images;
begin
  r := private.owned_listing(p_id);
  if not private.listing_photos_editable(r) then raise exception 'LISTING_NOT_EDITABLE' using errcode = 'P0001'; end if;
  select * into i from public.property_images x where x.id = p_image_id and x.property_id = p_id for update;
  if not found then raise exception 'IMAGE_NOT_FOUND' using errcode = 'P0001'; end if;
  if i.storage_bucket is distinct from 'property-images-private' then raise exception 'LEGACY_IMAGES' using errcode = 'P0001'; end if;
  if (select count(*) from public.property_images x where x.property_id = p_id) <= 1 then
    raise exception 'LAST_IMAGE' using errcode = 'P0001';
  end if;
  insert into private.listing_image_removals(storage_path, owner_id, property_id) values (i.storage_path, r.owner_id, p_id)
    on conflict (storage_path) do nothing;
  delete from public.property_images x where x.id = p_image_id;
  perform private.renumber_listing_images(p_id);
  return jsonb_build_object('removed', true, 'path', i.storage_path);
end $fn$;

-- A4) Orden y portada: recibe todos los ids del anuncio; el primero es la portada.
create or replace function public.owner_set_image_order(p_id uuid, p_order uuid[])
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare r public.properties;
begin
  r := private.owned_listing(p_id);
  if not private.listing_photos_editable(r) then raise exception 'LISTING_NOT_EDITABLE' using errcode = 'P0001'; end if;
  if p_order is null or cardinality(p_order) <> (select count(*) from public.property_images i where i.property_id = p_id)
     or cardinality(p_order) <> (select count(distinct x) from unnest(p_order) x)
     or exists (select 1 from unnest(p_order) x where not exists
                (select 1 from public.property_images i where i.id = x and i.property_id = p_id)) then
    raise exception 'INVALID_ORDER' using errcode = '22023';
  end if;
  update public.property_images i set sort_order = o.ord - 1, is_cover = (o.ord = 1)
  from unnest(p_order) with ordinality as o(id, ord) where i.id = o.id and i.property_id = p_id;
  return jsonb_build_object('ordered', true);
end $fn$;

-- A5) Limpieza: olvida lo ya borrado y devuelve las rutas pendientes de borrar en Storage.
create or replace function public.owner_pending_image_cleanup()
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare uid uuid := auth.uid(); paths jsonb;
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  delete from private.listing_image_removals x where x.owner_id = uid
    and not exists (select 1 from storage.objects o where o.bucket_id = 'property-images-private' and o.name = x.storage_path);
  delete from private.listing_image_uploads u where u.owner_id = uid and u.state <> 'DONE'
    and (u.state = 'REJECTED' or u.created_at <= now() - interval '15 minutes')
    and not exists (select 1 from storage.objects o where o.bucket_id = 'property-images-private' and o.name = u.storage_path)
    and u.created_at <= now() - interval '24 hours';
  select coalesce(jsonb_agg(p), '[]'::jsonb) into paths from (
    select x.storage_path p from private.listing_image_removals x where x.owner_id = uid
    union
    select u.storage_path from private.listing_image_uploads u where u.owner_id = uid
      and (u.state = 'REJECTED' or (u.state = 'PENDING' and u.created_at <= now() - interval '15 minutes'))
      and exists (select 1 from storage.objects o where o.bucket_id = 'property-images-private' and o.name = u.storage_path)
  ) z;
  return jsonb_build_object('paths', paths);
end $fn$;

-- B) Baja de cuenta. La ruta elimina antes cada anuncio (fase 1) y las fotos pendientes.
create or replace function public.owner_delete_account()
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare uid uuid := auth.uid();
begin
  if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if exists (select 1 from private.dashboard_admins a where a.user_id = uid) then
    raise exception 'ADMIN_ACCOUNT' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.properties p where p.owner_id = uid or p.agent_id = uid) then
    raise exception 'LISTINGS_REMAIN' using errcode = 'P0001';
  end if;
  if exists (select 1 from private.publication_attempts a where a.owner_id = uid and a.state in ('ACTIVE','CANCEL_PENDING')) then
    raise exception 'PUBLICATION_PENDING' using errcode = 'P0001';
  end if;
  if exists (select 1 from storage.objects o where o.bucket_id in ('property-images-private','property-images')
             and (storage.foldername(o.name))[1] = uid::text) then
    raise exception 'IMAGES_REMAIN' using errcode = 'P0001';
  end if;
  delete from private.listing_image_uploads where owner_id = uid;
  delete from private.listing_image_removals where owner_id = uid;
  delete from private.publication_slots where owner_id = uid;
  delete from private.publication_attempts where owner_id = uid;
  delete from private.publication_quotas where owner_id = uid;
  -- profiles y favorites caen en cascada; property_views.user_id queda en null.
  delete from auth.users where id = uid;
  return jsonb_build_object('deleted', true);
end $fn$;

revoke all on function private.listing_photos_editable(public.properties) from public, anon, authenticated;
revoke all on function private.renumber_listing_images(uuid) from public, anon, authenticated;
revoke all on function private.listing_image_admission(text, text, text) from public, anon;
revoke all on function private.listing_image_disposable(text, text) from public, anon;
-- Las políticas de Storage evalúan estas dos funciones con el rol del usuario.
grant execute on function private.listing_image_admission(text, text, text) to authenticated;
grant execute on function private.listing_image_disposable(text, text) to authenticated;
revoke all on function public.owner_begin_image_upload(uuid, text, bigint) from public, anon;
revoke all on function public.owner_finish_image_upload(uuid, uuid) from public, anon;
revoke all on function public.owner_remove_listing_image(uuid, uuid) from public, anon;
revoke all on function public.owner_set_image_order(uuid, uuid[]) from public, anon;
revoke all on function public.owner_pending_image_cleanup() from public, anon;
revoke all on function public.owner_delete_account() from public, anon;
grant execute on function public.owner_begin_image_upload(uuid, text, bigint) to authenticated;
grant execute on function public.owner_finish_image_upload(uuid, uuid) to authenticated;
grant execute on function public.owner_remove_listing_image(uuid, uuid) to authenticated;
grant execute on function public.owner_set_image_order(uuid, uuid[]) to authenticated;
grant execute on function public.owner_pending_image_cleanup() to authenticated;
grant execute on function public.owner_delete_account() to authenticated;
