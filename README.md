# inmuebles-directos
Portal inmobiliario con mapa interactivo inspirado en Geo Propiedades Ecuador.
# Inmuebles Directos

## Variables de entorno

Configura en Railway `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` con la URL y clave publicable del proyecto Supabase. Home consulta `properties` con `status = 'published'`: utiliza `listing_type`, `property_type`, `price`, `currency`, `lat`, `lng` y los campos descriptivos, junto a `property_images(public_url,sort_order,is_cover)`. El contrato y sus limitaciones están documentados en [PR-1 Inventory](docs/PR1_INVENTORY.md).

La ruta `/publicar` valida coordenadas dentro de Piura, exige entre 1 y 5 imágenes JPG/PNG/WebP de hasta 5 MB y registra la propiedad. El cliente conserva la suscripción a cambios Realtime de `properties`; la entrega de eventos depende de la configuración DB y no queda certificada por los mocks.
