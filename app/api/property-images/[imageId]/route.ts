import { anonymousImageClient, imageResponse, loadPublishedPrivateImage, validImageId } from "../../../lib/property-images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ imageId: string }> }): Promise<Response> {
  const { imageId } = await params;
  if (!validImageId(imageId)) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  const client = anonymousImageClient();
  if (!client) return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  try {
    const blob = await loadPublishedPrivateImage(client, imageId);
    return blob ? imageResponse(blob, "no-store")
      : new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  } catch {
    return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
