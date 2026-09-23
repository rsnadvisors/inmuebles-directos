import { imageExtensions, MAX_REQUEST_BYTES, PARTIAL_MESSAGE, PublicationValidationError, validatePublication } from "../../lib/publication";
import { getVerifiedUser } from "../../lib/auth-server";

export const runtime = "nodejs";
const failure = (code: string, message: string, status: number) => Response.json({ ok: false, code, message }, { status });
class BodyTooLarge extends Error {}

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
  let auth: Awaited<ReturnType<typeof getVerifiedUser>>;
  try { auth = await getVerifiedUser(); }
  catch { return failure("PUBLICATION_FAILED", "El servicio de publicación no está disponible.", 503); }
  const { client: supabase, user } = auth;
  if (!supabase || !user) return failure("AUTH_REQUIRED", "Inicia sesión para publicar una propiedad.", 401);
  if (!/^multipart\/form-data\s*;/i.test(request.headers.get("content-type") ?? "")) return failure("INVALID_CONTENT_TYPE", "El formato de la solicitud no es válido.", 415);
  const length = request.headers.get("content-length");
  if (length && /^\d+$/.test(length) && Number(length) > MAX_REQUEST_BYTES) return failure("REQUEST_TOO_LARGE", "La solicitud supera el tamaño permitido.", 413);
  let input: ReturnType<typeof validatePublication>;
  try { input = validatePublication(await readForm(request)); }
  catch (error) {
    if (error instanceof BodyTooLarge) return failure("REQUEST_TOO_LARGE", "La solicitud supera el tamaño permitido.", 413);
    if (error instanceof PublicationValidationError) return failure("VALIDATION_ERROR", error.message, 400);
    return failure("INVALID_REQUEST", "No se pudo leer el formulario.", 400);
  }
  let writeAttempted = false;
  try {
    const { files, ...propertyFields } = input;
    const slug = `${input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "propiedad"}-${crypto.randomUUID()}`;
    // Even a failed first response can conceal a committed INSERT.
    writeAttempted = true;
    const { data: property, error } = await supabase.from("properties").insert({ ...propertyFields, slug, country: "Peru", owner_id: user.id, agent_id: null, status: "published", published_at: new Date().toISOString() }).select("id").single();
    if (error || !property?.id) throw new Error("Property write uncertain");
    for (const [index, file] of files.entries()) {
      const path = `${user.id}/${property.id}/${crypto.randomUUID()}.${imageExtensions[file.type as keyof typeof imageExtensions]}`;
      const upload = await supabase.storage.from("property-images").upload(path, file, { contentType: file.type, upsert: false });
      if (upload.error) throw new Error("Upload uncertain");
      const { data } = supabase.storage.from("property-images").getPublicUrl(path);
      const image = await supabase.from("property_images").insert({ property_id: property.id, storage_path: path, public_url: data.publicUrl, sort_order: index, is_cover: index === 0 });
      if (image.error) throw new Error("Image write uncertain");
    }
    return Response.json({ ok: true, status: "published", slug });
  } catch {
    return writeAttempted ? failure("PARTIAL_OR_UNCERTAIN", PARTIAL_MESSAGE, 502) : failure("PUBLICATION_FAILED", "El servicio de publicación no está disponible.", 503);
  }
}
