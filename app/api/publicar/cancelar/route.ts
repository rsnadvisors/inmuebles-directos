import { getVerifiedUser } from "../../../lib/auth-server";
import { cancelPublication, inspectPublication, PUBLICATION_REQUEST_ID, PublicationBoundaryError } from "../../../lib/publication-boundary-server";
import { isSamePublicationOrigin } from "../../../lib/request-origin";
import { BodyReadError, JSON_BODY_TIMEOUT_MS, readBoundedBody } from "../../../lib/bounded-body";

export const runtime = "nodejs";
const failure = (code: string, status: number) => Response.json({ ok: false, code,
  message: "No pudimos confirmar el cierre del intento. Conserva su identificador y vuelve a comprobarlo." }, { status });
type Client = NonNullable<Awaited<ReturnType<typeof getVerifiedUser>>["client"]>;
// Title for the recovery notice only. RLS limits it to the caller's own rows; any failure just omits it.
async function ownTitle(client: Client, requestId: string): Promise<string | null> {
  try {
    if (typeof client.from !== "function") return null;
    const { data } = await client.from("properties").select("title").eq("id", requestId).maybeSingle();
    return typeof data?.title === "string" && data.title.trim() ? data.title.trim().slice(0, 120) : null;
  } catch { return null; }
}
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
      || !["cancel", "reconcile", "inspect"].includes(input.action)) return failure("INVALID_REQUEST", 400);
  } catch (error) {
    if (error instanceof BodyReadError && error.code === "REQUEST_TOO_LARGE") return failure(error.code, 413);
    if (error instanceof BodyReadError && error.code === "REQUEST_TIMEOUT") return failure(error.code, 408);
    return failure("INVALID_REQUEST", 400);
  }
  const title = await ownTitle(auth.client, input.requestId);
  try {
    if (input.action === "inspect") {
      // Read-only status for the automatic check on /publicar: never retires, cleans up or closes anything.
      const plan = await inspectPublication(auth.client, auth.user.id, input.requestId);
      if (plan.state === "FINALIZED") return Response.json({ ok: false, code: "PUBLICATION_ALREADY_FINALIZED",
        message: "La publicación ya está registrada.", ...(title ? { title } : {}) }, { status: 409 });
      return Response.json({ ok: true, requestId: plan.requestId, state: plan.state, ...(title ? { title } : {}) });
    }
    const plan = await cancelPublication(auth.client, auth.user.id, input.requestId, input.action);
    return Response.json({ ok: true, requestId: plan.requestId, state: plan.state, ...(title ? { title } : {}) });
  } catch (error) {
    if (error instanceof PublicationBoundaryError && error.code === "PUBLICATION_ALREADY_FINALIZED" && title) {
      return Response.json({ ok: false, code: error.code, message: "La publicación ya está registrada.", title }, { status: 409 });
    }
    return failure(error instanceof PublicationBoundaryError ? error.code : "RECONCILIATION_UNAVAILABLE",
      error instanceof PublicationBoundaryError ? error.status : 503);
  }
}
