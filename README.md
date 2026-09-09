# inmuebles-directos
Portal inmobiliario con mapa interactivo inspirado en Geo Propiedades Ecuador.
# Inmuebles Directos

## Variables de entorno

Configura en Railway `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` con la URL y clave publicable del proyecto Supabase. La tabla `properties` debe exponer `title`, `property_type`, `operation`, `price`, `description`, `address`, `latitude`, `longitude` y `status`; el cliente solo consulta filas con `status = 'published'`.

La ruta `/publicar` valida coordenadas dentro de Piura, exige entre 1 y 5 imágenes JPG/PNG/WebP de hasta 5 MB y registra la propiedad. El mapa escucha cambios Realtime de `properties` para actualizar sus marcadores.
