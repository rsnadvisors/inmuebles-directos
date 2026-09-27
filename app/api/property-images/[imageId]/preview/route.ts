import { getVerifiedUser } from "../../../../lib/auth-server";
import { PRIVATE_PROPERTY_IMAGE_BUCKET, imageResponse, validImageId } from "../../../../lib/property-images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(_request: Request, { params }: { params: Promise<{ imageId: string }> }): Promise<Response> {
  const { imageId } = await params;
  if (!validImageId(imageId)) return new Response(null, { status: 404, headers: NO_STORE });
  try {
    const { client, user } = await getVerifiedUser();
    if (!client || !user) return new Response(null, { status: 401, headers: NO_STORE });
    const image = await client.from("property_images").select("id,property_id,storage_bucket,storage_path")
      .eq("id", imageId).eq("storage_bucket", PRIVATE_PROPERTY_IMAGE_BUCKET).maybeSingle();
    if (image.error) throw new Error("Image metadata unavailable");
    if (!image.data) return new Response(null, { status: 404, headers: NO_STORE });
    const property = await client.from("properties").select("id").eq("id", image.data.property_id)
      .eq("owner_id", user.id).eq("status", "draft").maybeSingle();
    if (property.error) throw new Error("Property ownership unavailable");
    if (!property.data) return new Response(null, { status: 404, headers: NO_STORE });
    const downloaded = await client.storage.from(PRIVATE_PROPERTY_IMAGE_BUCKET).download(image.data.storage_path);
    if (downloaded.error || !downloaded.data || !["image/jpeg", "image/png", "image/webp"].includes(downloaded.data.type)) {
      throw new Error("Draft image unavailable");
    }
    return imageResponse(downloaded.data, "private, no-store");
  } catch {
    return new Response(null, { status: 503, headers: NO_STORE });
  }
}
