import { getVerifiedUser } from "../../../lib/auth-server";
import { cancelPublication, PUBLICATION_REQUEST_ID, PublicationBoundaryError } from "../../../lib/publication-boundary-server";
import { isSamePublicationOrigin } from "../../../lib/request-origin";
import { BodyReadError, JSON_BODY_TIMEOUT_MS, readBoundedBody } from "../../../lib/bounded-body";

export const runtime = "nodejs";
const failure = (code: string, status: number) => Response.json({ ok: false, code,
  message: "No pudimos confirmar el cierre del intento. Conserva su identificador y vuelve a comprobarlo." }, { status });
export async function POST(request: Request): Promise<Response> {
  if (!isSamePublicationOrigin(request)) return failure("INVALID_ORIGIN", 403);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) return failure("INVALID_CONTENT_TYPE", 415);
  let auth;
  try { auth = await getVerifiedUser(); } catch { return failure("RECONCILIATION_UNAVAILABLE", 503); }
  if (!auth.client || !auth.user) return failure("AUTH_REQUIRED", 401);
  let input;
  try {
    input = JSON.parse(await (await readBoundedBody(request, 1024, JSON_BODY_TIMEOUT_MS)).text());
    if (!input || typeof input !== "object" || Object.keys(input).sort().join(",") !== "action,requestId"
      || typeof input.requestId !== "string" || !PUBLICATION_REQUEST_ID.test(input.requestId)
      || !["cancel", "reconcile"].includes(input.action)) return failure("INVALID_REQUEST", 400);
  } catch (error) {
    if (error instanceof BodyReadError && error.code === "REQUEST_TOO_LARGE") return failure(error.code, 413);
    if (error instanceof BodyReadError && error.code === "REQUEST_TIMEOUT") return failure(error.code, 408);
    return failure("INVALID_REQUEST", 400);
  }
  try {
    const plan = await cancelPublication(auth.client, auth.user.id, input.requestId, input.action);
    return Response.json({ ok: true, requestId: plan.requestId, state: plan.state });
  } catch (error) {
    return failure(error instanceof PublicationBoundaryError ? error.code : "RECONCILIATION_UNAVAILABLE",
      error instanceof PublicationBoundaryError ? error.status : 503);
  }
}
