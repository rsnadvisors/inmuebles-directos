-- Antispam (15/11/2026)
-- 1) Límite de 5 intentos de publicación nuevos por cuenta en 24 h (incluye cancelados para evitar ciclos).
--    El trigger solo actúa en INSERT: los reintentos del mismo request_id no insertan y no cuentan.
--    publication_prepare ya bloquea la fila de private.publication_quotas del dueño (FOR UPDATE),
--    así que el conteo es serializable por cuenta.
-- 2) Cierra la inserción anónima en leads y property_views (0 filas, el sitio no las usa).

create index if not exists publication_attempts_owner_created
  on private.publication_attempts(owner_id, created_at);

create or replace function private.publication_daily_limit()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  if (select count(*) from private.publication_attempts a
      where a.owner_id = new.owner_id and a.created_at > now() - interval '24 hours') >= 5 then
    raise exception 'PUBLICATION_DAILY_LIMIT' using errcode = 'P0001';
  end if;
  return new;
end $fn$;
revoke all on function private.publication_daily_limit() from public, anon, authenticated;

drop trigger if exists publication_daily_limit on private.publication_attempts;
create trigger publication_daily_limit before insert on private.publication_attempts
  for each row execute function private.publication_daily_limit();

drop policy if exists "public can insert leads for published properties" on public.leads;
drop policy if exists "public can insert views for published properties" on public.property_views;
revoke insert on public.leads, public.property_views from anon, authenticated;
revoke all on public.leads, public.property_views from anon;
