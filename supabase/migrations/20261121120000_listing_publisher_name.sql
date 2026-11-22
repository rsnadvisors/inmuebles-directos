-- Ficha pública (21/11/2026): nombre del anunciante en la sección «Publicación».
-- public.profiles sigue cerrada para visitantes (solo cada dueño lee su fila). Esta función devuelve
-- únicamente una forma abreviada del nombre —primer nombre + inicial del primer apellido, p. ej. «Ricardo S.»—
-- y solo para anuncios publicados. El nombre completo, el teléfono del perfil y el rol nunca salen de la base.
-- Autorizado por el titular el 21/11/2026 (Política de Privacidad, sección 4, actualizada en el mismo cambio).
create or replace function public.listing_publisher_name(p_property_id uuid)
returns text language sql stable security definer set search_path = '' as $fn$
  with n as (
    select regexp_split_to_array(btrim(regexp_replace(pr.full_name, '\s+', ' ', 'g')), ' ') as w
    from public.properties p
    join public.profiles pr on pr.id = p.owner_id
    where p.id = p_property_id
      and p.status = 'published'
      and btrim(coalesce(pr.full_name, '')) <> ''
      -- Solo nombres de personas: letras, espacios, apóstrofo, punto o guion. Correos, apodos con cifras o
      -- símbolos no se publican (la ficha muestra «Anunciante»).
      and pr.full_name ~ '^[[:alpha:][:space:]''.-]+$'
  )
  -- Con 3 o más palabras, el primer apellido suele ser la penúltima («Ricardo Vicente Sancarranco Navarrete» → S.).
  select left(initcap(lower(w[1])), 20)
         || case when cardinality(w) > 1 then ' ' || upper(left(w[greatest(2, cardinality(w) - 1)], 1)) || '.' else '' end
  from n;
$fn$;
revoke all on function public.listing_publisher_name(uuid) from public;
grant execute on function public.listing_publisher_name(uuid) to anon, authenticated;
comment on function public.listing_publisher_name(uuid) is 'Nombre abreviado (Nombre I.) del anunciante de un anuncio publicado; null en cualquier otro caso.';
notify pgrst, 'reload schema';
