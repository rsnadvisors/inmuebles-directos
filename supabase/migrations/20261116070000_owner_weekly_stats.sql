-- Dashboard del anunciante (16/11/2026): visitas, llamadas y WhatsApp por semana de los anuncios propios.
-- Solo lectura, solo los anuncios del usuario; semanas de lunes a domingo (hora de Lima), incluidas las semanas sin datos.
create or replace function public.owner_listing_weekly(p_weeks integer default 8)
returns jsonb language plpgsql stable security definer set search_path = '' as $fn$
declare uid uuid := auth.uid(); v_weeks integer := least(greatest(coalesce(p_weeks, 8), 1), 26);
  v_this_week date := date_trunc('week', (now() at time zone 'America/Lima'))::date;
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object('week', w.week, 'view', coalesce(t.v, 0), 'call', coalesce(t.c, 0), 'whatsapp', coalesce(t.w, 0)) order by w.week), '[]'::jsonb)
    from (select (v_this_week - (g * 7))::date as week from generate_series(0, v_weeks - 1) g) w
    left join (
      select date_trunc('week', c.day)::date as week,
        sum(c.count) filter (where c.kind = 'view') v, sum(c.count) filter (where c.kind = 'call') c,
        sum(c.count) filter (where c.kind = 'whatsapp') w
      from private.listing_event_counts c join public.properties p on p.id = c.property_id
      where p.owner_id = uid and c.day >= v_this_week - ((v_weeks - 1) * 7)
      group by 1
    ) t on t.week = w.week
  );
end $fn$;
revoke all on function public.owner_listing_weekly(integer) from public, anon;
grant execute on function public.owner_listing_weekly(integer) to authenticated;

notify pgrst, 'reload schema';
