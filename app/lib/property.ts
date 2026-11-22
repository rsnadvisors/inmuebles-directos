import { cache } from "react";
import { normalizeListing, type Listing } from "./inventory";
import { supabase } from "./supabase";

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
