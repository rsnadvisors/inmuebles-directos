-- Ciclo de vida de la URL de un anuncio (22/11/2026). Autorizado por el titular.
-- Antes, todo anuncio no publicado (vendido, alquilado, pausado, caducado, moderado o borrado) respondía 404,
-- y al borrarlo no quedaba rastro de su zona. Ahora la ficha distingue tres casos:
--   1) vendido / alquilado (hasta 6 meses) → ficha de cierre, sin fotos, precio ni contacto;
--   2) pausado, caducado, moderado o en eliminación → «no disponible por ahora», sin datos del anuncio;
--   3) eliminado (o cerrado hace más de 6 meses) → redirección 301 a su página de zona.
-- Para el caso 3 se guarda una «lápida» mínima al borrar: slug, operación, tipo y ciudad. Sin dueño, sin
-- teléfono, sin fotos ni texto libre.

create table if not exists private.listing_tombstones (
  slug text primary key,
  listing_type text,
  property_type text,
  city text,
  region text,
  removed_at timestamptz not null default now()
);
alter table private.listing_tombstones enable row level security;
revoke all on private.listing_tombstones from public, anon, authenticated;
comment on table private.listing_tombstones is 'Rastro mínimo de anuncios borrados que llegaron a publicarse, para redirigir su URL a la zona (301).';

-- Antes de borrar un anuncio que llegó a publicarse, deja su lápida. Los borradores nunca publicados no dejan
-- nada: su URL nunca fue pública y debe seguir respondiendo 404.
create or replace function private.record_listing_tombstone()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  if old.slug is not null and old.published_at is not null then
    insert into private.listing_tombstones(slug, listing_type, property_type, city, region)
    values (old.slug, old.listing_type, old.property_type, nullif(btrim(old.city), ''), nullif(btrim(old.region), ''))
    on conflict (slug) do update set listing_type = excluded.listing_type, property_type = excluded.property_type,
      city = excluded.city, region = excluded.region, removed_at = now();
  end if;
  return old;
end $fn$;
revoke all on function private.record_listing_tombstone() from public, anon, authenticated;
drop trigger if exists record_listing_tombstone on public.properties;
create trigger record_listing_tombstone before delete on public.properties
  for each row execute function private.record_listing_tombstone();

-- Estado público de una URL que ya no muestra un anuncio publicado. Devuelve solo lo imprescindible para la
-- página de cierre o la redirección; null si el anuncio está publicado, nunca se publicó o no existió.
create or replace function public.listing_public_state(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $fn$
declare
  r public.properties;
  t private.listing_tombstones;
  v_closed_at timestamptz;
begin
  if p_slug is null or length(p_slug) > 200 then return null; end if;
  select * into r from public.properties p where p.slug = p_slug;
  if found then
    if r.status = 'published' or r.published_at is null then return null; end if;
    if r.status in ('sold', 'rented') and r.deletion_requested_at is null then
      select max(e.at) into v_closed_at from private.listing_status_events e where e.property_id = r.id and e.to_state = r.status;
      v_closed_at := coalesce(v_closed_at, r.updated_at, r.published_at);
      if v_closed_at >= now() - interval '6 months' then
        return jsonb_build_object('state', r.status, 'title', r.title, 'listing_type', r.listing_type,
          'property_type', r.property_type, 'district', r.district, 'city', r.city, 'region', r.region, 'closed_at', v_closed_at);
      end if;
      -- Cerrado hace más de 6 meses: se trata como retirado (redirección a la zona).
      return jsonb_build_object('state', 'removed', 'listing_type', r.listing_type, 'property_type', r.property_type,
        'city', r.city, 'region', r.region);
    end if;
    -- Pausado, caducado, moderado o en eliminación: solo lo necesario para sugerir la zona.
    return jsonb_build_object('state', 'unavailable', 'listing_type', r.listing_type, 'property_type', r.property_type,
      'city', r.city, 'region', r.region);
  end if;
  select * into t from private.listing_tombstones s where s.slug = p_slug;
  if found then
    return jsonb_build_object('state', 'removed', 'listing_type', t.listing_type, 'property_type', t.property_type,
      'city', t.city, 'region', t.region);
  end if;
  return null;
end $fn$;
revoke all on function public.listing_public_state(text) from public;
grant execute on function public.listing_public_state(text) to anon, authenticated;
comment on function public.listing_public_state(text) is 'Estado público (sold/rented/unavailable/removed) de una URL de anuncio no publicado; sin datos personales.';

notify pgrst, 'reload schema';
