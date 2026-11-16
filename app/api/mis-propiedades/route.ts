import { getVerifiedUser } from "../../lib/auth-server";
import { isSamePublicationOrigin } from "../../lib/request-origin";
import { BodyReadError, JSON_BODY_TIMEOUT_MS, readBoundedBody } from "../../lib/bounded-body";
import { LISTING_ACTIONS, LISTING_ID, ListingValidationError, validateListingEdit, type ListingAction } from "../../lib/listing-management";
import { failure, OWNER_ERRORS, ownerFailure, reply, rpcFailure } from "../../lib/owner-api";
import { cleanupPendingImages, deleteOwnListing } from "../../lib/owner-storage";
import { LISTING_ID as IMAGE_ID } from "../../lib/listing-management";

export const runtime = "nodejs";
const RPC_ERRORS = OWNER_ERRORS;

/** Una sola ruta para editar, cambiar el estado, ordenar o quitar fotos y eliminar un anuncio propio. La titularidad la verifica la base de datos. */
export async function POST(request: Request): Promise<Response> {
  if (!isSamePublicationOrigin(request)) return failure("INVALID_ORIGIN", "La solicitud debe iniciarse desde este sitio.", 403);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) return failure("INVALID_CONTENT_TYPE", "Formato no válido.", 415);
  let auth: Awaited<ReturnType<typeof getVerifiedUser>>;
  try { auth = await getVerifiedUser(); } catch { return failure("MANAGEMENT_UNAVAILABLE", "El servicio no está disponible.", 503); }
  const { client, user } = auth;
  if (!client || !user) return failure("AUTH_REQUIRED", RPC_ERRORS.AUTH_REQUIRED[1], 401);

  let input: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(await (await readBoundedBody(request, 16 * 1024, JSON_BODY_TIMEOUT_MS)).text());
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    input = parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof BodyReadError && error.code === "REQUEST_TOO_LARGE") return failure(error.code, "La solicitud es demasiado grande.", 413);
    return failure("INVALID_REQUEST", "No se pudo leer la solicitud.", 400);
  }
  const id = input.id;
  if (typeof id !== "string" || !LISTING_ID.test(id)) return failure("INVALID_REQUEST", "Identificador de anuncio no válido.", 400);

  try {
    if (input.op === "edit") {
      if (Object.keys(input).sort().join(",") !== "fields,id,op" || !input.fields || typeof input.fields !== "object" || Array.isArray(input.fields)) {
        return failure("INVALID_REQUEST", "No se pudo leer la solicitud.", 400);
      }
      // The type is read from the owner's own row (RLS); the database re-validates everything anyway.
      const { data: row, error: readError } = await client.from("properties").select("property_type").eq("id", id).eq("owner_id", user.id).maybeSingle();
      if (readError) return rpcFailure(null);
      if (!row) return failure("LISTING_NOT_FOUND", RPC_ERRORS.LISTING_NOT_FOUND[1], 404);
      let fields;
      try { fields = validateListingEdit(input.fields as Record<string, unknown>, String(row.property_type)); }
      catch (error) { if (error instanceof ListingValidationError) return failure("VALIDATION_ERROR", error.message, 400); throw error; }
      const { data, error } = await client.rpc("owner_update_listing", { p_id: id, p_fields: fields });
      return error ? rpcFailure(error) : reply(200, { ok: true, listing: data });
    }
    if (input.op === "status") {
      if (Object.keys(input).sort().join(",") !== "action,id,op" || !LISTING_ACTIONS.includes(input.action as ListingAction)) {
        return failure("INVALID_REQUEST", "Acción no válida.", 400);
      }
      const { data, error } = await client.rpc("owner_set_listing_status", { p_id: id, p_action: input.action });
      return error ? rpcFailure(error) : reply(200, { ok: true, listing: data });
    }
    if (input.op === "delete") {
      if (Object.keys(input).sort().join(",") !== "id,op") return failure("INVALID_REQUEST", "No se pudo leer la solicitud.", 400);
      const result = await deleteOwnListing(client, user.id, id);
      return result.ok ? reply(200, { ok: true, deleted: true }) : ownerFailure(result.code);
    }
    if (input.op === "review-request") {
      const text = typeof input.message === "string" ? input.message.trim() : "";
      if (Object.keys(input).sort().join(",") !== "id,message,op" || text.length < 10 || text.length > 500) {
        return failure("INVALID_REQUEST", "Escribe entre 10 y 500 caracteres.", 400);
      }
      const { error } = await client.rpc("owner_request_review", { p_id: id, p_message: text });
      return error ? rpcFailure(error) : reply(200, { ok: true });
    }
    if (input.op === "close-feedback") {
      if (Object.keys(input).sort().join(",") !== "id,op,viaPortal" || typeof input.viaPortal !== "boolean") {
        return failure("INVALID_REQUEST", "No se pudo leer la solicitud.", 400);
      }
      const { error } = await client.rpc("owner_set_close_feedback", { p_id: id, p_via_portal: input.viaPortal });
      return error ? rpcFailure(error) : reply(200, { ok: true });
    }
    if (input.op === "image-remove") {
      if (Object.keys(input).sort().join(",") !== "id,imageId,op" || typeof input.imageId !== "string" || !IMAGE_ID.test(input.imageId)) {
        return failure("INVALID_REQUEST", "No se pudo leer la solicitud.", 400);
      }
      const { error } = await client.rpc("owner_remove_listing_image", { p_id: id, p_image_id: input.imageId });
      if (error) return rpcFailure(error);
      await cleanupPendingImages(client, user.id);
      return reply(200, { ok: true });
    }
    if (input.op === "image-order") {
      const order = input.order;
      if (Object.keys(input).sort().join(",") !== "id,op,order" || !Array.isArray(order) || order.length < 1 || order.length > 5
          || !order.every(x => typeof x === "string" && IMAGE_ID.test(x))) {
        return failure("INVALID_REQUEST", "No se pudo leer la solicitud.", 400);
      }
      const { error } = await client.rpc("owner_set_image_order", { p_id: id, p_order: order });
      return error ? rpcFailure(error) : reply(200, { ok: true });
    }
    return failure("INVALID_REQUEST", "Operación no válida.", 400);
  } catch {
    return failure("MANAGEMENT_UNAVAILABLE", "No pudimos completar la operación. Inténtalo más tarde.", 503);
  }
}
