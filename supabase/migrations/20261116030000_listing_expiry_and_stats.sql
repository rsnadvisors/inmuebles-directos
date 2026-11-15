-- Gestión del anunciante · Fase 3 (16/11/2026)
-- A) Vigencia: un anuncio publicado caduca a los 90 días de su publicación o última renovación.
--    Un trabajo diario (GitHub Actions, rol service_role) lo pasa a «pausado por caducidad»; el dueño lo
--    renueva antes o lo vuelve a publicar después.
-- B) Estadísticas agregadas por anuncio y día (visitas, Llamar, WhatsApp). Sin datos personales.

alter table public.properties add column if not exists renewed_at timestamptz;
alter table public.properties add column if not exists expired_at timestamptz;
comment on column public.properties.renewed_at is 'Última renovación por el dueño; la vigencia (90 días) cuenta desde aquí o desde published_at.';
comment on column public.properties.expired_at is 'Fecha en que el trabajo diario lo pausó por caducidad.';

-- Estado del anuncio: añade «renew» y reinicia la vigencia al volver a publicar.
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
  elsif p_action = 'renew' and r.status = 'published' then
    update public.properties p set renewed_at = now() where p.id = p_id returning * into r;
  elsif p_action = 'reactivate' and ((r.status = 'archived' and r.owner_paused) or r.status in ('sold','rented'))
        and r.published_at is not null then
    update public.properties p set status = 'published', owner_paused = false, renewed_at = now(), expired_at = null
      where p.id = p_id returning * into r;
  else
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  return private.listing_summary(r);
end $fn$;

-- Trabajo diario: solo service_role (no lo puede ejecutar ningún usuario).
create or replace function public.expire_stale_listings()
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare n int;
begin
  update public.properties p set status = 'archived', owner_paused = true, is_reserved = false, expired_at = now()
  where p.status = 'published' and p.deletion_requested_at is null and p.agent_id is null
    and coalesce(p.renewed_at, p.published_at) < now() - interval '90 days';
  get diagnostics n = row_count;
  return jsonb_build_object('expired', n, 'at', now());
end $fn$;

-- Contadores diarios agregados: sin usuario, IP ni navegador.
create table if not exists private.listing_event_counts (
  property_id uuid not null references public.properties(id) on delete cascade,
  day date not null,
  kind text not null check (kind in ('view','call','whatsapp')),
  count integer not null default 0 check (count >= 0),
  primary key (property_id, day, kind)
);
alter table private.listing_event_counts enable row level security;
revoke all on private.listing_event_counts from public, anon, authenticated;

-- Registra un evento de un anuncio publicado. No cuenta al propio dueño. Tope de 10 000 por día y tipo.
create or replace function public.record_listing_event(p_id uuid, p_kind text)
returns void language plpgsql security definer set search_path = '' as $fn$
declare v_owner uuid; v_day date := (now() at time zone 'America/Lima')::date;
begin
  if p_kind is null or p_kind not in ('view','call','whatsapp') then return; end if;
  select p.owner_id into v_owner from public.properties p where p.id = p_id and p.status = 'published';
  if not found or v_owner is not distinct from auth.uid() then return; end if;
  insert into private.listing_event_counts as c (property_id, day, kind, count) values (p_id, v_day, p_kind, 1)
  on conflict (property_id, day, kind) do update set count = c.count + 1 where c.count < 10000;
end $fn$;

-- Estadísticas del dueño: totales de sus anuncios en los últimos N días (1 a 365).
create or replace function public.owner_listing_stats(p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $fn$
declare uid uuid := auth.uid(); v_days integer := least(greatest(coalesce(p_days, 30), 1), 365);
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_object_agg(t.property_id, jsonb_build_object('view', t.v, 'call', t.c, 'whatsapp', t.w))
    from (select c.property_id,
            sum(c.count) filter (where c.kind = 'view') v, sum(c.count) filter (where c.kind = 'call') c,
            sum(c.count) filter (where c.kind = 'whatsapp') w
          from private.listing_event_counts c join public.properties p on p.id = c.property_id
          where p.owner_id = uid and c.day > (now() at time zone 'America/Lima')::date - v_days
          group by c.property_id) t), '{}'::jsonb);
end $fn$;

revoke all on function public.expire_stale_listings() from public, anon, authenticated;
grant execute on function public.expire_stale_listings() to service_role;
revoke all on function public.record_listing_event(uuid, text) from public;
grant execute on function public.record_listing_event(uuid, text) to anon, authenticated;
revoke all on function public.owner_listing_stats(integer) from public, anon;
grant execute on function public.owner_listing_stats(integer) to authenticated;

notify pgrst, 'reload schema';
