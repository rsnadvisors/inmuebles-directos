-- Captura de datos de mercado (16/11/2026) · base del observatorio (propuesta v2).
-- Guarda desde ya lo que no se puede reconstruir después:
--   A) historial de precios de cada anuncio;
--   B) cambios de estado (publicado, pausado, caducado, vendido, alquilado…) para medir «días hasta vender»;
--   C) respuesta del dueño a «¿lo vendiste/alquilaste por Inmuebles Directos?»;
--   D) búsquedas agregadas del mapa (operación, tipo, zona conocida y tamaño del resultado). Sin texto libre,
--      sin usuario, sin IP.
-- Nada de esto se expone directamente: tablas privadas y funciones con permisos acotados.

-- A) Historial de precios ------------------------------------------------------------------------
create table if not exists private.listing_price_history (
  id bigint generated always as identity primary key,
  property_id uuid not null references public.properties(id) on delete cascade,
  price numeric not null,
  currency text not null,
  recorded_at timestamptz not null default now()
);
create index if not exists listing_price_history_property on private.listing_price_history(property_id, recorded_at);

-- B) Cambios de estado ---------------------------------------------------------------------------
create table if not exists private.listing_status_events (
  id bigint generated always as identity primary key,
  property_id uuid not null references public.properties(id) on delete cascade,
  from_state text,
  to_state text not null,
  at timestamptz not null default now()
);
create index if not exists listing_status_events_property on private.listing_status_events(property_id, at);

-- Estado «de negocio»: distingue pausado, caducado, moderado y en eliminación dentro de archived.
create or replace function private.listing_state(p_status text, p_owner_paused boolean, p_expired_at timestamptz, p_deleting timestamptz)
returns text language sql immutable set search_path = '' as $fn$
  select case
    when p_deleting is not null then 'deleting'
    when p_status = 'archived' and p_expired_at is not null and coalesce(p_owner_paused, false) then 'expired'
    when p_status = 'archived' and coalesce(p_owner_paused, false) then 'paused'
    when p_status = 'archived' then 'moderated'
    else p_status end;
$fn$;

create or replace function private.capture_listing_history()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare v_old text; v_new text;
begin
  if tg_op = 'INSERT' or new.price is distinct from old.price or new.currency is distinct from old.currency then
    if new.price is not null and new.currency is not null then
      insert into private.listing_price_history(property_id, price, currency) values (new.id, new.price, new.currency);
    end if;
  end if;
  v_new := private.listing_state(new.status, new.owner_paused, new.expired_at, new.deletion_requested_at);
  v_old := case when tg_op = 'INSERT' then null
                else private.listing_state(old.status, old.owner_paused, old.expired_at, old.deletion_requested_at) end;
  if v_old is distinct from v_new then
    insert into private.listing_status_events(property_id, from_state, to_state) values (new.id, v_old, v_new);
  end if;
  return new;
end $fn$;
revoke all on function private.capture_listing_history() from public, anon, authenticated;

drop trigger if exists zz_capture_listing_history on public.properties;
create trigger zz_capture_listing_history after insert or update on public.properties
  for each row execute function private.capture_listing_history();

-- Punto de partida para los anuncios que ya existen (una sola vez).
insert into private.listing_price_history(property_id, price, currency, recorded_at)
select p.id, p.price, p.currency, coalesce(p.published_at, p.created_at) from public.properties p
where p.price is not null and p.currency is not null
  and not exists (select 1 from private.listing_price_history h where h.property_id = p.id);
insert into private.listing_status_events(property_id, from_state, to_state, at)
select p.id, null, private.listing_state(p.status, p.owner_paused, p.expired_at, p.deletion_requested_at), coalesce(p.published_at, p.created_at)
from public.properties p
where not exists (select 1 from private.listing_status_events e where e.property_id = p.id);

-- C) ¿Se cerró gracias al portal? ------------------------------------------------------------------
alter table public.properties add column if not exists closed_via_portal boolean;
comment on column public.properties.closed_via_portal is 'Respuesta del dueño al cerrar: ¿lo vendió/alquiló gracias a Inmuebles Directos? (null = sin responder).';

create or replace function public.owner_set_close_feedback(p_id uuid, p_via_portal boolean)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare r public.properties;
begin
  r := private.owned_listing(p_id);
  if r.status not in ('sold','rented') or p_via_portal is null then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  update public.properties p set closed_via_portal = p_via_portal where p.id = p_id returning * into r;
  return jsonb_build_object('id', r.id, 'closed_via_portal', r.closed_via_portal);
end $fn$;
revoke all on function public.owner_set_close_feedback(uuid, boolean) from public, anon;
grant execute on function public.owner_set_close_feedback(uuid, boolean) to authenticated;

-- D) Búsquedas agregadas -------------------------------------------------------------------------
create table if not exists private.search_counts (
  day date not null,
  operation text not null check (operation in ('Todo','Comprar','Alquilar')),
  ptype text not null check (ptype in ('Todo','Casas','Departamentos','Terrenos','Oficinas','Locales comerciales')),
  zone text not null check (zone ~ '^[a-z0-9-]{1,40}$'),
  results text not null check (results in ('0','1-5','6-20','21+')),
  count integer not null default 0 check (count >= 0),
  primary key (day, operation, ptype, zone, results)
);
alter table private.search_counts enable row level security;
revoke all on private.search_counts from public, anon, authenticated;

-- Zonas reconocidas de la región Piura. Cualquier otro texto se guarda como «otra»; sin texto, «ninguna».
create or replace function private.search_zone_allowed(p_zone text)
returns boolean language sql immutable set search_path = '' as $fn$
  select p_zone in ('ninguna','otra','piura','castilla','veintiseis-de-octubre','catacaos','cura-mori','el-tallan','la-arena',
    'la-union','las-lomas','tambogrande','sullana','bellavista','ignacio-escudero','marcavelica','querecotillo','salitral',
    'lancones','miguel-checa','paita','colan','vichayal','amotape','talara','parinas','mancora','los-organos','el-alto',
    'lobitos','sechura','bernal','vice','chulucanas','morropon','huancabamba','ayabaca');
$fn$;

-- Abierta a anon (como los contadores de visitas): solo suma un contador de combinaciones válidas, tope diario.
create or replace function public.record_search(p_operation text, p_type text, p_zone text, p_results text)
returns void language plpgsql security definer set search_path = '' as $fn$
declare v_day date := (now() at time zone 'America/Lima')::date;
begin
  if p_operation is null or p_operation not in ('Todo','Comprar','Alquilar')
     or p_type is null or p_type not in ('Todo','Casas','Departamentos','Terrenos','Oficinas','Locales comerciales')
     or p_zone is null or not private.search_zone_allowed(p_zone)
     or p_results is null or p_results not in ('0','1-5','6-20','21+') then
    return;
  end if;
  insert into private.search_counts as c (day, operation, ptype, zone, results, count) values (v_day, p_operation, p_type, p_zone, p_results, 1)
  on conflict (day, operation, ptype, zone, results) do update set count = c.count + 1 where c.count < 5000;
end $fn$;
revoke all on function public.record_search(text, text, text, text) from public;
grant execute on function public.record_search(text, text, text, text) to anon, authenticated;
revoke all on function private.search_zone_allowed(text) from public, anon, authenticated;
revoke all on function private.listing_state(text, boolean, timestamptz, timestamptz) from public, anon, authenticated;

alter table private.listing_price_history enable row level security;
alter table private.listing_status_events enable row level security;
revoke all on private.listing_price_history, private.listing_status_events from public, anon, authenticated;

notify pgrst, 'reload schema';
