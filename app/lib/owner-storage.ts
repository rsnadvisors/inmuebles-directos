import "server-only";
import type { getVerifiedUser } from "./auth-server";
import { PRIVATE_PROPERTY_IMAGE_BUCKET } from "./property-images";

type Client = NonNullable<Awaited<ReturnType<typeof getVerifiedUser>>["client"]>;

/** Solo rutas de la carpeta del propio usuario: defensa adicional a las políticas de Storage. */
export function ownPaths(paths: unknown, userId: string, listingId?: string): string[] {
  const prefix = listingId ? `${userId}/${listingId}/` : `${userId}/`;
  return Array.isArray(paths) ? paths.filter((p): p is string => typeof p === "string" && p.startsWith(prefix) && !p.includes("..")) : [];
}

/** Borra en Storage las fotos quitadas o las subidas abandonadas. Nunca falla la operación principal. */
export async function cleanupPendingImages(client: Client, userId: string): Promise<void> {
  try {
    const { data, error } = await client.rpc("owner_pending_image_cleanup");
    if (error) return;
    const paths = ownPaths((data as { paths?: unknown })?.paths, userId);
    if (paths.length) await client.storage.from(PRIVATE_PROPERTY_IMAGE_BUCKET).remove(paths);
  } catch { /* best effort: the next operation retries */ }
}

export type DeletionResult = { ok: boolean; code?: string };

/** Eliminación en dos fases de un anuncio propio (fase 1), reutilizada por la baja de cuenta. */
export async function deleteOwnListing(client: Client, userId: string, id: string): Promise<DeletionResult> {
  const begun = await client.rpc("owner_begin_listing_deletion", { p_id: id });
  if (begun.error) return { ok: false, code: begun.error.message || "MANAGEMENT_UNAVAILABLE" };
  const owned = ownPaths((begun.data as { paths?: unknown })?.paths, userId, id);
  if (owned.length) {
    const removed = await client.storage.from(PRIVATE_PROPERTY_IMAGE_BUCKET).remove(owned);
    if (removed.error) return { ok: false, code: "IMAGES_REMAIN" };
  }
  const finished = await client.rpc("owner_finish_listing_deletion", { p_id: id });
  return finished.error ? { ok: false, code: finished.error.message || "MANAGEMENT_UNAVAILABLE" } : { ok: true };
}
