import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PRIVATE_PROPERTY_IMAGE_BUCKET, privateImageMime, validImageId } from "./property-image-source";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export { PRIVATE_PROPERTY_IMAGE_BUCKET, validImageId } from "./property-image-source";

export function anonymousImageClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

export async function loadPublishedPrivateImage(client: SupabaseClient, imageId: string): Promise<Blob | null> {
  if (!validImageId(imageId)) return null;
  const image = await client.from("property_images").select("id,property_id,storage_bucket,storage_path")
    .eq("id", imageId).eq("storage_bucket", PRIVATE_PROPERTY_IMAGE_BUCKET).maybeSingle();
  if (image.error) throw new Error("Image metadata unavailable");
  if (!image.data) return null;
  const property = await client.from("properties").select("id,owner_id,status").eq("id", image.data.property_id)
    .eq("status", "published").maybeSingle();
  if (property.error) throw new Error("Property status unavailable");
  if (!property.data) return null;
  const expectedMime = privateImageMime(image.data, property.data);
  if (!expectedMime) return null;
  const downloaded = await client.storage.from(PRIVATE_PROPERTY_IMAGE_BUCKET).download(image.data.storage_path);
  if (downloaded.error || !downloaded.data || !IMAGE_TYPES.has(downloaded.data.type)
      || downloaded.data.type !== expectedMime) {
    throw new Error("Published image unavailable");
  }
  return downloaded.data;
}

/**
 * Caché de una foto ya autorizada (rendimiento P2a, decidido por el titular el 22/11/2026): solo en el navegador
 * de quien la vio (private), 10 minutos. Ningún servidor o CDN intermedio la guarda, así que un visitante nuevo
 * nunca ve la foto de un anuncio archivado; quien ya la había visto puede conservarla en su equipo hasta 10 min.
 * Errores y fotos no publicadas siguen con no-store.
 */
export const PUBLISHED_IMAGE_CACHE = "private, max-age=600";

/** Mínimo de la API de imágenes de Cloudflare que usamos (binding IMAGES del Worker). */
export type ImagesBinding = {
  input(stream: ReadableStream): {
    transform(options: { width: number; fit: "scale-down" }): {
      output(options: { format: "image/webp"; quality: number }): Promise<{ response(options?: { headers?: HeadersInit }): Response }>;
    };
  };
};

/**
 * Foto ya autorizada, redimensionada a `width` y convertida a WebP, con la misma caché privada que el original. Si el binding no existe (desarrollo local, pruebas) o
 * falla (p. ej. límite mensual de transformaciones), devuelve null y la ruta sirve el original.
 */
export async function resizedImageResponse(blob: Blob, width: number, images: ImagesBinding | undefined): Promise<Response | null> {
  if (!images) return null;
  try {
    const result = await images.input(blob.stream()).transform({ width, fit: "scale-down" }).output({ format: "image/webp", quality: 78 });
    const response = result.response({ headers: { "Cache-Control": PUBLISHED_IMAGE_CACHE, "X-Content-Type-Options": "nosniff" } });
    return response.ok ? response : null;
  } catch {
    return null;
  }
}

export function imageResponse(blob: Blob, cacheControl: string): Response {
  return new Response(blob, { headers: {
    "Content-Type": blob.type,
    "Content-Length": String(blob.size),
    "Cache-Control": cacheControl,
    "X-Content-Type-Options": "nosniff",
  } });
}
