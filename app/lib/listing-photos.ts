import { MAX_PHOTO_BYTES, MAX_PHOTOS } from "./publication";

export { MAX_PHOTOS };
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type PhotoType = typeof PHOTO_TYPES[number];

/** Comprueba la firma real del archivo: el tipo declarado por el navegador no basta. */
export function sniffImage(bytes: Uint8Array): PhotoType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "image/png";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

export class PhotoValidationError extends Error {}

// Blob-like check: multipart parsers in different runtimes return their own File classes.
function isBlobLike(value: unknown): value is File {
  return typeof value === "object" && value !== null && typeof (value as Blob).slice === "function"
    && typeof (value as Blob).size === "number" && typeof (value as Blob).type === "string";
}

export async function validatePhoto(file: unknown): Promise<{ file: File; mime: PhotoType }> {
  if (!isBlobLike(file) || file.size <= 0 || file.size > MAX_PHOTO_BYTES) {
    throw new PhotoValidationError("La foto debe ser JPG, PNG o WebP y pesar como máximo 5 MiB.");
  }
  const mime = sniffImage(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
  if (!mime || mime !== file.type) throw new PhotoValidationError("El archivo no es una imagen JPG, PNG o WebP válida.");
  return { file, mime };
}

/** Nuevo orden con `imageId` como portada, conservando el resto. */
export function withCover(ids: string[], imageId: string): string[] {
  return ids.includes(imageId) ? [imageId, ...ids.filter(id => id !== imageId)] : ids;
}
/** Mueve una foto una posición (-1 izquierda, +1 derecha). */
export function moved(ids: string[], imageId: string, delta: -1 | 1): string[] {
  const from = ids.indexOf(imageId), to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return ids;
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
