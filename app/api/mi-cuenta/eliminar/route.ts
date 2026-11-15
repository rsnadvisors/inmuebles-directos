import { cookies } from "next/headers";
import { getVerifiedUser } from "../../../lib/auth-server";
import { isSamePublicationOrigin } from "../../../lib/request-origin";
import { JSON_BODY_TIMEOUT_MS, readBoundedBody } from "../../../lib/bounded-body";
import { failure, ownerFailure, reply, rpcFailure } from "../../../lib/owner-api";
import { cleanupPendingImages, deleteOwnListing } from "../../../lib/owner-storage";
import { ACCOUNT_DELETION_PHRASE } from "../../../lib/listing-management";

export const runtime = "nodejs";

/** Derecho de cancelación (Ley N.º 29733): elimina anuncios, fotos, perfil y la cuenta. Irreversible. */
export async function POST(request: Request): Promise<Response> {
  if (!isSamePublicationOrigin(request)) return failure("INVALID_ORIGIN", "La solicitud debe iniciarse desde este sitio.", 403);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) return failure("INVALID_CONTENT_TYPE", "Formato no válido.", 415);
  let auth: Awaited<ReturnType<typeof getVerifiedUser>>;
  try { auth = await getVerifiedUser(); } catch { return ownerFailure(undefined); }
  const { client, user } = auth;
  if (!client || !user) return failure("AUTH_REQUIRED", "Inicia sesión para eliminar tu cuenta.", 401);
  try {
    const input: unknown = JSON.parse(await (await readBoundedBody(request, 1024, JSON_BODY_TIMEOUT_MS)).text());
    if (!input || typeof input !== "object" || Object.keys(input).join(",") !== "confirm"
        || (input as { confirm?: unknown }).confirm !== ACCOUNT_DELETION_PHRASE) {
      return failure("CONFIRMATION_REQUIRED", `Escribe ${ACCOUNT_DELETION_PHRASE} para confirmar.`, 400);
    }
  } catch { return failure("INVALID_REQUEST", "No se pudo leer la solicitud.", 400); }

  try {
    const { data: rows, error } = await client.from("properties").select("id,status").eq("owner_id", user.id);
    if (error) return ownerFailure(undefined);
    if ((rows ?? []).some(r => r.status === "draft")) return ownerFailure("PUBLICATION_PENDING");
    for (const row of rows ?? []) {
      const result = await deleteOwnListing(client, user.id, String(row.id));
      if (!result.ok) return ownerFailure(result.code);
    }
    await cleanupPendingImages(client, user.id);
    const deleted = await client.rpc("owner_delete_account");
    if (deleted.error) return rpcFailure(deleted.error);
  } catch {
    return ownerFailure(undefined);
  }
  // The auth user no longer exists: drop this browser's session cookies.
  const store = await cookies();
  for (const cookie of store.getAll()) if (cookie.name.startsWith("sb-")) store.delete(cookie.name);
  return reply(200, { ok: true, deleted: true });
}
