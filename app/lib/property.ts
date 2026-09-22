import { cache } from "react";
import { normalizeListing, type Listing } from "./inventory";
import { supabase } from "./supabase";

export const PROPERTY_DETAIL_SELECT = "id,title,slug,status,listing_type,property_type,price,currency,maintenance_fee,area_total_m2,area_built_m2,bedrooms,bathrooms,parking_spaces,floors,description,address,district,city,region,country,lat,lng,published_at,property_images(id,public_url,alt_text,sort_order,is_cover)";

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
