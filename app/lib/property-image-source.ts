export const PRIVATE_PROPERTY_IMAGE_BUCKET = "property-images-private";
const IMAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validImageId(value: string): boolean { return IMAGE_ID.test(value); }

export function resolvePropertyImage(image: Record<string, unknown>): string | null {
  if (image.storage_bucket === PRIVATE_PROPERTY_IMAGE_BUCKET) {
    return typeof image.id === "string" && validImageId(image.id) ? `/api/property-images/${image.id}` : null;
  }
  return typeof image.public_url === "string" && image.public_url.trim() ? image.public_url.trim() : null;
}
