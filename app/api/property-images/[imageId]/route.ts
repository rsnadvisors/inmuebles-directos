import { getCloudflareContext } from "@opennextjs/cloudflare";
import { anonymousImageClient, imageResponse, loadPublishedPrivateImage, PUBLISHED_IMAGE_CACHE, resizedImageResponse, validImageId, type ImagesBinding } from "../../../lib/property-images";
import { IMAGE_WIDTHS, type ImageWidth } from "../../../lib/property-image-source";

/** Binding IMAGES de Cloudflare, si existe (en desarrollo local y en pruebas no hay). */
function imagesBinding(): ImagesBinding | undefined {
  try { return (getCloudflareContext().env as { IMAGES?: ImagesBinding }).IMAGES; } catch { return undefined; }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ imageId: string }> }): Promise<Response> {
  const { imageId } = await params;
  // ?w=320|640|1200 pide la versión redimensionada; cualquier otro valor (o ninguno) sirve el original.
  const requested = Number(new URL(request.url).searchParams.get("w"));
  const width = (IMAGE_WIDTHS as readonly number[]).includes(requested) ? requested as ImageWidth : null;
  if (!validImageId(imageId)) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  const client = anonymousImageClient();
  if (!client) return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  try {
    const blob = await loadPublishedPrivateImage(client, imageId);
    if (!blob) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    // La autorización (anuncio publicado, ruta válida) ya se comprobó al cargar la foto; solo cambia el tamaño.
    const resized = width ? await resizedImageResponse(blob, width, imagesBinding()) : null;
    return resized ?? imageResponse(blob, PUBLISHED_IMAGE_CACHE);
  } catch {
    return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
