import { getVerifiedUser } from "../../../lib/auth-server";
import { isSamePublicationOrigin } from "../../../lib/request-origin";
import { BodyReadError, readBoundedBody, UPLOAD_BODY_TIMEOUT_MS } from "../../../lib/bounded-body";
import { LISTING_ID } from "../../../lib/listing-management";
import { PhotoValidationError, validatePhoto } from "../../../lib/listing-photos";
import { MAX_PHOTO_BYTES } from "../../../lib/publication";
import { PRIVATE_PROPERTY_IMAGE_BUCKET } from "../../../lib/property-images";
import { failure, ownerFailure, reply, rpcFailure } from "../../../lib/owner-api";
import { cleanupPendingImages, ownPaths } from "../../../lib/owner-storage";

export const runtime = "nodejs";
const MAX_BODY = MAX_PHOTO_BYTES + 64 * 1024;

/** Añade UNA foto a un anuncio propio ya publicado (o pausado/vendido/alquilado). */
export async function POST(request: Request): Promise<Response> {
  if (!isSamePublicationOrigin(request)) return failure("INVALID_ORIGIN", "La solicitud debe iniciarse desde este sitio.", 403);
  if (!/^multipart\/form-data\s*;/i.test(request.headers.get("content-type") ?? "")) return failure("INVALID_CONTENT_TYPE", "Formato no válido.", 415);
  const length = request.headers.get("content-length");
  if (length && /^\d+$/.test(length) && Number(length) > MAX_BODY) return ownerFailure("INVALID_IMAGE");
  let auth: Awaited<ReturnType<typeof getVerifiedUser>>;
  try { auth = await getVerifiedUser(); } catch { return ownerFailure(undefined); }
  const { client, user } = auth;
  if (!client || !user) return ownerFailure("AUTH_REQUIRED");

  let form: FormData;
  try {
    const body = await readBoundedBody(request, MAX_BODY, UPLOAD_BODY_TIMEOUT_MS);
    form = await new Response(body, { headers: { "content-type": request.headers.get("content-type")! } }).formData();
  } catch (error) {
    if (error instanceof BodyReadError && error.code === "REQUEST_TOO_LARGE") return ownerFailure("INVALID_IMAGE");
    return failure("INVALID_REQUEST", "No se pudo leer el formulario.", 400);
  }
  const keys = [...form.keys()].sort().join(",");
  const id = form.get("id");
  if (keys !== "id,image" || typeof id !== "string" || !LISTING_ID.test(id)) return failure("INVALID_REQUEST", "No se pudo leer el formulario.", 400);
  let photo;
  try { photo = await validatePhoto(form.get("image")); }
  catch (error) { if (error instanceof PhotoValidationError) return failure("VALIDATION_ERROR", error.message, 400); throw error; }

  try {
    await cleanupPendingImages(client, user.id);
    const begun = await client.rpc("owner_begin_image_upload", { p_id: id, p_mime: photo.mime, p_size: photo.file.size });
    if (begun.error) return rpcFailure(begun.error);
    const { image_id: imageId, path } = (begun.data ?? {}) as { image_id?: string; path?: string };
    if (!imageId || !path || ownPaths([path], user.id, id).length !== 1) return ownerFailure(undefined);
    const uploaded = await client.storage.from(PRIVATE_PROPERTY_IMAGE_BUCKET).upload(path, photo.file, { contentType: photo.mime, upsert: false });
    if (uploaded.error) return failure("UPLOAD_FAILED", "No pudimos subir la foto. Inténtalo de nuevo.", 502);
    const finished = await client.rpc("owner_finish_image_upload", { p_id: id, p_image_id: imageId });
    if (finished.error) return rpcFailure(finished.error);
    if (!(finished.data as { accepted?: boolean })?.accepted) {
      // Rejected uploads become disposable for their owner; remove the bytes right away.
      await client.storage.from(PRIVATE_PROPERTY_IMAGE_BUCKET).remove([path]).catch(() => undefined);
      return failure("UPLOAD_REJECTED", "No pudimos validar la foto subida. Inténtalo de nuevo.", 409);
    }
    return reply(200, { ok: true, imageId });
  } catch {
    return ownerFailure(undefined);
  }
}
