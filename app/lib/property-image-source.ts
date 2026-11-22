export const PRIVATE_PROPERTY_IMAGE_BUCKET = "property-images-private";
const IMAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validImageId(value: string): boolean { return IMAGE_ID.test(value); }

/**
 * Anchos que el Worker sabe entregar redimensionados en WebP (rendimiento P1c). Una lista cerrada: nadie puede
 * pedir tamaños arbitrarios (cada combinación nueva cuenta como transformación en Cloudflare Images).
 */
export const IMAGE_WIDTHS = [320, 640, 1200] as const;
export type ImageWidth = typeof IMAGE_WIDTHS[number];

/** «/api/property-images/<id>» → «/api/property-images/<id>?w=640». Las URLs públicas antiguas quedan igual. */
export function sizedImageUrl(url: string, width: ImageWidth): string {
  return /^\/api\/property-images\/[0-9a-f-]{36}$/i.test(url) ? `${url}?w=${width}` : url;
}

/** srcset para fotos que ocupan todo el ancho en el móvil y una columna en escritorio. */
export function imageSrcSet(url: string): string | undefined {
  const sized = sizedImageUrl(url, 640);
  return sized === url ? undefined : `${sized} 640w, ${sizedImageUrl(url, 1200)} 1200w`;
}

const PRIVATE_IMAGE_MIME = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;

export function privateImageMime(
  image: { property_id: unknown; storage_bucket: unknown; storage_path: unknown },
  property: { id: unknown; owner_id: unknown; status: unknown },
): string | null {
  if (image.storage_bucket !== PRIVATE_PROPERTY_IMAGE_BUCKET || property.status !== "published"
      || typeof image.property_id !== "string" || typeof property.id !== "string"
      || image.property_id !== property.id || !validImageId(property.id)
      || typeof property.owner_id !== "string" || !validImageId(property.owner_id)
      || typeof image.storage_path !== "string") return null;
  const parts = image.storage_path.split("/");
  if (parts.length !== 3 || parts[0] !== property.owner_id || parts[1] !== property.id) return null;
  const object = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(jpg|png|webp)$/.exec(parts[2]);
  return object ? PRIVATE_IMAGE_MIME[object[2] as keyof typeof PRIVATE_IMAGE_MIME] : null;
}

export function resolvePropertyImage(image: Record<string, unknown>): string | null {
  if (image.storage_bucket === PRIVATE_PROPERTY_IMAGE_BUCKET) {
    return typeof image.id === "string" && validImageId(image.id) ? `/api/property-images/${image.id}` : null;
  }
  return typeof image.public_url === "string" && image.public_url.trim() ? image.public_url.trim() : null;
}
