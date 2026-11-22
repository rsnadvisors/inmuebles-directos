-- 21/11/2026: el titular pidió mostrar completo el primer nombre largo (p. ej. un nombre comercial de una
-- sola palabra), en lugar de cortarlo a 20 caracteres. Se mantiene el filtro de solo letras y el tope de 60
-- caracteres que también aplica la web. Todo lo demás es igual a 20261121120000.
create or replace function public.listing_publisher_name(p_property_id uuid)
returns text language sql stable security definer set search_path = '' as $fn$
  with n as (
    select regexp_split_to_array(btrim(regexp_replace(pr.full_name, '\s+', ' ', 'g')), ' ') as w
    from public.properties p
    join public.profiles pr on pr.id = p.owner_id
    where p.id = p_property_id
      and p.status = 'published'
      and btrim(coalesce(pr.full_name, '')) <> ''
      -- Solo nombres de personas o comerciales: letras, espacios, apóstrofo, punto o guion.
      and pr.full_name ~ '^[[:alpha:][:space:]''.-]+$'
  )
  select left(initcap(lower(w[1])), 60)
         || case when cardinality(w) > 1 then ' ' || upper(left(w[greatest(2, cardinality(w) - 1)], 1)) || '.' else '' end
  from n;
$fn$;
revoke all on function public.listing_publisher_name(uuid) from public;
grant execute on function public.listing_publisher_name(uuid) to anon, authenticated;
notify pgrst, 'reload schema';
