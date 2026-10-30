import { getVerifiedUser } from "../../../lib/auth-server";
import { cancelPublication, PUBLICATION_REQUEST_ID, PublicationBoundaryError } from "../../../lib/publication-boundary-server";

export const runtime = "nodejs";
const failure = (code: string, status: number) => Response.json({ ok: false, code,
  message: "No pudimos confirmar el cierre del intento. Conserva su identificador y vuelve a comprobarlo." }, { status });
export async function POST(request: Request): Promise<Response> {
  const origin = process.env.NODE_ENV === "production" ? "https://inmueblesdirectos.com" : new URL(request.url).origin;
  if (request.headers.get("origin") !== origin || request.headers.get("sec-fetch-site") === "cross-site") return failure("INVALID_ORIGIN", 403);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) return failure("INVALID_CONTENT_TYPE", 415);
  let auth;
  try { auth = await getVerifiedUser(); } catch { return failure("RECONCILIATION_UNAVAILABLE", 503); }
  if (!auth.client || !auth.user) return failure("AUTH_REQUIRED", 401);
  let input;
  try {
    const reader = request.body?.getReader();
    if (!reader) return failure("INVALID_REQUEST", 400);
    let size = 0; const chunks: Uint8Array<ArrayBuffer>[] = [];
    try {
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 1024) { await reader.cancel(); return failure("REQUEST_TOO_LARGE", 413); }
        chunks.push(new Uint8Array(value));
      }
    } finally { reader.releaseLock(); }
    input = JSON.parse(await new Blob(chunks).text());
    if (!input || typeof input !== "object" || Object.keys(input).sort().join(",") !== "action,requestId"
      || typeof input.requestId !== "string" || !PUBLICATION_REQUEST_ID.test(input.requestId)
      || !["cancel", "reconcile"].includes(input.action)) return failure("INVALID_REQUEST", 400);
  } catch { return failure("INVALID_REQUEST", 400); }
  try {
    const plan = await cancelPublication(auth.client, auth.user.id, input.requestId, input.action);
    return Response.json({ ok: true, requestId: plan.requestId, state: plan.state });
  } catch (error) {
    return failure(error instanceof PublicationBoundaryError ? error.code : "RECONCILIATION_UNAVAILABLE",
      error instanceof PublicationBoundaryError ? error.status : 503);
  }
}
