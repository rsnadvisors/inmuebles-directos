import { cache } from "react";
import { normalizeInventory, normalizeListing, type Listing } from "./inventory";
import { supabase } from "./supabase";
import { siteOrigin } from "./auth-origin";

export const PROPERTY_DETAIL_SELECT = "id,title,slug,status,contact_phone,listing_type,property_type,price,currency,maintenance_fee,area_total_m2,area_built_m2,bedrooms,bathrooms,parking_spaces,floors,description,address,district,city,region,country,lat,lng,published_at,is_reserved,property_images(id,storage_bucket,public_url,alt_text,sort_order,is_cover)";

export async function queryPublishedListing(slug: string): Promise<Listing | null> {
  const normalizedSlug = slug.trim();
  if (!normalizedSlug) return null;
  if (!supabase) throw new Error("Supabase is not configured");

  const { data, error } = await supabase
    .from("properties")
    .select(PROPERTY_DETAIL_SELECT)
    .eq("slug", normalizedSlug)
    .eq("status", "published")
    .maybeSingle();

  if (error) throw new Error("Unable to load the published property");
  if (!data) return null;
  const listing = normalizeListing(data);
  if (!listing || listing.status !== "published") throw new Error("Invalid published property response");
  return listing;
}

export const getPublishedListing = cache(queryPublishedListing);

/**
 * Nombre abreviado del anunciante («Ricardo S.»). Lo calcula la base (listing_publisher_name) solo para anuncios
 * publicados; un fallo o un perfil sin nombre devuelven null y la ficha muestra «Anunciante» sin romperse.
 */
export async function queryPublisherName(propertyId: string | number): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc("listing_publisher_name", { p_property_id: String(propertyId) });
    if (error || typeof data !== "string") return null;
    const name = data.replace(/\s+/g, " ").trim().slice(0, 60);
    return name || null;
  } catch { return null; }
}

export const getPublisherName = cache(queryPublisherName);

export const HOME_SELECT = "id,title,slug,status,contact_phone,listing_type,property_type,price,currency,area_total_m2,address,district,city,region,country,description,bedrooms,bathrooms,parking_spaces,lat,lng,published_at,is_reserved,property_images(id,storage_bucket,public_url,alt_text,sort_order,is_cover)";

/**
 * Caché de la lista de anuncios publicados (rendimiento P2b, decidido por el titular el 22/11/2026): 60 s en la
 * caché de Cloudflare del propio dominio. Son datos públicos (lo mismo que ve cualquier visitante); un anuncio
 * recién publicado o archivado tarda hasta 1 minuto en aparecer o desaparecer del inicio, el mapa y las páginas
 * de zona. La ficha de cada anuncio no usa esta caché y cambia al instante.
 */
export const HOME_LISTINGS_TTL_SECONDS = 60;
const HOME_CACHE_PATH = "/__cache/anuncios-publicados-v1";
type EdgeCache = { match(key: string): Promise<Response | undefined>; put(key: string, response: Response): Promise<void> };
function edgeCache(): EdgeCache | undefined {
  try { return (globalThis as { caches?: { default?: EdgeCache } }).caches?.default; } catch { return undefined; }
}

async function publishedRows(): Promise<unknown[] | undefined> {
  if (!supabase) return undefined;
  const { data, error } = await supabase.from("properties").select(HOME_SELECT).eq("status", "published");
  return error || !Array.isArray(data) ? undefined : data;
}

/** Anuncios publicados para el inicio, leídos en el servidor; si la base no responde, el mapa los carga en el navegador. */
export async function readHomeListings(): Promise<Listing[] | undefined> {
  if (!supabase) return undefined;
  const cache = edgeCache();
  const key = new URL(HOME_CACHE_PATH, siteOrigin()).href;
  try {
    if (cache) {
      const hit = await cache.match(key).catch(() => undefined);
      if (hit) {
        const rows = await hit.json().catch(() => null);
        if (Array.isArray(rows)) return normalizeInventory(rows);
      }
    }
    const rows = await publishedRows();
    if (!rows) return undefined;
    if (cache) {
      // Solo se guarda una lectura correcta; un error nunca queda en caché.
      await cache.put(key, new Response(JSON.stringify(rows), { headers: {
        "Content-Type": "application/json", "Cache-Control": `public, max-age=${HOME_LISTINGS_TTL_SECONDS}`,
      } })).catch(() => {});
    }
    return normalizeInventory(rows);
  } catch { return undefined; }
}
