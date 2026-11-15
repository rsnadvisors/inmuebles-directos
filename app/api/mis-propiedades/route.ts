import { getVerifiedUser } from "../../lib/auth-server";
import { isSamePublicationOrigin } from "../../lib/request-origin";
import { BodyReadError, JSON_BODY_TIMEOUT_MS, readBoundedBody } from "../../lib/bounded-body";
import { LISTING_ACTIONS, LISTING_ID, ListingValidationError, validateListingEdit, type ListingAction } from "../../lib/listing-management";
import { PRIVATE_PROPERTY_IMAGE_BUCKET } from "../../lib/property-images";

export const runtime = "nodejs";
const reply = (status: number, body: Record<string, unknown>) => Response.json(body, { status });
const failure = (code: string, message: string, status: number) => reply(status, { ok: false, code, message });

const RPC_ERRORS: Record<string, [number, string]> = {
  LISTING_NOT_FOUND: [404, "No encontramos ese anuncio en tu cuenta."],
  LISTING_NOT_EDITABLE: [409, "Este anuncio no se puede modificar en su estado actual."],
  INVALID_TRANSITION: [409, "Esa acción no está disponible para el estado actual del anuncio. Recarga la página."],
  INVALID_FIELDS: [400, "Algún dato no es válido. Revisa el formulario."],
  AUTH_REQUIRED: [401, "Inicia sesión para gestionar tus anuncios."],
  IMAGES_REMAIN: [502, "No pudimos borrar todas las fotos. El anuncio ya está oculto; vuelve a intentar eliminarlo."],
  DELETION_NOT_REQUESTED: [409, "Vuelve a intentar la eliminación."],
};
function rpcFailure(error: { message?: string; code?: string } | null): Response {
  const known = error?.message && RPC_ERRORS[error.message];
  if (known) return failure(error!.message!, known[1], known[0]);
  if (error?.code === "PT404") return failure("LISTING_NOT_FOUND", RPC_ERRORS.LISTING_NOT_FOUND[1], 404);
  return failure("MANAGEMENT_UNAVAILABLE", "No pudimos completar la operación. Inténtalo más tarde.", 503);
}

/** Una sola ruta para editar, cambiar el estado o eliminar un anuncio propio. La titularidad la verifica la base de datos. */
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
      const begun = await client.rpc("owner_begin_listing_deletion", { p_id: id });
      if (begun.error) return rpcFailure(begun.error);
      const paths = (begun.data as { paths?: unknown })?.paths;
      const owned = Array.isArray(paths) ? paths.filter((p): p is string => typeof p === "string" && p.startsWith(`${user.id}/${id}/`)) : [];
      if (owned.length) {
        // Storage policy only lets the owner remove objects of listings with a pending deletion.
        const removed = await client.storage.from(PRIVATE_PROPERTY_IMAGE_BUCKET).remove(owned);
        if (removed.error) return failure("IMAGES_REMAIN", RPC_ERRORS.IMAGES_REMAIN[1], 502);
      }
      const finished = await client.rpc("owner_finish_listing_deletion", { p_id: id });
      return finished.error ? rpcFailure(finished.error) : reply(200, { ok: true, deleted: true });
    }
    return failure("INVALID_REQUEST", "Operación no válida.", 400);
  } catch {
    return failure("MANAGEMENT_UNAVAILABLE", "No pudimos completar la operación. Inténtalo más tarde.", 503);
  }
}
