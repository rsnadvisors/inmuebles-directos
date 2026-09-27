import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PRIVATE_PROPERTY_IMAGE_BUCKET, validImageId } from "./property-image-source";

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
  const property = await client.from("properties").select("id").eq("id", image.data.property_id)
    .eq("status", "published").maybeSingle();
  if (property.error) throw new Error("Property status unavailable");
  if (!property.data) return null;
  const downloaded = await client.storage.from(PRIVATE_PROPERTY_IMAGE_BUCKET).download(image.data.storage_path);
  if (downloaded.error || !downloaded.data || !IMAGE_TYPES.has(downloaded.data.type)) {
    throw new Error("Published image unavailable");
  }
  return downloaded.data;
}

export function imageResponse(blob: Blob, cacheControl: string): Response {
  return new Response(blob, { headers: {
    "Content-Type": blob.type,
    "Content-Length": String(blob.size),
    "Cache-Control": cacheControl,
    "X-Content-Type-Options": "nosniff",
  } });
}
