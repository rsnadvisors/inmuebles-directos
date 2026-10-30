import { MAX_REQUEST_BYTES, PublicationValidationError, validatePublication } from "../../lib/publication";
import { preparePublication, inspectPublication, finalizePublication, PublicationBoundaryError,
  PUBLICATION_REQUEST_ID, type PublicationPlan } from "../../lib/publication-boundary-server";
import { getVerifiedPublicationUser } from "../../lib/auth-server";
import { PRIVATE_PROPERTY_IMAGE_BUCKET, anonymousImageClient, loadPublishedPrivateImage } from "../../lib/property-images";

export const runtime = "nodejs";
const failure = (code: string, message: string, status: number) => Response.json({ ok: false, code, message }, { status });
class BodyTooLarge extends Error {}

async function deliveryAvailable(imageId: string | null): Promise<boolean> {
  const client = anonymousImageClient();
  if (!client || !imageId) return false;
  try { const image = await loadPublishedPrivateImage(client, imageId); return image !== null && image.size > 0; }
  catch { return false; }
}

// Count actual bytes before multipart parsing. This is not an ingress/concurrency limit.
async function readForm(request: Request): Promise<FormData> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing body");
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new BodyTooLarge();
      }
      chunks.push(new Uint8Array(value));
    }
  } finally { reader.releaseLock(); }
  return new Response(new Blob(chunks), { headers: { "content-type": request.headers.get("content-type")! } }).formData();
}

export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  const expectedOrigin = process.env.NODE_ENV === "production" ? "https://inmueblesdirectos.com" : new URL(request.url).origin;
  if (origin !== expectedOrigin || request.headers.get("sec-fetch-site") === "cross-site") return failure("INVALID_ORIGIN", "La solicitud debe iniciarse desde este sitio.", 403);
  let auth: Awaited<ReturnType<typeof getVerifiedPublicationUser>>;
  try { auth = await getVerifiedPublicationUser(); }
  catch { return failure("PUBLICATION_FAILED", "El servicio de publicación no está disponible.", 503); }
  if (auth.reason === "PUBLICATION_IDENTITY_REQUIRED") return failure("PUBLICATION_IDENTITY_REQUIRED", "Para publicar necesitas una cuenta registrada con correo electrónico confirmado.", 403);
  const { client: supabase, user } = auth;
  if (!supabase || !user) return failure("AUTH_REQUIRED", "Inicia sesión para publicar una propiedad.", 401);
  const suppliedId = request.headers.get("x-publication-request-id");
  // This describes this request only; it does not prove an older attempt is absent.
  const rejectBeforePreparation = (code: string, message: string, status: number) => Response.json({
    ok: false, code, message,
    ...(suppliedId !== null && PUBLICATION_REQUEST_ID.test(suppliedId)
      ? { preparation: "NOT_STARTED", requestId: suppliedId, subject: user.id } : {}),
  }, { status });
  if (!/^multipart\/form-data\s*;/i.test(request.headers.get("content-type") ?? "")) return rejectBeforePreparation("INVALID_CONTENT_TYPE", "El formato de la solicitud no es válido.", 415);
  const length = request.headers.get("content-length");
  if (length && /^\d+$/.test(length) && Number(length) > MAX_REQUEST_BYTES) return rejectBeforePreparation("REQUEST_TOO_LARGE", "La solicitud supera el tamaño permitido.", 413);
  let input: ReturnType<typeof validatePublication>;
  try { input = validatePublication(await readForm(request)); }
  catch (error) {
    if (error instanceof BodyTooLarge) return rejectBeforePreparation("REQUEST_TOO_LARGE", "La solicitud supera el tamaño permitido.", 413);
    if (error instanceof PublicationValidationError) return rejectBeforePreparation("VALIDATION_ERROR", error.message, 400);
    return rejectBeforePreparation("INVALID_REQUEST", "No se pudo leer el formulario.", 400);
  }
  if (suppliedId !== null && !PUBLICATION_REQUEST_ID.test(suppliedId)) {
    return failure("INVALID_REQUEST", "El identificador de publicación no es válido.", 400);
  }
  const requestId = suppliedId ?? crypto.randomUUID();
  let plan: PublicationPlan | null = null;
  const publishedResult = async (published: PublicationPlan) => {
    const delivered = await deliveryAvailable(published.slots[0].imageId);
    return Response.json(delivered
      ? { ok: true, status: "published", slug: published.slug }
      : { ok: true, status: "published", slug: published.slug, imageDelivery: "unconfirmed" });
  };
  try {
    plan = await preparePublication(supabase, user.id, requestId, input);
    if (plan.state === "FINALIZED") return await publishedResult(plan);
    if (plan.state !== "ACTIVE") throw new PublicationBoundaryError(plan.state === "CANCELLED" ? "PUBLICATION_CANCELLED" : "CANCELLATION_PENDING", 409);
    if (!plan.parentValid || plan.slots.some(s => !s.metadataValid || s.state !== "RESERVED" || s.observation === "INACCESSIBLE")) {
      throw new PublicationBoundaryError("RECONCILIATION_UNAVAILABLE");
    }
    for (const [index, slot] of plan.slots.entries()) {
      if (slot.observation === "PRESENT") continue;
      const upload = await supabase.storage.from(PRIVATE_PROPERTY_IMAGE_BUCKET).upload(slot.path, input.files[index],
        { contentType: slot.mime, upsert: false });
      // A conflict/timeout may hide a committed object. Reconcile rather than
      // overwrite or allocate another path; there is no automatic second upload.
      plan = await inspectPublication(supabase, user.id, requestId, plan.fingerprint);
      if (plan.state !== "ACTIVE" || !plan.parentValid || plan.slots.some(s => !s.metadataValid)
        || plan.slots[index].observation !== "PRESENT") {
        throw new PublicationBoundaryError(upload.error ? "UPLOAD_FAILED" : "RECONCILIATION_UNAVAILABLE", 502);
      }
    }
    const published = await finalizePublication(supabase, user.id, plan);
    if (published.state !== "FINALIZED") throw new PublicationBoundaryError("RECONCILIATION_UNAVAILABLE");
    return await publishedResult(published);
  } catch (error) {
    if (plan) {
      try {
        const existing = await inspectPublication(supabase, user.id, requestId, plan.fingerprint);
        if (existing.state === "FINALIZED") return await publishedResult(existing);
      } catch { /* UNKNOWN retains the same attempt and quota; never delete here. */ }
    }
    const code = error instanceof PublicationBoundaryError ? error.code : "RECONCILIATION_UNAVAILABLE";
    const status = error instanceof PublicationBoundaryError ? error.status : 503;
    return failure(code, "No pudimos completar o confirmar el intento. Conserva estos datos para reintentarlo o solicita cancelar el intento pendiente.", status);
  }
}
