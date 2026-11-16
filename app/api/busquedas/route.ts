import { getServerClient } from "../../lib/auth-server";
import { isSamePublicationOrigin } from "../../lib/request-origin";
import { JSON_BODY_TIMEOUT_MS, readBoundedBody } from "../../lib/bounded-body";
import { SEARCH_ZONES } from "../../lib/listing-events";

export const runtime = "nodejs";
const OPERATIONS = ["Todo", "Comprar", "Alquilar"];
const TYPES = ["Todo", "Casas", "Departamentos", "Terrenos", "Oficinas", "Locales comerciales"];
const ZONES = new Set(["ninguna", "otra", ...Object.values(SEARCH_ZONES)]);
const RESULTS = ["0", "1-5", "6-20", "21+"];

/** Suma una búsqueda agregada del mapa. Nunca recibe texto libre ni datos del visitante. */
export async function POST(request: Request): Promise<Response> {
  if (!isSamePublicationOrigin(request)) return new Response(null, { status: 403 });
  try {
    const input: unknown = JSON.parse(await (await readBoundedBody(request, 256, JSON_BODY_TIMEOUT_MS)).text());
    if (!input || typeof input !== "object") return new Response(null, { status: 400 });
    const { operation, type, zone, results } = input as Record<string, unknown>;
    if (Object.keys(input).sort().join(",") !== "operation,results,type,zone" || !OPERATIONS.includes(operation as string)
        || !TYPES.includes(type as string) || !ZONES.has(zone as string) || !RESULTS.includes(results as string)) {
      return new Response(null, { status: 400 });
    }
    const client = await getServerClient();
    if (client) await client.rpc("record_search", { p_operation: operation, p_type: type, p_zone: zone, p_results: results });
  } catch { /* best effort */ }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
