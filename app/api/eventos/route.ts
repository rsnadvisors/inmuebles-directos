import { getServerClient } from "../../lib/auth-server";
import { isSamePublicationOrigin } from "../../lib/request-origin";
import { JSON_BODY_TIMEOUT_MS, readBoundedBody } from "../../lib/bounded-body";
import { LISTING_ID } from "../../lib/listing-management";
import { LISTING_EVENT_KINDS, type ListingEventKind } from "../../lib/listing-events";

export const runtime = "nodejs";
const done = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

/** Recibe un evento de anuncio y lo suma al contador diario. La base solo cuenta anuncios publicados y no al dueño. */
export async function POST(request: Request): Promise<Response> {
  if (!isSamePublicationOrigin(request)) return new Response(null, { status: 403 });
  try {
    const input: unknown = JSON.parse(await (await readBoundedBody(request, 256, JSON_BODY_TIMEOUT_MS)).text());
    if (!input || typeof input !== "object") return new Response(null, { status: 400 });
    const { id, kind } = input as { id?: unknown; kind?: unknown };
    if (Object.keys(input).sort().join(",") !== "id,kind" || typeof id !== "string" || !LISTING_ID.test(id)
        || !LISTING_EVENT_KINDS.includes(kind as ListingEventKind)) return new Response(null, { status: 400 });
    // The visitor's own session (if any) lets the database skip the owner's own visits.
    const client = await getServerClient();
    if (client) await client.rpc("record_listing_event", { p_id: id, p_kind: kind });
  } catch { /* counting is best effort */ }
  return done();
}
